import * as THREE from "three";
import { destinations, type Destination } from "../types";

// Driving and walking challenges that take place in the 3D neighbourhood. The rules
// are plain data and arithmetic so they can be tested without a renderer; the
// beacons, parking cones and hunt tokens are drawn by the same class.

export type MissionGame = "dispatch" | "taxi" | "parking" | "hunt";
export type MissionPhase = "idle" | "countdown" | "running" | "finished";
export type TargetKind = "pickup" | "drop" | "park";
export type MissionTelemetry = {
  game: MissionGame;
  phase: MissionPhase;
  countdown: number;
  elapsed: number;
  remaining?: number;
  count: number;
  total?: number;
  title: string;
  hint: string;
  scrapes: number;
  target: [number, number] | null;
  kind: TargetKind | null;
};
export type MissionResult = { durationMs: number; moves?: number };

/** What the mission needs from the world. */
export interface MissionHost {
  scene: THREE.Scene;
  colliders: THREE.Box3[];
  mode: "drive" | "walk";
  focus: THREE.Vector3;
  position: THREE.Vector3;
  yaw: number;
  /** Current speed of the car or walker in m/s. */
  speedNow(): number;
  free(x: number, z: number, r: number, onFoot: boolean): boolean;
  sound?: { blip(f: number): void } | null;
  callbacks: { message?: (text: string) => void };
  reduced: boolean;
}

type Stop = { name: string; x: number; z: number };
type Target = { name: string; x: number; z: number; r: number; kind: TargetKind; dest?: Destination };

export const missionTitles: Record<MissionGame, string> = {
  dispatch: "DANFO DISPATCH",
  taxi: "PALM AVENUE TAXI",
  parking: "KERBSIDE PARKING",
  hunt: "FIND THE A.",
};
export const TAXI_SECONDS = 300;

/** Kerbside stops on quiet roads and the avenue (cross streets are 31–35 Road). */
export const stops: Stop[] = [
  { name: "34 Road Junction", x: -30, z: 31 },
  { name: "Mama Put Corner", x: 45, z: 25 },
  { name: "33 Road Market", x: 30, z: -17 },
  { name: "Vulcanizer Stop", x: -48, z: -23 },
  { name: "32 Road Bus Stop", x: -25, z: -62 },
  { name: "32 Road Pharmacy", x: 52, z: -68 },
  { name: "East Side Street", x: 72.2, z: -42 },
  { name: "Generator House", x: 72.2, z: 62 },
  { name: "West Side Street", x: -72.2, z: 4 },
  { name: "Water Tank Close", x: -72.2, z: -88 },
  { name: "Palm Avenue North", x: 3.4, z: 70 },
  { name: "Palm Avenue South", x: -3.4, z: -50 },
];
const passengers = ["Tola", "Emeka", "Aisha", "Chidi", "Funmi", "Bayo", "Ngozi", "Kunle", "Zainab", "Ifeanyi", "Sade", "Musa"];
const delivered: Record<Destination, string> = {
  about: "Delivered to The Studio, where every project starts with your brief.",
  projects: "Delivered to The Gallery. Twelve projects are on show inside.",
  arcade: "Delivered to The Arcade. Seven games are waiting.",
  build: "Delivered to The Workshop, where you can design and price your own project.",
  contact: "Delivered to The Courtyard, the best place to say hello.",
};
const dest = (id: Destination) => destinations.find((d) => d.id === id)!;
/** Fixed route so every dispatch run is comparable on the leaderboard. */
export const dispatchRoute: Target[] = (
  [
    [stops[1], "about"],
    [stops[8], "projects"],
    [stops[5], "arcade"],
    [stops[7], "contact"],
  ] as [Stop, Destination][]
).flatMap(([s, d]) => [
  { name: s.name, x: s.x, z: s.z, r: 7, kind: "pickup" as const },
  { name: dest(d).place, x: dest(d).x, z: dest(d).z, r: 9.5, kind: "drop" as const, dest: d },
]);
/** Kerbside bays on the quiet cross streets; cars must lie along the street (x axis). */
export const bays: { name: string; x: number; z: number }[] = [
  { name: "33 Road", x: -28, z: -17 },
  { name: "32 Road", x: 36, z: -62 },
  { name: "34 Road", x: -40, z: 31 },
];
export const BAY = { long: 0.9, lateral: 0.7, hold: 0.8, cone: 3.9 };
/** Tokens sit on footpaths and roads that are open to the public. */
export const tokenSpots: [number, number][] = [
  [12.3, 45],
  [-12.3, -30],
  [-70, 40],
  [70, -80],
  [-40, 34.7],
  [40, -26.7],
  [-30, -58.3],
  [25, -118.7],
  [-25, 116.7],
  [-3.4, 124],
];

