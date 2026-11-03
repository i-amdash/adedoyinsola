import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, RotateCcw, Check, X } from "lucide-react";
import type { Project } from "../types";
import type { Games } from "./useGames";

// A frame from one of the portfolio covers starts heavily blurred and sharpens.
// Name the project sooner for more points: up to 1,000 a round, 0 for a miss.
const ROUND_MS = 8000;
const MAX_ROUNDS = 8;
type Round = { project: Project; options: string[] };
const cover = (p: Project) => p.poster || p.image;
function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pointsFor = (ms: number) => Math.max(100, Math.round(1000 * (1 - ms / ROUND_MS)));

export default function GuessGame({ games, projects }: { games: Games; projects: Project[] }) {
  const pool = useMemo(() => projects.filter((p) => cover(p) && p.title), [projects]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "countdown" | "playing" | "reveal" | "finished">("idle");
  const [countdown, setCountdown] = useState(3);
  const [roundMs, setRoundMs] = useState(0);
  const [points, setPoints] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const clock = useRef(0),
    round = useRef(0),
    phaseRef = useRef(phase),
    pointsRef = useRef(0),
    indexRef = useRef(0),
    roundsRef = useRef<Round[]>([]),
    shownMs = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const set = (p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing" && phase !== "reveal") return;
    let raf = 0,
      last = performance.now();
    const frame = (now: number) => {
      const delta = document.hidden ? 0 : Math.min(100, now - last);
      last = now;
      if (phaseRef.current === "countdown") {
        clock.current += delta;
        setCountdown(Math.max(1, 3 - Math.floor(clock.current / 1000)));
        if (clock.current >= 3000) {
          clock.current = 0;
          round.current = 0;
          shownMs.current = 0;
          set("playing");
        }
      } else {
        clock.current += delta;
        if (phaseRef.current === "playing") {
          round.current += delta;
          // ~20 updates a second; a CSS transition keeps the blur smooth in between.
          if (round.current - shownMs.current >= 50) {
            shownMs.current = round.current;
            setRoundMs(round.current);
          }
          if (round.current >= ROUND_MS) answer(null);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  async function play() {
    if (games.busy || pool.length < 4) return;
    if (timer.current) clearTimeout(timer.current);
    set("idle");
    if (!(await games.begin("guess"))) return;
    const chosen = shuffle(pool).slice(0, Math.min(MAX_ROUNDS, pool.length));
    for (const p of chosen) new Image().src = cover(p);
    roundsRef.current = chosen.map((project) => ({
      project,
      options: shuffle([project.title, ...shuffle(pool.filter((p) => p.id !== project.id)).slice(0, 3).map((p) => p.title)]),
    }));
    setRounds(roundsRef.current);
    indexRef.current = 0;
    setIndex(0);
    setPoints(0);
    pointsRef.current = 0;
    setPicked(null);
    setRoundMs(0);
    clock.current = 0;
    setCountdown(3);
    set("countdown");
  }
  function answer(title: string | null) {
    if (phaseRef.current !== "playing") return;
    const r = roundsRef.current[indexRef.current];
    const gained = title === r.project.title ? pointsFor(round.current) : 0;
    pointsRef.current += gained;
    setPoints(pointsRef.current);
    setPicked(title ?? "");
    set("reveal");
    timer.current = setTimeout(() => {
      if (indexRef.current + 1 >= roundsRef.current.length) {
        set("finished");
        games.finish("guess", clock.current, pointsRef.current);
        return;
      }
      indexRef.current++;
      setIndex(indexRef.current);
      setPicked(null);
      round.current = 0;
      shownMs.current = 0;
      setRoundMs(0);
      set("playing");
    }, 1100);
  }
  const r = rounds[index];
  const blur = phase === "reveal" || phase === "finished" ? 0 : Math.max(0, 26 * (1 - roundMs / ROUND_MS));
  const label = phase === "idle" || phase === "finished" ? (phase === "finished" ? `${points} points · play again?` : "Name the project as its cover sharpens. Faster answers score more.") : `Round ${index + 1}/${rounds.length} · ${points} points`;
  return (
    <section className="guess-game" aria-label="Guess the project">
      <div className="memory-header">
        <div>
          <h3>Guess the project</h3>
          <p>{label}</p>
        </div>
        <button className="text-button" disabled={games.busy || pool.length < 4} onClick={() => void play()}>
          {phase !== "idle" ? <RotateCcw size={16} /> : <ArrowUpRight size={16} />} {phase !== "idle" ? "Restart" : "Play"}
        </button>
      </div>
      {pool.length < 4 && <p className="arcade-notice">Add covers to at least four projects to play.</p>}
      {phase !== "idle" && r && (
        <div className="memory-stage guess-stage">
          <div className="guess-frame">
            <img src={cover(r.project)} alt="" style={{ filter: `blur(${blur.toFixed(1)}px) saturate(${0.4 + 0.6 * (1 - blur / 26)})` }} />
            {phase !== "countdown" && <i className="guess-timer" style={{ transform: `scaleX(${phase === "playing" ? 1 - roundMs / ROUND_MS : 0})` }} />}
          </div>
          <div className="guess-options">
            {r.options.map((o) => {
              const state = phase === "reveal" || phase === "finished" ? (o === r.project.title ? "is-right" : o === picked ? "is-wrong" : "") : "";
              return (
                <button key={o} className={state} disabled={phase !== "playing"} onClick={() => answer(o)}>
                  {state === "is-right" && <Check size={14} />}
                  {state === "is-wrong" && <X size={14} />}
                  {o}
                </button>
              );
            })}
          </div>
          {phase === "countdown" && (
            <div className="memory-countdown" role="status" aria-live="assertive">
              <small>GET READY</small>
              <strong key={countdown}>{countdown}</strong>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
