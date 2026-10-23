import { useCallback, useEffect, useRef, useState } from "react";
import { rankScores, validScore, type Game, type Score } from "../../shared/games.mjs";
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
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
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
  const attempt = useRef<{ id: string; game: Game; attemptId?: string; playerId?: string } | null>(null);
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
    const next: NonNullable<typeof attempt.current> = { id: crypto.randomUUID(), game };
    try {
      if (playerRef.current) {
        try {
          const a = await api<{id: string}>("/api/games/attempts", { game });
          next.attemptId = a.id; next.playerId = playerRef.current.id;
        } catch { setNotice("Shared rankings are unavailable. This game will still be saved in this browser."); }
      }
      attempt.current = next;
      return true;
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
    const a = attempt.current;
    if (!a || a.game !== game) return;
    attempt.current = null;
    const s: Result = { ...a, durationMs: Math.round(durationMs), ...(game === "memory" ? {moves} : {}), completedAt: new Date().toISOString() };
    if (!validScore(s)) { setNotice("This run could not be recorded. Please start a new game."); return; }
    // Include other tabs' completed sessions without duplicating this one.
    const combined = new Map([...readHistory(), ...historyRef.current, s].map(h => [h.id, h]));
    save([...combined.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt)));
    setResult(s); setVersion(v => v + 1);
    void sync(s);
  }, [save, sync]);
  function localBoard(game: Game) { return rankScores(history.filter(s => s.game === game)); }
  return { player, history, result, notice, version, busy, authenticate, logout, begin, finish, sync, localBoard, dismissResult: () => setResult(null) };
}
export type Games = ReturnType<typeof useGames>;