export function inBay(x: number, z: number, yaw: number, bay: { x: number; z: number }) {
  return Math.abs(x - bay.x) < BAY.long && Math.abs(z - bay.z) < BAY.lateral && Math.abs(Math.sin(yaw)) > 0.96;
}

function canvasIcon(draw: (c: CanvasRenderingContext2D) => void, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = "#0e1612e6";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const icons = {
  pickup: (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(64, 46, 13, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(40, 92);
    c.quadraticCurveTo(64, 52, 88, 92);
    c.closePath();
    c.fill();
  },
  parcel: (c: CanvasRenderingContext2D) => {
    c.lineWidth = 7;
    c.strokeRect(40, 44, 48, 42);
    c.beginPath();
    c.moveTo(40, 58);
    c.lineTo(88, 58);
    c.moveTo(64, 44);
    c.lineTo(64, 86);
    c.stroke();
  },
  flag: (c: CanvasRenderingContext2D) => {
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(46, 94);
    c.lineTo(46, 34);
    c.stroke();
    c.beginPath();
    c.moveTo(46, 36);
    c.lineTo(88, 48);
    c.lineTo(46, 62);
    c.closePath();
    c.fill();
  },
  text: (t: string, size = 62) => (c: CanvasRenderingContext2D) => {
    c.font = `800 ${size}px Manrope, 'DM Sans', Arial`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(t, 64, 68);
  },
};

const pillarMaterial = (color: string) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, strength: { value: 1 } },
    vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 color; uniform float time; uniform float strength; varying float vY; void main(){ float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.6) * (0.55 + 0.15 * sin(time * 3.0 - vY * 10.0)) * strength; gl_FragColor = vec4(color * 1.6, a); }",
  });

class Beacon {
  group = new THREE.Group();
  pillar: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  icon: THREE.Sprite;
  size = 1;
  constructor(color: string, icon: THREE.Texture, radius: number, height = 24) {
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, height, 32, 1, true), pillarMaterial(color));
    this.pillar.position.y = height / 2;
    this.pillar.renderOrder = 5;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.9, radius, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon, depthWrite: false, fog: false, toneMapped: false }));
    this.icon.scale.setScalar(1.7);
    this.icon.position.y = 4.2;
    this.group.add(this.pillar, this.ring, this.icon);
    this.group.visible = false;
  }
  setIcon(t: THREE.Texture, color: string) {
    this.icon.material.map = t;
    this.icon.material.needsUpdate = true;
    this.pillar.material.uniforms.color.value.set(color);
    this.ring.material.color.set(color).multiplyScalar(1.8);
  }
  update(time: number, reduced: boolean, active: number) {
    this.pillar.material.uniforms.time.value = reduced ? 0 : time;
    this.pillar.material.uniforms.strength.value = 0.6 + active * 0.6;
    this.icon.position.y = 4.2 + (reduced ? 0 : Math.sin(time * 2) * 0.2);
    const pulse = this.size * (1 + (reduced ? 0 : Math.sin(time * 3) * 0.04) + active * 0.08);
    this.ring.scale.set(pulse, pulse, 1);
    this.pillar.scale.set(this.size, 1, this.size);
  }
  dispose() {
    this.pillar.geometry.dispose();
    this.pillar.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.icon.material.dispose();
  }
}

export class Missions {
  game: MissionGame | null = null;
  phase: MissionPhase = "idle";
  countdown = 0;
  elapsed = 0;
  count = 0;
  scrapes = 0;
  lastScrape = -9;
  hold = 0;
  lastDrop = 0;
  step = 0;
  aboard: string | null = null;
  target: Target | null = null;
  result: MissionResult | null = null;
  tokens: { x: number; z: number; taken: boolean; group: THREE.Group }[] = [];
  private random = Math.random;
  private beacon?: Beacon;
  private bayGroup = new THREE.Group();
  private bayColliders: THREE.Box3[] = [];
  private tokenGroup = new THREE.Group();
  private textures: Partial<Record<string, THREE.Texture>> = {};
  private time = 0;

