import { createSessions } from "./sessions.mjs";
import { createCloudPlayers } from "./cloud-players.mjs";
import { rateOptions } from "./cloud.mjs";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { compareScores, rankScores, validScore, gameNames } from "../shared/games.mjs";
const derive = promisify(scrypt);
const credentials = z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores"), password: z.string().min(10).max(128) });
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicPlayer = ({ id, username }) => ({ id, username });
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${(await derive(password, salt, 64)).toString("hex")}`;
}
async function verify(password, hash) {
  const actual = await passwordHash(password, hash.split(":")[0]);
  const a = Buffer.from(actual), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createPlayerStore(directory) {
  const file = path.join(directory, "players.json");
  let queue = Promise.resolve();
  async function read() {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return { players: [], attempts: [], scores: [] }; throw e; }
  }
  function update(fn) {
    const task = queue.then(async () => {
      const data = await read();
      const result = await fn(data);
      await mkdir(directory, { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
      await rename(file + ".tmp", file);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  return { read, update };
}
export function mountPlayers(app, { directory, production, now = Date.now, supabase = null }) {
  const store = createPlayerStore(directory), sessions = createSessions(supabase, now);
  const cloud = supabase ? createCloudPlayers(supabase, now) : null;
  const cookie = production ? "__Host-avenue_player" : "avenue_player";
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict", path: "/" };
  const raw = req => req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(cookie + "="))?.slice(cookie.length + 1);
  const session = req => sessions.read(raw(req), "player");
  const requirePlayer = async (req, _res, next) => { req.player = await session(req); next(req.player ? undefined : fail(401, "Sign in to enter the shared leaderboard.")); };
  async function signIn(res, player) {
    const token = await sessions.issue("player", publicPlayer(player), 7 * 86400000);
    res.cookie(cookie, token, { ...cookieOptions, maxAge: 7 * 86400000 });
    res.json({ player: publicPlayer(player) });
  }
  const authLimit = rateLimit(rateOptions(supabase, "player-auth", { windowMs: 15 * 60000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Try again in 15 minutes." } }));
  app.get("/api/players/session", async (req, res) => res.json({ player: await session(req) }));
  app.post("/api/players/register", authLimit, async (req, res) => {
    const input = credentials.safeParse(req.body);
    if (!input.success) throw fail(400, "Use a username with 3–24 letters, numbers or underscores and a password of 10–128 characters.");
    const { username, password } = input.data;
    const hash = await passwordHash(password);
    const player = cloud ? await cloud.register(username, hash) : await store.update(data => {
      if (data.players.some(p => p.username.toLowerCase() === username.toLowerCase())) throw fail(409, "That username is already taken.");
      const p = { id: randomUUID(), username, hash };
      data.players.push(p); return p;
    });
    await signIn(res, player);
  });
  const dummyHash = awaitableDummy();
  function awaitableDummy() { return passwordHash(randomBytes(32).toString("hex")); }
  app.post("/api/players/login", authLimit, async (req, res) => {
    const input = credentials.safeParse(req.body);
    if (!input.success) throw fail(401, "Username or password is incorrect.");
    const player = cloud ? await cloud.find(input.data.username) : (await store.read()).players.find(p => p.username.toLowerCase() === input.data.username.toLowerCase());
    const correct = await verify(input.data.password, player?.hash || await dummyHash);
    if (!player || !correct) throw fail(401, "Username or password is incorrect.");
    await signIn(res, player);
  });
  app.post("/api/players/logout", async (req, res) => {
    await sessions.revoke(raw(req)); res.clearCookie(cookie, cookieOptions); res.json({ ok: true });
  });
  app.post("/api/games/attempts", requirePlayer, rateLimit(rateOptions(supabase, "game-start", { windowMs: 60000, limit: 30, message: { error: "Please wait before starting another ranked game." } })), async (req, res) => {
    if (!Object.hasOwn(gameNames, req.body?.game || "")) throw fail(400, "Unknown game.");
    const attempt = cloud ? await cloud.startAttempt(req.player.id, req.body.game) : await store.update(data => {
      data.attempts = data.attempts.filter(a => a.expires > now() && !(a.playerId === req.player.id && a.game === req.body.game));
      const a = { id: randomUUID(), game: req.body.game, playerId: req.player.id, startsAt: now() + 3000, expires: now() + 3610000 };
      data.attempts.push(a); return a;
    });
    res.json({ id: attempt.id });
  });
  app.post("/api/games/results", requirePlayer, async (req, res) => {
    const { attemptId, game, durationMs, moves } = req.body || {};
    if (!validScore({ game, durationMs, moves }) || typeof attemptId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(attemptId)) throw fail(400, "Invalid game result.");
    const score = cloud ? await cloud.finish(req.player.id, req.body) : await store.update(data => {
      const existing = data.scores.find(s => s.id === attemptId && s.playerId === req.player.id);
      if (existing) return existing; // Retrying a failed connection cannot duplicate a score.
      const a = data.attempts.find(a => a.id === attemptId && a.playerId === req.player.id && a.game === game);
      if (!a || a.expires <= now()) throw fail(409, "This ranked attempt has expired. Start a new game.");
      if (now() - a.startsAt + 500 < durationMs) throw fail(400, "The game has not run long enough for this result.");
      const result = { id: a.id, playerId: req.player.id, game, durationMs, ...(game === "memory" ? { moves } : {}), completedAt: new Date(now()).toISOString() };
      data.scores.push(result);
      data.attempts = data.attempts.filter(other => other.id !== a.id);
      return result;
    });
    res.json({ score });
  });
  app.get("/api/games/leaderboard", async (req, res) => {
    const game = req.query.game;
    if (typeof game !== "string" || !Object.hasOwn(gameNames, game)) throw fail(400, "Unknown game.");
    const player = await session(req);
    if (cloud) return res.json(await cloud.leaderboard(game, player?.id));
    const data = await store.read(), best = new Map();
    for (const s of data.scores.filter(s => s.game === game)) {
      if (!best.has(s.playerId) || compareScores(s, best.get(s.playerId)) < 0) best.set(s.playerId, s);
    }
    const players = new Map(data.players.map(p => [p.id, p.username]));
    const ranked = rankScores([...best.values()]).map(s => ({ ...s, username: players.get(s.playerId) || "Player" }));
    res.json({ entries: ranked.slice(0, 50), total: ranked.length, me: ranked.find(s => s.playerId === player?.id) || null });
  });
}
