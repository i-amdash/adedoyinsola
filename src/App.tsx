import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Map as MapIcon,
  Volume2,
  VolumeX,
  Settings2,
  X,
  ChevronRight,
  Compass,
  Mail,
  Github,
  Linkedin,
  Maximize2,
  Minimize2,
  CarFront,
  Footprints,
  Gamepad2,
  Navigation,
  RotateCcw,
  Sun,
  Check,
  AlertCircle,
  Moon,
  Sunrise,
  Crosshair,
} from "lucide-react";
import type { World } from "./world/World";
import type { Quality, TimeOfDay } from "./world/Atmosphere";
import Radar from "./Radar";
import Joystick from "./Joystick";
import {
  destinations,
  type Content,
  type Destination,
  type Telemetry,
} from "./types";
import Map from "./Map";
import Arcade from "./Arcade";
import Projects from "./Projects";
import { useGames } from "./game/useGames";
const initial: Telemetry = {
  x: 3.3,
  z: 86,
  speed: 0,
  heading: 0,
  near: null,
  mode: "drive",
  checkpoint: 0,
  elapsed: 0,
  race: "idle",
};
const icons = {
  about: Compass,
  projects: ArrowUpRight,
  arcade: Gamepad2,
  contact: Mail,
};
export default function App() {
  const games = useGames();
  const [content, setContent] = useState<Content | null>(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [started, setStarted] = useState(false),
    [panel, setPanel] = useState<Destination | "map" | "settings" | null>(null),
    [telemetry, setTelemetry] = useState(initial),
    [quality, setQuality] = useState<Quality>("ultra"),
    [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("golden"),
    [progress, setProgress] = useState(0),
    [title, setTitle] = useState<Destination | null>(null),
    [sound, setSound] = useState(false),
    [full, setFull] = useState(false),
    [worldError, setWorldError] = useState(false),
    [copied, setCopied] = useState(false),
    [toast, setToast] = useState("");
  const host = useRef<HTMLDivElement>(null),
    world = useRef<World | null>(null),
    lastNear = useRef<Destination | null>(null),
    modal = useRef<HTMLDivElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const startedRef = useRef(false),
    lastRace = useRef("idle");
  useEffect(() => {
    fetch("/api/content")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setContent)
      .catch(() =>
        setError(
          "The content server is unavailable. Please start the backend and reload.",
        ),
      );
  }, []);
  useEffect(() => {
    let disposed = false;
    import("./world/World").then(({ World }) => {
      if (disposed || !host.current) return;
      try {
        const params = new URLSearchParams(location.search);
        const q = params.get("quality"),
          t = params.get("time");
        world.current = new World(host.current, {
          update: setTelemetry,
          enter: setPanel,
          map: () => setPanel((p) => (p === "map" ? null : "map")),
          error: () => setWorldError(true),
          progress: setProgress,
          message: setToast,
          time: setTimeOfDay,
          quality: (q) => {
            setQuality(q);
            setToast(
              q === "low"
                ? "Switched to performance graphics to keep things smooth."
                : "Lowered graphics slightly to keep things smooth.",
            );
          },
        }, {
          quality: q === "ultra" || q === "high" || q === "low" ? q : undefined,
          time: t === "day" || t === "golden" || t === "night" ? t : undefined,
        });
        setQuality(world.current.quality);
        setTimeOfDay(world.current.atmosphere.time);
        (window as unknown as { __world?: World }).__world = world.current;
        world.current.manager.onLoad = () => {
          setProgress(1);
          setReady(true);
        };
        // Never trap visitors behind a slow asset: the world is usable after 12s regardless.
        setTimeout(() => setReady(true), 12000);
      } catch (e) {
        console.error("World initialization failed", e);
        setWorldError(true);
        setReady(true);
      }
    });
    return () => {
      disposed = true;
      world.current?.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    if (world.current) {
      world.current.paused = !!panel;
      world.current.keys.clear();
    }
    if (panel) {
      previousFocus.current = document.activeElement as HTMLElement;
      closeButton.current?.focus();
    } else previousFocus.current?.focus();
  }, [panel]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        world.current?.keys.clear();
      }
      if (e.key === "Tab" && modal.current && panel) {
        const all = modal.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        );
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panel]);
  useEffect(() => {
    if (telemetry.race === "finished" && lastRace.current !== "finished") {
      games.finish("sprint", telemetry.elapsed * 1000);
      setPanel("arcade");
    }
    lastRace.current = telemetry.race;
  }, [telemetry, games.finish]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const change = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    // A cinematic title card the first time the visitor pulls up at a place.
    if (started && telemetry.near && telemetry.near !== lastNear.current) {
      setTitle(telemetry.near);
      const t = setTimeout(() => setTitle(null), 3600);
      lastNear.current = telemetry.near;
      return () => clearTimeout(t);
    }
    if (!telemetry.near) lastNear.current = null;
  }, [telemetry.near, started]);
  function start() {
    setStarted(true);
    startedRef.current = true;
    world.current?.enter();
    (document.activeElement as HTMLElement)?.blur();
    if (worldError) setPanel("about");
  }
  function travel(d: Destination) {
    if (worldError) {
      setPanel(d);
      return;
    }
    start();
    world.current?.travel(d);
    setPanel(null);
    setToast(
      `Arrived at ${destinations.find((x) => x.id === d)?.place}. Tap the place name or press E to open.`,
    );
  }
  async function startSprint() {
    if (!world.current || worldError || !ready || !await games.begin("sprint")) return;
    start();
    world.current.startRace();
    setPanel(null);
    setToast("Drive through all 7 green gates. Get ready…");
  }
  async function toggleAudio() {
    try {
      await world.current?.setSound(!sound);
      setSound(!sound);
    } catch {
      setToast("Sound is not available in this browser.");
    }
  }
  function changeTime(t: TimeOfDay) {
    setTimeOfDay(t);
    world.current?.setTime(t);
  }
  function setWaypoint(d: Destination) {
    world.current?.setWaypoint(d);
    start();
    setPanel(null);
    setToast(
      `GPS set to ${destinations.find((x) => x.id === d)?.place}. Follow the purple line.`,
    );
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setToast("Fullscreen is not supported in this browser.");
    }
  }
  const near = destinations.find((d) => d.id === telemetry.near);
  function touchKey(key: string, down: boolean) {
    if (down) world.current?.keys.add(key);
    else world.current?.keys.delete(key);
  }
  if (error)
    return (
      <main className="error-screen">
        <AlertCircle />
        <h1>One moment.</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  return (
    <main
      className={`experience ${started ? "is-playing" : ""}`}
      style={
        content
          ? ({ "--accent": content.world.accent } as React.CSSProperties)
          : undefined
      }
    >
      <div className="world-canvas" ref={host} />
      <div className="world-shade" />
      <div className="film-grain" />
      <div className="interface" inert={!!panel}>
        <header className="topbar">
          <a className="brand" href="/" aria-label="Adedoyinsola home">
            <span className="brand-mark">
              a<span>.</span>
            </span>
            <span className="brand-name">
              ADEDOYINSOLA<span>WEB & MOBILE APP DEVELOPER</span>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Portfolio">
            {destinations.map((d) => (
              <button key={d.id} onClick={() => setPanel(d.id)}>
                {d.name}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </nav>
          <button className="map-top" aria-label="Explore the map" onClick={() => setPanel("map")}>
            <MapIcon size={16} />
            <span>Explore the map</span>
            <kbd>M</kbd>
          </button>
        </header>
        {!started && (
          <section className="hero">
            <div className="eyebrow hero-eyebrow">
              <span className="live-dot" />
              {content?.world.welcome || "From your vision to a working product"}
            </div>
            <h1>
              {(content?.world.title || "Your vision.\nBrought to life.")
                .split("\n")
                .map((line, i) => (
                  <span key={i} className={i ? "heading-accent" : ""}>
                    {line}
                  </span>
                ))}
            </h1>
            <p className="hero-role">
              {content?.profile.role || "Web & mobile app developer"}
            </p>
            <p className="hero-description">
              {content?.world.subtitle ||
                "You bring the idea. I bring it to life as a website, online store, custom platform, or mobile app."}
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setPanel("contact")}>
                Bring your idea to life <ArrowUpRight size={20} />
              </button>
              <button className="browse-button" onClick={() => setPanel("projects")}>
                See my work <ArrowRight size={16} />
              </button>
            </div>
            <div className="hero-note">
              <span className="tiny-line" />
              <button disabled={!ready || !content} onClick={start}>
                {!ready ? `Loading my interactive world… ${Math.round(progress * 100)}%` : worldError ? "Explore my portfolio" : "Or take a walk through my interactive world"}
                <ArrowUpRight size={14}/>
              </button>
            </div>
          </section>
        )}
        {!started && (
          <div className="location-tag">
            <span className="location-cross">+</span>
            <div>
              <span>THE NEIGHBOURHOOD</span>
              <strong>{content?.world.district || "Palm Avenue"}</strong>
              <small>Inspired by the streets of Lagos.</small>
            </div>
          </div>
        )}
        {started && (
          <>
            <div className="playing-label">
              <span className="live-dot" />
              <span>{content?.world.district || "Palm Avenue"}</span>
              <span className="divider" />
              <span>
                {telemetry.mode === "drive" ? "Free drive" : "On foot"}
              </span>
            </div>
            {near && telemetry.race !== "running" && telemetry.race !== "countdown" && (
              <button
                className="interaction-prompt"
                onClick={() => setPanel(near.id)}
              >
                <span
                  className="destination-icon"
                  style={{ background: near.color }}
                >
                  {near.symbol}
                </span>
                <span>
                  <small>YOU’VE ARRIVED</small>
                  <strong>{near.place}</strong>
                </span>
                <kbd>E</kbd>
                <ChevronRight size={18} />
              </button>
            )}
            {(telemetry.race === "running" || telemetry.race === "countdown") && (
              <div className="race-hud">
                <span>AVENUE SPRINT</span>
                <strong>
                  {telemetry.elapsed.toFixed(1)}
                  <small>s</small>
                </strong>
                <p>
                  Checkpoint {Math.min(telemetry.checkpoint + 1, 7)} / 7 ·
                  Follow the green gates
                </p>
                <button
                  onClick={() => {
                    world.current?.reset();
                    setToast("Sprint ended. Back to exploring.");
                  }}
                >
                  End sprint
                </button>
              </div>
            )}
            <div className="speedometer">
              <strong>
                {Math.round(telemetry.speed).toString().padStart(2, "0")}
              </strong>
              <span>{telemetry.mode === "drive" ? "KM/H" : "ON FOOT"}</span>
              <div className="speed-line">
                <i
                  style={{
                    width: `${Math.min(100, (telemetry.speed / 97) * 100)}%`,
                  }}
                />
              </div>
              <button aria-label={telemetry.mode === "drive" ? "Step outside" : "Return to car"} disabled={telemetry.race === "countdown" || telemetry.race === "running"} onClick={() => world.current?.toggleMode()}>
                {telemetry.mode === "drive" ? (
                  <Footprints size={16} />
                ) : (
                  <CarFront size={16} />
                )}
                <span>
                  {telemetry.mode === "drive"
                    ? "Step outside"
                    : "Return to car"}
                </span>
                <kbd>F</kbd>
              </button>
            </div>
            <div className="touch-controls">
              <Joystick
                label={telemetry.mode === "drive" ? "Drive: push up to accelerate, down to brake or reverse, sideways to steer" : "Walk: push in any direction, push fully to run"}
                onMove={(x, y) => world.current?.setStick(x, y)}
              />
              {telemetry.mode === "drive" && (
                <button
                  className="touch-brake"
                  aria-label="Handbrake"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    touchKey(" ", true);
                  }}
                  onPointerUp={() => touchKey(" ", false)}
                  onPointerCancel={() => touchKey(" ", false)}
                  onLostPointerCapture={() => touchKey(" ", false)}
                >
                  Brake
                </button>
              )}
            </div>
          </>
        )}
        {started && <div className="bottom-left">
          <div className="radar-wrap">
            <Radar world={world} onOpen={() => setPanel("map")} />
            <div className="radar-bars" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (telemetry.speed / 118) * 100)}%` }} /><i />
            </div>
          </div>
          <div className="controls-hint">
            <div><kbd>W</kbd><span className="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div>
            <span>{telemetry.mode === "drive" ? "Drive · Space to brake" : "Walk · Shift to run"}<br />
              <small>Drag to look · F to {telemetry.mode === "drive" ? "step outside" : "return to your car"}</small>
            </span>
          </div>
        </div>}
        <div className="world-tools">
          <span className="world-status">
            <i />
            SINGLE PLAYER
          </span>
          <div className="tool-buttons">
            <button
              aria-label={`Time of day: ${timeOfDay}. Change time.`}
              title="Time of day (T)"
              onClick={() =>
                changeTime(
                  timeOfDay === "golden" ? "night" : timeOfDay === "night" ? "day" : "golden",
                )
              }
            >
              {timeOfDay === "night" ? (
                <Moon size={17} />
              ) : timeOfDay === "golden" ? (
                <Sunrise size={17} />
              ) : (
                <Sun size={17} />
              )}
            </button>
            <button
              aria-label={sound ? "Mute ambient sound" : "Enable ambient sound"}
              title="Ambient sound"
              onClick={toggleAudio}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              aria-label="World settings"
              title="Settings"
              onClick={() => setPanel("settings")}
            >
              <Settings2 size={17} />
            </button>
            <button
              className="fullscreen-tool"
              aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}
              title="Fullscreen"
              onClick={fullscreen}
            >
              {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
          <span className="world-version">
            ADEDOYINSOLA · WEB & MOBILE
          </span>
        </div>
        <footer className="bottom-bar">
          <span>
            © {new Date().getFullYear()}{" "}
            {content?.profile.name || "Adedoyinsola"}
          </span>
          <span>
            <i />
            {content?.profile.availability || "Available for website & app projects"}
          </span>
          <button onClick={() => setPanel("contact")}>
            Let’s bring your vision to life <ArrowUpRight size={13} />
          </button>
        </footer>
      </div>
      {(telemetry.race === "countdown" || (telemetry.race === "running" && telemetry.elapsed < 0.5)) && !panel && <div className="race-countdown" role="status" aria-live="assertive"><small>AVENUE SPRINT · GET READY</small><strong key={telemetry.race === "countdown" ? telemetry.countdown : "go"}>{telemetry.race === "countdown" ? telemetry.countdown || 3 : "GO!"}</strong><p>W / ↑ to accelerate · A D / ← → to steer</p></div>}
      {title && started && !panel && telemetry.race === "idle" && (
        <div className="arrival-title" aria-hidden="true" key={title}>
          <strong>{destinations.find((d) => d.id === title)?.place}</strong>
          <small>{destinations.find((d) => d.id === title)?.name} · press E</small>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {worldError && !panel && (
        <div className="webgl-notice" role="status">
          3D rendering isn’t available here. All portfolio content is available
          through the navigation.
        </div>
      )}
      {panel && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPanel(null);
          }}
        >
          <div
            ref={modal}
            className={`content-panel ${panel === "map" ? "map-panel" : panel === "projects" ? "gallery-panel" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              panel === "map"
                ? "City map"
                : panel === "settings"
                  ? "World settings"
                  : destinations.find((d) => d.id === panel)?.name
            }
          >
            <div className="panel-top">
              <span>
                <span className="live-dot" />
                {panel === "map"
                  ? "CHOOSE A DESTINATION"
                  : panel === "settings"
                    ? "DISPLAY & CONTROLS"
                    : destinations
                        .find((d) => d.id === panel)
                        ?.place.toUpperCase()}
              </span>
              <button
                className="round-button"
                ref={closeButton}
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="panel-body" key={panel}>
              {!content ? (
                <p>Loading content…</p>
              ) : (
                <>
                  {panel === "about" && (
                    <>
                      <p className="eyebrow">
                        About me
                      </p>
                      <h2>
                        Hi, I’m
                        <br />
                        <span className="heading-accent">{content.profile.name.split(" ")[0]}.</span>
                      </h2>
                      <div className="about-monogram">
                        a.<span>WEB & MOBILE DEVELOPMENT</span>
                        <i>↗</i>
                      </div>
                      <p className="profile-tagline">
                        {content.profile.tagline}
                      </p>
                      <p className="panel-intro">{content.profile.bio}</p>
                      <div className="service-list">
                        {content.services.map((s, i) => (
                          <article key={i}>
                            <div>
                              <h3>{s.title}</h3>
                              <p>{s.description}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                      <p className="eyebrow section-label">
                        Technologies I work with
                      </p>
                      <div className="tags">
                        {content.profile.skills.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                      <button
                        className="primary-button panel-cta"
                        onClick={() => setPanel("contact")}
                      >
                        Bring your idea to life
                        <ArrowUpRight size={18} />
                      </button>
                    </>
                  )}
                  {panel === "projects" && <Projects projects={content.projects} onContact={() => setPanel("contact")} />}
                  {panel === "arcade" && <Arcade games={games} raceAvailable={ready && !worldError} onRace={() => void startSprint()} />}
                  {panel === "contact" && (
                    <>
                      <p className="eyebrow">Contact</p>
                      <h2>
                        Your idea.
                        <br />
                        <span className="heading-accent">Let’s make it real.</span>
                      </h2>
                      <p className="panel-intro">
                        A new website, an online store, a custom platform, or an app?
                        Tell me what you want to build, who it’s for, and what success
                        looks like. I’ll help turn that vision into a clear next step.
                      </p>
                      <div className="availability">
                        <i />
                        {content.profile.availability}
                      </div>
                      <a
                        className="email-link"
                        href={`mailto:${content.profile.email}`}
                      >
                        {content.profile.email}
                        <ArrowUpRight size={22} />
                      </a>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              content.profile.email,
                            );
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2500);
                          } catch {
                            setToast(
                              "Copy unavailable. Select the email address above.",
                            );
                          }
                        }}
                      >
                        {copied ? <Check size={15} /> : <Mail size={15} />}{" "}
                        {copied ? "Email copied" : "Copy email address"}
                      </button>
                      <div className="social-links">
                        {content.profile.github && (
                          <a
                            href={content.profile.github}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Github size={20} />
                            GitHub
                            <ArrowUpRight size={18} />
                          </a>
                        )}
                        {content.profile.linkedin && (
                          <a
                            href={content.profile.linkedin}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Linkedin size={20} />
                            LinkedIn
                            <ArrowUpRight size={18} />
                          </a>
                        )}
                      </div>
                      <div className="contact-note">
                        <Sun size={36} />
                        <p>
                          You care about getting it right. So do I.
                          <br />
                          Trust me with your vision and the details that matter.
                          <br />
                          <strong>Let’s build something you’re proud to share.</strong>
                        </p>
                      </div>
                    </>
                  )}
                  {panel === "map" && (
                    <>
                      <p className="eyebrow">Neighbourhood map</p>
                      <h2>
                        Where would you
                        <br />
                        <span className="heading-accent">like to go?</span>
                      </h2>
                      <p className="panel-intro">
                        Fast travel straight there, or set a GPS route and drive
                        it yourself. The purple line on your radar shows the way.
                      </p>
                      <div className="big-map">
                        <Map large telemetry={telemetry} onTravel={travel} />
                        <span className="map-caption">
                          PALM AVENUE · SINGLE PLAYER
                        </span>
                      </div>
                      <div className="destination-list">
                        {destinations.map((d) => {
                          const Icon = icons[d.id];
                          return (
                            <div className="destination-row" key={d.id}>
                              <button onClick={() => travel(d.id)}>
                                <span style={{ background: d.color }}>
                                  <Icon size={18} />
                                </span>
                                <div>
                                  <strong>{d.place}</strong>
                                  <small>{d.name} · fast travel</small>
                                </div>
                                <ArrowUpRight size={18} />
                              </button>
                              {!worldError && (
                                <button
                                  className="gps-button"
                                  aria-label={`Set GPS route to ${d.place}`}
                                  title="Drive there with GPS"
                                  onClick={() => setWaypoint(d.id)}
                                >
                                  <Crosshair size={16} />
                                  GPS
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {panel === "settings" && (
                    <>
                      <p className="eyebrow">Settings</p>
                      <h2>
                        Make yourself
                        <br />
                        <span className="heading-accent">at home.</span>
                      </h2>
                      <div className="setting-row">
                        <div>
                          <h3>Graphics quality</h3>
                          <p>Choose Performance for a smoother drive on slower devices.</p>
                        </div>
                        <select
                          aria-label="Graphics quality"
                          value={quality}
                          onChange={(e) => {
                            const q = e.target.value as Quality;
                            setQuality(q);
                            world.current?.setQuality(q, true);
                          }}
                        >
                          <option value="ultra">Ultra · ambient occlusion</option>
                          <option value="high">High</option>
                          <option value="low">Performance</option>
                        </select>
                      </div>
                      <div className="setting-row">
                        <div>
                          <h3>Time of day</h3>
                          <p>Golden hour, broad daylight, or the street after dark.</p>
                        </div>
                        <div className="segmented" role="group" aria-label="Time of day">
                          {(
                            [
                              ["day", "Day", Sun],
                              ["golden", "Golden", Sunrise],
                              ["night", "Night", Moon],
                            ] as const
                          ).map(([id, label, Icon]) => (
                            <button
                              key={id}
                              aria-pressed={timeOfDay === id}
                              onClick={() => changeTime(id)}
                            >
                              <Icon size={14} /> {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="setting-row">
                        <div>
                          <h3>Ambient sound</h3>
                          <p>Hear the engine, traffic, and sounds of the street.</p>
                        </div>
                        <button className="text-button" onClick={toggleAudio}>
                          {sound ? "On" : "Off"}{" "}
                          {sound ? (
                            <Volume2 size={16} />
                          ) : (
                            <VolumeX size={16} />
                          )}
                        </button>
                      </div>
                      <h3 className="section-label">The controls</h3>
                      <div className="controls-list">
                        {[
                          ["W A S D / Arrows", "Move / steer"],
                          ["Space", "Handbrake / brake"],
                          ["H", "Horn"],
                          ["T", "Change time of day"],
                          ["F", "Walk / return to car"],
                          ["Shift", "Run on foot"],
                          ["E", "Enter a destination"],
                          ["M", "Open the map"],
                          ["C", "Change camera"],
                          ["Drag", "Look around"],
                          ["R", "Reset to the start"],
                          ["Esc", "Close a panel"],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{v}</span>
                            <kbd>{k}</kbd>
                          </div>
                        ))}
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          world.current?.reset();
                          setPanel(null);
                          setToast("You’re back at the starting point.");
                        }}
                      >
                        <RotateCcw size={16} />
                        Reset position
                      </button>
                      <p className="settings-note">
                        Explore at your own pace. This is a single-player experience.
                        You can also open projects, games, and contact details directly
                        from the navigation.
                      </p>
                      <a className="admin-link" href="/admin">
                        Content studio <ArrowUpRight size={13} />
                      </a>
                      <p className="asset-credit">
                        Vehicle: Car Concept by Eric Chadwick / Darmstadt
                        Graphics Group,{" "}
                        <a
                          href="https://creativecommons.org/licenses/by/4.0/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          CC BY 4.0
                        </a>
                        . Adapted paint, scale, and animation.{" "}
                        <a
                          href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source ↗
                        </a>
                        . Street surfaces:{" "}
                        <a
                          href="https://polyhaven.com/license"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Poly Haven / CC0
                        </a>
                        . People and animations:{" "}
                        <a
                          href="https://github.com/microsoft/Microsoft-Rocketbox"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Microsoft Rocketbox / MIT
                        </a>
                        . The neighbourhood, vehicles, trees, sky and lighting
                        are generated in code.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="panel-footer">
              <span>ADEDOYINSOLA’S WORLD</span>
              <span>THANKS FOR STOPPING BY ↗</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