  constructor(private host: MissionHost, random?: () => number) {
    if (random) this.random = random;
  }

  get active() {
    return this.phase === "countdown" || this.phase === "running";
  }
  /** Taxi, dispatch and parking keep you behind the wheel. */
  get locksCar() {
    return this.active && this.game !== "hunt";
  }

  // ------------------------------------------------------------------ setup
  /** Closest free spot to a planned point (planned points avoid furniture, this handles the rest). */
  place(x: number, z: number, r: number, onFoot: boolean): [number, number] {
    if (this.host.free(x, z, r, onFoot)) return [x, z];
    for (let d = 0.75; d <= 7; d += 0.75)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * d,
          pz = z + Math.sin((a / 16) * Math.PI * 2) * d;
        if (this.host.free(px, pz, r, onFoot)) return [px, pz];
      }
    return [x, z];
  }
  private texture(key: string, draw: (c: CanvasRenderingContext2D) => void, color: string) {
    if (typeof document === "undefined") return new THREE.Texture();
    return (this.textures[key] ||= canvasIcon(draw, color));
  }
  private ensureBeacon() {
    if (!this.beacon) {
      this.beacon = new Beacon("#ffd36b", this.texture("pickup", icons.pickup, "#ffd36b"), 6.5);
      this.host.scene.add(this.beacon.group);
    }
    return this.beacon;
  }
  private showTarget(t: Target | null, iconKey?: "pickup" | "parcel" | "drop" | "park") {
    this.target = t;
    this.hold = 0;
    const b = this.ensureBeacon();
    if (!t) {
      b.group.visible = false;
      return;
    }
    const style = {
      pickup: ["#ffd36b", icons.pickup],
      parcel: ["#ffd36b", icons.parcel],
      drop: ["#c5ed8b", icons.flag],
      park: ["#9fd4ff", icons.text("P", 66)],
    } as const;
    const [color, draw] = style[iconKey || (t.kind === "park" ? "park" : t.kind === "drop" ? "drop" : "pickup")];
    b.setIcon(this.texture(iconKey || t.kind, draw, color), color);
    b.group.position.set(t.x, 0, t.z);
    b.size = t.r / 6.5;
    b.update(this.time, this.host.reduced, 0);
    b.group.visible = true;
  }
  private clearProps() {
    this.showTarget(null);
    this.host.colliders.splice(0, this.host.colliders.length, ...this.host.colliders.filter((c) => !this.bayColliders.includes(c)));
    this.bayColliders = [];
    this.bayGroup.removeFromParent();
    this.bayGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.bayGroup = new THREE.Group();
    this.tokenGroup.removeFromParent();
    this.tokenGroup.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.tokenGroup = new THREE.Group();
    this.tokens = [];
  }
  private buildBays() {
    const cone = new THREE.MeshStandardMaterial({ color: "#ff6a1f", roughness: 0.6 });
    const stripe = new THREE.MeshBasicMaterial({ color: "#f4f2e9" });
    const paint = new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fd4ff").multiplyScalar(1.4), transparent: true, opacity: 0.85, toneMapped: false });
    for (const bay of bays) {
      const g = new THREE.Group();
      g.position.set(bay.x, 0, bay.z);
      // Bay outline.
      for (const [w, d, x, z] of [
        [2 * BAY.cone + 0.4, 0.12, 0, -1.25],
        [2 * BAY.cone + 0.4, 0.12, 0, 1.25],
        [0.12, 2.5, -BAY.cone - 0.2, 0],
        [0.12, 2.5, BAY.cone + 0.2, 0],
      ]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint.clone());
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.05, z);
        g.add(m);
      }
      // Cones at both ends; they are solid, so touching one counts as a scrape.
      for (const sx of [-1, 1])
        for (const sz of [-0.7, 0.7]) {
          const x = sx * BAY.cone,
            z = sz;
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.72, 14), cone.clone());
          body.position.set(x, 0.36, z);
          body.castShadow = true;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.09, 14), stripe.clone());
          band.position.set(x, 0.42, z);
          g.add(body, band);
          this.bayColliders.push(new THREE.Box3(new THREE.Vector3(bay.x + x - 0.28, 0, bay.z + z - 0.28), new THREE.Vector3(bay.x + x + 0.28, 0.8, bay.z + z + 0.28)));
        }
      this.bayGroup.add(g);
    }
    this.host.colliders.push(...this.bayColliders);
    this.host.scene.add(this.bayGroup);
  }
  private buildTokens() {
    const tex = this.texture("token", icons.text("a.", 60), "#c5ed8b");
    for (const [x0, z0] of tokenSpots) {
      const [x, z] = this.place(x0, z0, 0.5, true);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 14, 20, 1, true), pillarMaterial("#c5ed8b"));
      glow.position.y = 7;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false, toneMapped: false }));
      icon.scale.setScalar(1.25);
      icon.position.y = 1.5;
      group.add(glow, icon);
      this.tokenGroup.add(group);
      this.tokens.push({ x, z, taken: false, group });
    }
    this.host.scene.add(this.tokenGroup);
  }

  // ------------------------------------------------------------------ flow
  start(game: MissionGame) {
    this.clearProps();
    this.game = game;
    this.phase = "countdown";
    this.countdown = 3;
    this.elapsed = 0;
    this.count = 0;
    this.scrapes = 0;
    this.lastScrape = -9;
    this.lastDrop = 0;
    this.step = 0;
    this.aboard = null;
    this.result = null;
    if (game === "dispatch") this.showTarget(dispatchRoute[0], "parcel");
    if (game === "taxi") this.nextPassenger(this.host.position.x, this.host.position.z);
    if (game === "parking") {
      this.buildBays();
      this.showBay(0);
    }
    if (game === "hunt") {
      this.buildTokens();
      this.showTarget(null);
    }
  }
  /** Where the car waits for the countdown: [x, z, yaw]. */
  static startPose(game: MissionGame): [number, number, number] {
    if (game === "parking") return [-62, -18.8, -Math.PI / 2];
    if (game === "taxi") return [3.4, 80, 0];
    return [3.4, 86, 0];
  }
  cancel() {
    this.clearProps();
    this.game = null;
    this.phase = "idle";
    this.result = null;
  }
  private finish(result: MissionResult) {
    this.phase = "finished";
    this.result = result;
    this.showTarget(null);
    this.host.sound?.blip(1500);
    // Props linger briefly so the moment isn't abrupt, then the street is tidied.
    setTimeout(() => {
      if (this.phase === "finished") this.clearProps();
    }, 1200);
  }
  private showBay(i: number) {
    const b = bays[i];
    this.showTarget({ name: b.name, x: b.x, z: b.z, r: 3.6, kind: "park" }, "park");
  }
  private nextPassenger(fromX: number, fromZ: number) {
    // A nearby pickup keeps the pace up; never the stop you're sitting at.
    const options = stops
      .map((s) => ({ s, d: Math.hypot(s.x - fromX, s.z - fromZ) }))
      .filter((o) => o.d > 20)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    const s = options[Math.floor(this.random() * options.length)].s;
    const [x, z] = this.place(s.x, s.z, 1.1, false);
    this.aboard = null;
    this.showTarget({ name: s.name, x, z, r: 6.5, kind: "pickup" }, "pickup");
  }
  private chooseDrop(fromX: number, fromZ: number) {
    const far = stops.filter((s) => Math.hypot(s.x - fromX, s.z - fromZ) > 70);
    const s = far[Math.floor(this.random() * far.length)];
    const [x, z] = this.place(s.x, s.z, 1.1, false);
    this.showTarget({ name: s.name, x, z, r: 6.5, kind: "drop" }, "drop");
  }
  onImpact(speed: number) {
    if (!this.active || this.game !== "parking" || this.phase !== "running" || speed < 0.8) return;
    if (this.elapsed - this.lastScrape < 0.8) return;
    this.lastScrape = this.elapsed;
    this.scrapes++;
    this.host.sound?.blip(180);
  }

  /** Called every simulated frame while the world is active and unpaused. */
  update(dt: number) {
    this.time += dt;
    if (this.beacon?.group.visible) this.beacon.update(this.time, this.host.reduced, this.hold);
    for (const t of this.tokens)
      if (!t.taken) {
        t.group.children[1].position.y = 1.5 + (this.host.reduced ? 0 : Math.sin(this.time * 2.2 + t.x) * 0.18);
        ((t.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.time.value = this.host.reduced ? 0 : this.time;
      }
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) {
        this.phase = "running";
        this.host.sound?.blip(1500);
      }
      return;
    }
    if (this.phase !== "running") return;
    this.elapsed += dt;
    const f = this.host.focus,
      speed = this.host.speedNow();
    const at = (t: Target) => Math.hypot(f.x - t.x, f.z - t.z) < t.r;
    const say = (m: string) => this.host.callbacks.message?.(m);
    switch (this.game) {
      case "dispatch": {
        const t = this.target;
        if (!t || !at(t) || speed > 4.2) break;
        this.host.sound?.blip(1200);
        this.step++;
        if (t.kind === "drop") {
          this.count++;
          if (t.dest) say(delivered[t.dest]);
        } else say(`Parcel collected at ${t.name}. Deliver it to ${dispatchRoute[this.step].name}.`);
        if (this.step === dispatchRoute.length) this.finish({ durationMs: Math.round(this.elapsed * 1000) });
        else this.showTarget(dispatchRoute[this.step], dispatchRoute[this.step].kind === "pickup" ? "parcel" : "drop");
        break;
      }
      case "taxi": {
        if (this.elapsed >= TAXI_SECONDS) {
          this.finish({ moves: this.count, durationMs: this.count ? Math.round(this.lastDrop * 1000) : TAXI_SECONDS * 1000 });
          break;
        }
        const t = this.target;
        if (!t) break;
        this.hold = at(t) && speed < 1.8 ? this.hold + dt : 0;
        if (this.hold < 0.6) break;
        this.host.sound?.blip(1200);
        if (t.kind === "pickup") {
          this.aboard = passengers[Math.floor(this.random() * passengers.length)];
          this.chooseDrop(t.x, t.z);
          say(`${this.aboard} is aboard. Drop them at ${this.target!.name}.`);
        } else {
          this.count++;
          this.lastDrop = this.elapsed;
          say(`Trip ${this.count} complete. ${this.aboard} says thank you!`);
          this.nextPassenger(t.x, t.z);
        }
        break;
      }
      case "parking": {
        const bay = bays[this.step];
        const parked = inBay(this.host.position.x, this.host.position.z, this.host.yaw, bay) && speed < 0.3;
        this.hold = parked ? this.hold + dt : 0;
        if (this.hold < BAY.hold) break;
        this.host.sound?.blip(1200);
        this.count++;
        this.step++;
        if (this.step === bays.length) this.finish({ moves: this.scrapes, durationMs: Math.round(this.elapsed * 1000) });
        else {
          say(`Parked on ${bay.name}. Next bay: ${bays[this.step].name}.`);
          this.showBay(this.step);
        }
        break;
      }
      case "hunt": {
        const reach = this.host.mode === "drive" ? 5.5 : 2.6;
        for (const t of this.tokens) {
          if (t.taken || Math.hypot(f.x - t.x, f.z - t.z) > reach) continue;
          t.taken = true;
          t.group.visible = false;
          this.count++;
          this.host.sound?.blip(900 + this.count * 60);
        }
        if (this.count === this.tokens.length) this.finish({ durationMs: Math.round(this.elapsed * 1000) });
        break;
      }
    }
  }

  telemetry(): MissionTelemetry | null {
    if (!this.game || this.phase === "idle") return null;
    const t = this.target;
    const hints: Record<MissionGame, string> = {
      dispatch: t?.kind === "drop" ? `Deliver to ${t.name} · slow down to hand it over` : `Collect the parcel at ${t?.name ?? ""} · slow down in the ring`,
      taxi: t?.kind === "drop" ? `${this.aboard} → ${t.name} · stop in the green ring` : `Passenger waiting at ${t?.name ?? ""} · stop in the yellow ring`,
      parking: `Park in the ${bays[Math.min(this.step, bays.length - 1)].name} bay · straighten up and stop`,
      hunt: "Explore on foot or by car · follow the green light pillars",
    };
    return {
      game: this.game,
      phase: this.phase,
      countdown: Math.ceil(this.countdown),
      elapsed: this.elapsed,
      ...(this.game === "taxi" ? { remaining: Math.max(0, TAXI_SECONDS - this.elapsed) } : {}),
      count: this.count,
      total: this.game === "dispatch" ? 4 : this.game === "parking" ? bays.length : this.game === "hunt" ? this.tokens.length : undefined,
      title: missionTitles[this.game],
      hint: hints[this.game],
      scrapes: this.scrapes,
      target: t ? [t.x, t.z] : null,
      kind: t ? t.kind : null,
    };
  }
  dispose() {
    this.clearProps();
    this.beacon?.dispose();
    for (const t of Object.values(this.textures)) t?.dispose();
  }
}
