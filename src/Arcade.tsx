import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RotateCcw, Flag, Trophy, X, LogOut, Package, CarTaxiFront, SquareParking, Sparkles } from "lucide-react";
import { gameNames, games as specs, type Game, type Score } from "../shared/games.mjs";
import type { Project } from "./types";
import GuessGame from "./game/GuessGame";
import { api, type Board, type Games, type Entry } from "./game/useGames";
import Celebration from "./game/Celebration";
const symbols = ["✳", "◈", "⌘", "↗", "◉", "⌁"];
function shuffle() {
  const cards = [...symbols, ...symbols];
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
const time = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
export type WorldGame = "sprint" | "dispatch" | "taxi" | "parking" | "hunt";
const challenges: { id: WorldGame; icon: typeof Flag; text: string }[] = [
  { id: "sprint", icon: Flag, text: "7 checkpoints down Palm Avenue. Fastest lap wins." },
  { id: "dispatch", icon: Package, text: "Collect four parcels and deliver each one across the estate." },
  { id: "taxi", icon: CarTaxiFront, text: "Five minutes. Pick passengers up, drop them at their stop. Most trips wins." },
  { id: "parking", icon: SquareParking, text: "Park between the cones in three kerbside bays. Fewest scrapes wins." },
  { id: "hunt", icon: Sparkles, text: "Ten glowing a. tokens are hidden around the estate. Find them all." },
];
const tabLabel: Record<Game, string> = { sprint: "Sprint", dispatch: "Dispatch", taxi: "Taxi", parking: "Parking", hunt: "a. hunt", memory: "Memory", guess: "Guess" };
const rule: Record<Game, string> = {
  sprint: "Fastest time wins.",
  dispatch: "Fastest delivery run wins.",
  taxi: "Most trips in five minutes. Ties go to whoever finished their last trip first.",
  parking: "Fewest scrapes, then fastest time.",
  hunt: "Fastest to find all ten wins.",
  memory: "Fewest moves, then fastest time.",
  guess: "Most points, then fastest time.",
};
/** The headline number for a result, e.g. "12 trips" or "48.2s". */
export function headline(s: Score) {
  const g = specs[s.game];
  if (g.count === "none") return time(s.durationMs);
  const unit = s.moves === 1 && g.unit ? g.unit.replace(/s$/, "") : g.unit;
  return `${s.moves} ${unit}`;
}
function best(local: (Score & { rank: number })[], game: Game) {
  const b = local[0];
  if (!b) return "No score yet.";
  return `Your best: ${headline(b)}${specs[game].count !== "none" && game !== "taxi" ? ` · ${time(b.durationMs)}` : ""}`;
}
export default function Arcade({ onPlay, games, worldAvailable, projects }: { onPlay: (game: WorldGame) => void; games: Games; worldAvailable: boolean; projects: Project[] }) {
  const [cards, setCards] = useState(shuffle), [open, setOpen] = useState<number[]>([]), [matched, setMatched] = useState<number[]>([]), [moves, setMoves] = useState(0);
  const [phase, setPhase] = useState<"idle" | "countdown" | "playing" | "finished">("idle"), [countdown, setCountdown] = useState(3), [elapsed, setElapsed] = useState(0);
  const [selectedGame, setSelectedGame] = useState<Game>(games.result?.game || "sprint");
  const [scope, setScope] = useState<"local" | "global">("local");
  const [board, setBoard] = useState<Board | null>(null), [boardError, setBoardError] = useState("");
  const [refresh, setRefresh] = useState(0), [showAuth, setShowAuth] = useState(false), [authMode, setAuthMode] = useState<"login" | "register">("login"), [authError, setAuthError] = useState(""), [authBusy, setAuthBusy] = useState(false);
  const resultCard = useRef<HTMLElement>(null);
  useEffect(() => {
    if (games.result) resultCard.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }, [games.result?.id]);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null), clock = useRef(0), phaseRef = useRef(phase), mounted = useRef(true), flipLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timeout.current) clearTimeout(timeout.current); }; }, []);
  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    let raf = 0, last = performance.now(), shown = -1000;
    function frame(now: number) {
      const delta = document.hidden ? 0 : Math.min(100, now - last); last = now;
      clock.current += delta;
      if (phaseRef.current === "countdown") {
        setCountdown(Math.max(1, 3 - Math.floor(clock.current / 1000)));
        if (clock.current >= 3000) { clock.current = 0; phaseRef.current = "playing"; setPhase("playing"); }
      } else if (phaseRef.current === "playing" && clock.current - shown >= 100) {
        // The on-screen timer only needs ~10 updates a second.
        shown = clock.current;
        setElapsed(clock.current);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  useEffect(() => {
    if (scope !== "global") return;
    let cancelled = false;
    setBoard(null); setBoardError("");
    api<Board>(`/api/games/leaderboard?game=${selectedGame}`).then(d => { if (!cancelled) setBoard(d); }).catch(() => { if (!cancelled) setBoardError("Couldn’t load the shared leaderboard."); });
    return () => { cancelled = true; };
  }, [selectedGame, scope, games.version, refresh]);
  function flip(i: number) {
    if (phaseRef.current !== "playing" || flipLock.current || open.includes(i) || matched.includes(i)) return;
    const next = [...open, i]; setOpen(next);
    if (next.length !== 2) return;
    const newMoves = moves + 1; setMoves(newMoves);
    if (cards[next[0]] === cards[next[1]]) {
      const found = [...matched, ...next]; setMatched(found); setOpen([]);
      if (found.length === 12) {
        phaseRef.current = "finished"; setPhase("finished");
        games.finish("memory", clock.current, newMoves); setSelectedGame("memory");
      }
    } else {
      flipLock.current = true;
      timeout.current = setTimeout(() => { setOpen([]); flipLock.current = false; }, 750);
    }
  }
  async function reset() {
    if (games.busy) return;
    phaseRef.current = "idle"; setPhase("idle");
    if (timeout.current) clearTimeout(timeout.current);
    if (!await games.begin("memory") || !mounted.current) return;
    setCards(shuffle()); setOpen([]); setMatched([]); setMoves(0); setElapsed(0); clock.current = 0; flipLock.current = false;
    setCountdown(3); phaseRef.current = "countdown"; setPhase("countdown");
  }
  const local = games.localBoard(selectedGame);
  const rows: Entry[] = scope === "local" ? local : board?.entries || [];
  const latest = games.result;
  const rank = latest ? games.localBoard(latest.game).find(s => s.id === latest.id)?.rank : null;
  return <>
    <p className="eyebrow">Games</p>
    <h2>Take a break.<br /><span className="heading-accent">Beat your best.</span></h2>
    <p className="panel-intro">Drive, park, deliver and explore the neighbourhood, or test your memory. Your results stay in this browser; sign in before playing to join the shared leaderboard.</p>
    {latest && <section ref={resultCard} className="game-result" key={latest.id} aria-label="Game result" role="status">
      <Celebration /><button className="result-dismiss" aria-label="Dismiss result" onClick={games.dismissResult}><X size={16}/></button>
      <Trophy size={24}/><p className="eyebrow">{gameNames[latest.game]} · Complete</p>
      <strong>{headline(latest)}</strong>
      <p>{specs[latest.game].count !== "none" && latest.game !== "taxi" && `${time(latest.durationMs)} · `}#{rank} in this browser {rank === 1 ? "· Personal best!" : "· Keep climbing."}</p>
      <small>{latest.synced ? "Added to the signed-in leaderboard." : latest.attemptId ? "Saved locally · shared ranking pending" : "Saved in this browser. Sign in before your next game to compete with others."}</small>
      {latest.attemptId && !latest.synced && games.player?.id === latest.playerId && <button className="text-button" onClick={() => void games.sync(latest)}>Retry shared ranking <RotateCcw size={13}/></button>}
    </section>}
    {games.notice && <p className="arcade-notice" role="status">{games.notice}</p>}
    <p className="eyebrow section-label">In the neighbourhood</p>
    <div className="challenge-list">{challenges.map(({ id, icon: Icon, text }) => <article key={id} className="race-card"><Icon size={25}/><div><h3>{gameNames[id]}</h3><p>{text}</p><small>{best(games.localBoard(id), id)}</small></div><button className="round-button" aria-label={`Start ${gameNames[id]}`} disabled={games.busy || !worldAvailable} onClick={() => onPlay(id)}><ArrowUpRight/></button></article>)}</div>
    {!worldAvailable && <p className="arcade-notice">These games are available once the 3D world has loaded.</p>}
    <p className="eyebrow section-label">Quick games</p>
    <GuessGame games={games} projects={projects} />
    <div className="memory-header"><div><h3>Pattern recognition</h3><p>{phase === "idle" ? "Find six matching pairs. Fewer moves wins." : `${moves} moves · ${matched.length / 2}/6 pairs · ${time(elapsed)}`}</p></div><button className="text-button" disabled={games.busy} onClick={() => void reset()}>{phase !== "idle" ? <RotateCcw size={16}/> : <ArrowUpRight size={16}/>} {phase !== "idle" ? "Restart" : "Play"}</button></div>
    {phase !== "idle" && <div className="memory-stage"><div className="memory-grid">{cards.map((v, i) => <button key={i} aria-label={matched.includes(i) ? `Matched ${v}` : open.includes(i) ? v : `Reveal card ${i + 1}`} className={open.includes(i) || matched.includes(i) ? "revealed" : ""} disabled={phase !== "playing" || matched.includes(i)} onClick={() => flip(i)}>{open.includes(i) || matched.includes(i) ? v : "·"}</button>)}</div>{(phase === "countdown" || (phase === "playing" && elapsed < 500)) && <div className={`memory-countdown ${phase === "playing" ? "is-go" : ""}`} role="status" aria-live="assertive"><small>{phase === "countdown" ? "GET READY" : "FIND YOUR PAIRS"}</small><strong key={phase === "countdown" ? countdown : "go"}>{phase === "countdown" ? countdown : "GO!"}</strong></div>}</div>}
    <section className="scoreboard" aria-label="Game rankings">
      <div className="scoreboard-heading"><div><p className="eyebrow">Your results</p><h3>The leaderboard</h3></div><Trophy size={25}/></div>
      <div className="game-tabs" aria-label="Choose game">{(Object.keys(gameNames) as Game[]).map(g => <button key={g} aria-pressed={selectedGame === g} onClick={() => setSelectedGame(g)}>{tabLabel[g]}</button>)}</div>
      <div className="ranking-tabs" aria-label="Leaderboard scope"><button aria-pressed={scope === "local"} onClick={() => setScope("local")}>This browser <span>{local.length}</span></button><button aria-pressed={scope === "global"} onClick={() => setScope("global")}>Signed-in players</button></div>
      <p className="ranking-rule">{rule[selectedGame]} {scope === "global" ? "Best result per player." : "Your latest 200 completed games stay on this browser."}</p>
      {scope === "global" && !board && !boardError && <p className="ranking-empty" role="status">Loading rankings…</p>}
      {boardError && scope === "global" && <p className="ranking-empty" role="alert">{boardError} <button onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}
      {(scope === "local" || board) && !rows.length && <p className="ranking-empty">No scores yet. Finish a game to set the first score.</p>}
      {!!rows.length && <ol className="score-list">{rows.slice(0, 20).map(s => <li key={s.id} className={s.id === latest?.id || (scope === "global" && s.playerId === games.player?.id) ? "is-you" : ""}><span className="score-rank">#{s.rank}</span><div><strong>{scope === "local" ? (s.id === latest?.id ? "Your latest run" : "Your run") : s.username}</strong><small>{new Date(s.completedAt).toLocaleDateString(undefined, {month:"short",day:"numeric"})} · {new Date(s.completedAt).toLocaleTimeString(undefined, {hour:"2-digit",minute:"2-digit"})}</small></div><strong className="score-value">{specs[selectedGame].count !== "none" ? <>{headline(s)}<small>{time(s.durationMs)}</small></> : time(s.durationMs)}</strong></li>)}</ol>}
      {scope === "global" && board?.me && !rows.slice(0,20).some(s => s.playerId === games.player?.id) && <p className="ranking-rule">Your rank: #{board.me.rank} of {board.total} players.</p>}
      {scope === "local" && local.length > 20 && <p className="ranking-rule">Showing your top 20 of {local.length} saved sessions.</p>}
    </section>
    <section className="player-account">
      {games.player ? <><div><strong>Playing as {games.player.username}</strong><p>New games count toward the shared leaderboard.</p></div><button className="text-button" onClick={() => { void games.logout().catch(e => setAuthError(e.message)); }}><LogOut size={15}/> Sign out</button></> : <><div><strong>Play with a player account.</strong><p>Play as a guest, or sign in to compete with other players.</p></div><button className="text-button" onClick={() => setShowAuth(v => !v)}>{showAuth ? "Close" : "Sign in"} <ArrowUpRight size={16}/></button></>}
      {showAuth && !games.player && <form className="player-form" onSubmit={async e => {
        e.preventDefault(); setAuthBusy(true); setAuthError("");
        const form = e.currentTarget, data = new FormData(form);
        try { await games.authenticate(authMode, String(data.get("username")), String(data.get("password"))); form.reset(); setShowAuth(false); }
        catch (error) { setAuthError((error as Error).message); }
        finally { setAuthBusy(false); }
      }}><div className="game-tabs"><button type="button" aria-pressed={authMode === "login"} onClick={() => setAuthMode("login")}>Sign in</button><button type="button" aria-pressed={authMode === "register"} onClick={() => setAuthMode("register")}>Create player</button></div><label>Public username<input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoComplete="username" placeholder="Your leaderboard name"/></label><label>Password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={authMode === "register" ? "new-password" : "current-password"} placeholder="At least 10 characters"/></label><p>Your username and best scores appear publicly. Keep your password safe; password recovery isn’t available yet.</p><button className="primary-button" disabled={authBusy}>{authBusy ? "One moment…" : authMode === "login" ? "Sign in" : "Create player"}<ArrowUpRight size={16}/></button></form>}
      {authError && <p className="form-error" role="alert">{authError}</p>}
    </section>
  </>;
}
