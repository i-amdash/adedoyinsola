import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rankScores, validScore, usesCount, type Game, type Score } from "../../shared/games.mjs";
export type Player = { id: string; username: string };
export type Result = Score & { id: string; attemptId?: string; playerId?: string; synced?: boolean };
export type Entry = Result & { rank: number; username?: string };
export type Board = { entries: Entry[]; me: Entry | null; total: number };
const KEY = "avenue-game-history-v1";
export function readHistory(): Result[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data) ? data.filter(s => validScore(s) && typeof s.id === "string" && typeof s.completedAt === "string").slice(-200) : [];
  } catch { return []; }
}
/** AbortSignal.timeout isn't in Safari before 16. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  if (typeof AbortController === "undefined") return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
/** crypto.randomUUID needs a secure context (https) and Safari 15.4+. */
export function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* fall through */ }
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: timeoutSignal(10000) });
  } catch {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  }
  // A proxy or platform error page is HTML, not JSON: never show raw parser errors.
  const data = (r.headers.get("content-type") || "").includes("json") ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new Error((data as { error?: string }).error || "The server is busy. Please try again.");
  return data as T;
}
export function useGames() {
  const [player, setPlayer] = useState<Player | null>(null);
  const playerRef = useRef<Player | null>(null);
  const [history, setHistory] = useState(readHistory);
  const historyRef = useRef(history);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  // One pending attempt per game, so a quick game started mid-mission can't erase the other's result.
  const attempts = useRef(new Map<Game, { id: string; game: Game; attemptId?: string; playerId?: string }>());
  const starting = useRef(false);
  const save = useCallback((results: Result[]) => {
    historyRef.current = results.slice(-200);
    setHistory(historyRef.current);
    try { localStorage.setItem(KEY, JSON.stringify(historyRef.current)); }
    catch { setNotice("Browser storage is unavailable. This result will last until you close this page."); }
  }, []);
  useEffect(() => {
    api<{ player: Player | null }>("/api/players/session").then(d => { playerRef.current = d.player; setPlayer(d.player); }).catch(() => {});
    const changed = (e: StorageEvent) => { if (e.key === KEY) { const h = readHistory(); historyRef.current = h; setHistory(h); } };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  async function authenticate(mode: "login" | "register", username: string, password: string) {
    const d = await api<{player: Player}>(`/api/players/${mode}`, { username, password });
    playerRef.current = d.player; setPlayer(d.player); setVersion(v => v + 1); setNotice("");
  }
  async function logout() {
    await api("/api/players/logout", {});
    playerRef.current = null; setPlayer(null); setVersion(v => v + 1);
  }
  async function begin(game: Game) {
    if (starting.current) return false;
    starting.current = true; setBusy(true); setNotice(""); setResult(null);
    try {
      const next: { id: string; game: Game; attemptId?: string; playerId?: string } = { id: uuid(), game };
      if (playerRef.current) {
        try {
          const a = await api<{id: string}>("/api/games/attempts", { game });
          next.attemptId = a.id; next.playerId = playerRef.current.id;
        } catch { setNotice("Shared rankings are unavailable. This game will still be saved in this browser."); }
      }
      attempts.current.set(game, next);
      return true;
    } catch {
      setNotice("This game couldn’t start. Please try again.");
      return false;
    } finally { starting.current = false; setBusy(false); }
  }
  const sync = useCallback(async (s: Result) => {
    if (!s.attemptId || s.synced || s.playerId !== playerRef.current?.id) return;
    try {
      await api("/api/games/results", { attemptId: s.attemptId, game: s.game, durationMs: s.durationMs, moves: s.moves });
      const updated = { ...s, synced: true };
      save(historyRef.current.map(h => h.id === s.id ? updated : h));
      setResult(r => r?.id === s.id ? updated : r);
      setVersion(v => v + 1); setNotice("");
    } catch (e) { setNotice(`Saved in this browser. Shared ranking: ${(e as Error).message}`); }
  }, [save]);
  const finish = useCallback((game: Game, durationMs: number, moves?: number) => {
    const a = attempts.current.get(game);
    if (!a) return;
    attempts.current.delete(game);
    const s: Result = { ...a, durationMs: Math.round(durationMs), ...(usesCount(game) ? {moves} : {}), completedAt: new Date().toISOString() };
    if (!validScore(s)) { setNotice("This run could not be recorded. Please start a new game."); return; }
    // Include other tabs' completed sessions without duplicating this one.
    const combined = new Map([...readHistory(), ...historyRef.current, s].map(h => [h.id, h]));
    save([...combined.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt)));
    setResult(s); setVersion(v => v + 1);
    void sync(s);
  }, [save, sync]);
  // Rankings are recomputed only when the history changes, not on every render.
  const boards = useMemo(() => new Map<Game, ReturnType<typeof rankScores<Result>>>(), [history]);
  function localBoard(game: Game) {
    let b = boards.get(game);
    if (!b) boards.set(game, (b = rankScores(history.filter(s => s.game === game))));
    return b;
  }
  return { player, history, result, notice, version, busy, authenticate, logout, begin, finish, sync, localBoard, dismissResult: () => setResult(null) };
}
export type Games = ReturnType<typeof useGames>;
