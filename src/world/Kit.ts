import * as THREE from "three";
import { Batch, Rand, tinted } from "./Geo";
import { weathered, foliage, NightLights } from "./Materials";
import * as T from "./Textures";

// Shared state for building the neighbourhood: one batch, one material library,
// one sign atlas, and the bookkeeping the rest of the world needs (lamps, parking, canopies).

export class Kit {
  b = new Batch();
  r = new Rand(90217);
  signs = new T.SignAtlas();
  night = new NightLights();
  lamps: THREE.Vector3[] = [];
  parking: [number, number, number][] = [];
  canopies: THREE.Sphere[] = [];
  materials = new Set<THREE.Material>();
  private cache = new Map<string, THREE.Material>();
  private loader: THREE.TextureLoader;
  private maps = new Map<string, THREE.Texture>();
  constructor(
    public anisotropy = 8,
    manager?: THREE.LoadingManager,
  ) {
    this.loader = new THREE.TextureLoader(manager);
  }
  private keep<M extends THREE.Material>(key: string, make: () => M): M {
    let m = this.cache.get(key) as M | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
      this.materials.add(m);
    }
    return m;
  }
  file(name: string, srgb = false) {
    let t = this.maps.get(name);
    if (!t) {
      t = this.loader.load(`/assets/materials/${name}.jpg`, undefined, undefined, () => {});
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      this.maps.set(name, t);
    }
    return t;
  }
  private tint(key: string, base: () => THREE.Material, color: string) {
    const b = this.keep(key, base);
    let h = this.handles.get(key + color);
    if (!h) {
      h = tinted(b, color);
      this.handles.set(key + color, h);
    }
    return h;
  }
  private handles = new Map<string, THREE.Material>();
  /** Painted cement render over block, the default wall finish. */
  paint(color: string, streak = 0.32, splash = 0.5) {
    return this.tint(`paint-${streak}-${splash}`, () =>
      weathered({
        color: "#ffffff",
        roughness: 0.94,
        normalMap: this.file("plaster-normal"),
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: this.file("plaster-roughness"),
        tile: 2.4,
        weather: { macro: 0.12, streak, splash, splashHeight: 1.1 },
      }),
    color);
  }
  concrete(color = "#a9a59b", streak = 0.25) {
    return this.tint(`conc-${streak}`, () =>
      weathered({
        color: "#ffffff",
        roughness: 0.96,
        normalMap: this.file("plaster-normal"),
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: this.file("plaster-roughness"),
        tile: 1.6,
        weather: { macro: 0.18, streak, splash: 0.45, splashHeight: 0.6 },
      }),
    color);
  }
  blocks(tint = "#ffffff") {
    return this.keep(`blocks${tint}`, () => {
      const s = T.sandcrete();
      return weathered({ color: tint, map: s.color, normalMap: s.normal, roughness: 0.97, tile: 1.8, weather: { macro: 0.14, streak: 0.25, splash: 0.6, splashHeight: 0.8 } });
    });
  }
  ground(kind: "laterite" | "paving" | "asphalt" | "concreteSlab", color = "#ffffff") {
    return this.keep(`ground${kind}${color}`, () => {
      if (kind === "laterite") {
        const l = T.laterite();
        return weathered({ color, map: l.color, normalMap: l.normal, roughness: 1, tile: 3.2, weather: { macro: 0.22 } });
      }
      if (kind === "concreteSlab")
        return weathered({ color: color === "#ffffff" ? "#9e9a90" : color, roughness: 0.95, normalMap: this.file("plaster-normal"), tile: 3, weather: { macro: 0.25, dust: 0.25 } });
      const m = weathered({
        color,
        map: this.file(`${kind}-color`, true),
        normalMap: this.file(`${kind}-normal`),
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: this.file(`${kind}-roughness`),
        roughness: 1,
        tile: kind === "asphalt" ? 5 : 2.6,
        weather: { macro: kind === "asphalt" ? 0.2 : 0.16, dust: kind === "asphalt" ? 0.12 : 0.2 },
      });
      return m;
    });
  }
  metal(color: string, rough = 0.55, metalness = 0.45) {
    const rq = Math.round(rough * 5) / 5,
      mq = Math.round(metalness * 3) / 3;
    return this.tint(`metal-${rq}-${mq}`, () => new THREE.MeshStandardMaterial({ roughness: rq, metalness: mq }), color);
  }
  plastic(color: string, rough = 0.55) {
    const rq = Math.round(rough * 4) / 4;
    return this.tint(`plastic-${rq}`, () => new THREE.MeshStandardMaterial({ roughness: rq, metalness: 0 }), color);
  }
  sheet(color: string) {
    // Long-span roofing / shutters with a corrugated normal map.
    return this.tint(
      "sheet",
      () => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.55, normalMap: T.corrugation(), normalScale: new THREE.Vector2(0.9, 0.9) });
        m.userData.tile = 0.5;
        return m;
      },
      color,
    );
  }
  glass(tint = "#22303a") {
    return this.keep(`glass${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.55, envMapIntensity: 1.3 }));
  }
  blade() {
    return this.keep("blade", () => new THREE.MeshStandardMaterial({ color: "#77898c", roughness: 0.08, metalness: 0.35, envMapIntensity: 1.4 }));
  }
  /** Breeze-block screen (alpha-cut openings show the dark stairwell behind). */
  screen() {
    return this.keep("screen", () => {
      const m = weathered({ map: T.breezeBlock(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: "#e6e0d2", weather: { macro: 0.1, streak: 0.35 } });
      m.alphaToCoverage = true;
      return m;
    });
  }
  interior() {
    return this.keep("interior", () => new THREE.MeshStandardMaterial({ color: "#151412", roughness: 1 }));
  }
  curtain(lit: boolean) {
    return this.keep(`curtain${lit}`, () => {
      const m = new THREE.MeshStandardMaterial({ map: T.curtains(), roughness: 1, color: "#ffffff" });
      if (lit) {
        m.emissive.set("#ffd29a");
        m.emissiveMap = T.curtains();
        this.night.add(m, 1.35);
      }
      m.userData.castShadow = false;
      return m;
    });
  }
  emissive(color: string, peak: number, base = 0, body = "#d8d2c0") {
    return this.keep(`emissive${color}${peak}${base}${body}`, () => this.night.add(new THREE.MeshStandardMaterial({ color: body, emissive: color, roughness: 0.3 }), peak, base));
  }
  signs_(neon = false) {
    return this.keep(`signs${neon}`, () => {
      const m = new THREE.MeshStandardMaterial({ map: this.signs.texture, roughness: 0.75, side: THREE.DoubleSide });
      if (neon) {
        m.emissiveMap = this.signs.texture;
        m.emissive.set("#ffffff");
        this.night.add(m, 1.6, 0.35);
      }
      m.userData.castShadow = false;
      return m;
    });
  }
  /** Painted wall lettering, alpha blended over the render. */
  wallPaint() {
    return this.keep("wallpaint", () => {
      const m = new THREE.MeshStandardMaterial({ map: this.signs.texture, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
      m.userData.castShadow = false;
      m.userData.renderOrder = 1;
      return m;
    });
  }
  decal(kind: "streak" | "blotch" | "shadow") {
    return this.keep(`decal${kind}`, () => {
      const map = kind === "streak" ? T.streak() : kind === "blotch" ? T.blotch() : T.disc();
      const m = new THREE.MeshStandardMaterial({
        map,
        color: kind === "shadow" ? "#000000" : "#ffffff",
        transparent: true,
        opacity: kind === "streak" ? 0.85 : kind === "shadow" ? 0.5 : 0.7,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      m.userData.castShadow = false;
      m.userData.receiveShadow = true;
      m.userData.renderOrder = 1;
      return m;
    });
  }
  leaves(kind: "almond" | "neem" | "bougainvillea" | "shrub" | "grass" | "frond", tint = "#ffffff") {
    return this.keep(`leaves${kind}${tint}`, () => {
      if (kind === "frond") return foliage(T.frond(), { color: tint, sway: 0.22, flutter: 0.05, tipAxis: "u" });
      if (kind === "grass") return foliage(T.leaves("grass"), { color: tint, sway: 0.08, flutter: 0.02, tipAxis: "v" });
      return foliage(T.leaves(kind), { color: tint, sway: kind === "almond" ? 0.14 : 0.08, flutter: 0.035 });
    });
  }
  // ------------------------------------------------------------ small parts
  /** Glass louvre or sliding window in a facade frame (wall at z = 0, outward +z). */
  window(x: number, y: number, w: number, h: number, o: { bars?: string; frame?: string; sill?: THREE.Material; detail?: boolean; kind?: "louvre" | "slider"; lit?: boolean } = {}) {
    const b = this.b,
      r = this.r;
    const frame = this.metal(o.frame || "#3d3f3c", 0.6, 0.3);
    const kind = o.kind || (r.chance(0.62) ? "louvre" : "slider");
    // Interior: a curtain panel set back into the reveal so windows have depth.
    const lit = o.lit ?? r.chance(0.32);
    const cell = Math.floor(r.next() * 8);
    const u0 = (cell % 4) / 4,
      v0 = cell < 4 ? 0.5 : 0;
    b.quad(r.chance(0.18) ? this.interior() : this.curtain(lit), w, h, x, y + h / 2, -0.16, 0, 0, [u0, v0, u0 + 0.25, v0 + 0.5]);
    // Reveal.
    const reveal = this.concrete("#8d8a82");
    b.box(reveal, 0.06, h, 0.18, x - w / 2 - 0.03, y + h / 2, -0.08);
    b.box(reveal, 0.06, h, 0.18, x + w / 2 + 0.03, y + h / 2, -0.08);
    b.box(reveal, w + 0.12, 0.06, 0.18, x, y + h + 0.03, -0.08);
    // Frame.
    b.box(frame, w, 0.05, 0.06, x, y + 0.025, -0.03);
    b.box(frame, w, 0.05, 0.06, x, y + h - 0.025, -0.03);
    b.box(frame, 0.05, h, 0.06, x - w / 2 + 0.025, y + h / 2, -0.03);
    b.box(frame, 0.05, h, 0.06, x + w / 2 - 0.025, y + h / 2, -0.03);
    b.box(frame, 0.04, h, 0.06, x, y + h / 2, -0.03);
    if (kind === "louvre" && o.detail !== false) {
      const n = Math.max(4, Math.round(h / 0.11));
      for (let i = 0; i < n; i++) {
        const yy = y + 0.06 + (i + 0.5) * ((h - 0.12) / n);
        for (const s of [-1, 1]) b.box(this.blade(), w / 2 - 0.08, 0.008, 0.1, x + (s * w) / 4, yy, -0.05, 0, -0.42);
      }
    } else b.box(kind === "louvre" ? this.blade() : this.glass("#1c2a30"), w - 0.08, h - 0.08, 0.02, x, y + h / 2, -0.05);
    // Sill and burglar bars.
    b.box(o.sill || this.concrete("#c9c4b6"), w + 0.16, 0.05, 0.16, x, y - 0.02, 0.06);
    if (o.bars !== "none") {
      const bars = this.metal(o.bars || r.pick(["#1d1f1e", "#1d1f1e", "#f0ede4", "#6a2b22", "#24452f"]), 0.6, 0.5);
      for (let xx = -w / 2 + 0.1; xx <= w / 2 - 0.05; xx += 0.13) b.box(bars, 0.018, h, 0.018, x + xx, y + h / 2, 0.09);
      for (const yy of [0.12, h / 2, h - 0.12]) b.box(bars, w, 0.035, 0.012, x, y + yy, 0.1);
    }
    // Rain streak washing down from the sill.
    if (o.detail !== false && r.chance(0.8)) {
      const len = r.range(0.7, 2.1);
      b.quad(this.decal("streak"), w + r.range(0, 0.3), len, x + r.range(-0.1, 0.1), y - 0.05 - len / 2, 0.006);
    }
  }
  /** Air-conditioner outdoor unit. */
  ac(x: number, y: number, z: number) {
    const b = this.b;
    b.box(this.plastic("#d7d6cf", 0.5), 0.8, 0.55, 0.3, x, y, z + 0.15);
    b.cylinder(this.metal("#2c2d2c", 0.7), 0.2, 0.2, 0.02, x - 0.12, y, z + 0.31, 16, Math.PI / 2);
    b.box(this.metal("#555", 0.6), 0.06, 0.04, 0.3, x - 0.3, y - 0.3, z + 0.15);
    b.box(this.metal("#555", 0.6), 0.06, 0.04, 0.3, x + 0.3, y - 0.3, z + 0.15);
  }
  satellite(x: number, y: number, z: number, ry = 0) {
    const b = this.b;
    b.push(x, y, z, ry);
    const g = new THREE.SphereGeometry(0.42, 18, 8, 0, Math.PI * 2, 0, 0.62);
    const m = new THREE.Matrix4().makeRotationX(-1.0).setPosition(0, 0.55, 0.05);
    b.geometry(g, this.plastic("#d9d8d0", 0.5), m, false);
    g.dispose();
    b.bar(this.metal("#888"), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.55, 0.1), 0.025);
    b.bar(this.metal("#888"), new THREE.Vector3(0, 0.6, 0.2), new THREE.Vector3(0, 0.75, 0.55), 0.012);
    b.pop();
  }
  /** Plastic overhead water tank on a steel stand. */
  tank(x: number, y: number, z: number, big = false) {
    const b = this.b,
      r = this.r;
    const col = r.pick(["#2f5fa6", "#2f5fa6", "#25292a", "#2a6db3", "#b8b6aa"]);
    const rad = big ? 0.85 : 0.62,
      h = big ? 1.6 : 1.25;
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(this.metal("#4a4c49", 0.7), 0.05, 0.9, 0.05, x + dx * rad * 0.75, y + 0.45, z + dz * rad * 0.75);
    b.box(this.metal("#4a4c49", 0.7), rad * 1.7, 0.05, rad * 1.7, x, y + 0.92, z);
    b.cylinder(this.plastic(col, 0.45), rad * 0.97, rad, h, x, y + 0.95 + h / 2, z, 22);
    for (let i = 1; i < 4; i++) b.cylinder(this.plastic(col, 0.5), rad + 0.02, rad + 0.02, 0.05, x, y + 0.95 + (h * i) / 4, z, 22);
    b.cylinder(this.plastic(col, 0.45), rad * 0.38, rad * 0.4, 0.12, x, y + 0.95 + h + 0.06, z, 14);
    b.bar(this.plastic("#d8d8d0", 0.6), new THREE.Vector3(x + rad, y + 1.1, z), new THREE.Vector3(x + rad + 0.25, y - 0.2, z), 0.025);
  }
  /** Laundry line with clothes cut from the fabric atlas. */
  laundry(x0: number, x1: number, y: number, z: number) {
    const b = this.b,
      r = this.r;
    b.bar(this.metal("#ddd", 0.8, 0), new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z), 0.006, 3);
    for (let x = x0 + 0.2; x < x1 - 0.3; x += r.range(0.35, 0.6)) {
      const cell = Math.floor(r.next() * 8);
      const u0 = (cell % 4) / 4,
        v0 = cell < 4 ? 0.5 : 0;
      const w = r.range(0.3, 0.55),
        h = r.range(0.45, 0.85);
      b.quad(this.cloth(), w, h, x + w / 2, y - h / 2, z, 0, 0, [u0, v0, u0 + 0.25, v0 + 0.5]);
    }
  }
  cloth() {
    return this.keep("cloth", () => {
      const m = new THREE.MeshStandardMaterial({ map: T.curtains(), roughness: 1, side: THREE.DoubleSide, color: "#ffffff" });
      m.color.setScalar(1.6);
      return m;
    });
  }
  /** Painted steel gate with spear tops. */
  gate(x: number, z: number, w: number, h: number, color: string, open = 0) {
    const b = this.b;
    const m = this.metal(color, 0.55, 0.5);
    for (const side of [-1, 1]) {
      b.push(x + (side * w) / 2, 0, z, side * open);
      const leaf = w / 2;
      const cx = (-side * leaf) / 2;
      b.box(m, leaf, 0.06, 0.05, cx, 0.12, 0);
      b.box(m, leaf, 0.06, 0.05, cx, h * 0.55, 0);
      b.box(m, leaf, 0.06, 0.05, cx, h - 0.1, 0);
      b.box(m, 0.06, h, 0.06, -side * 0.03, h / 2, 0);
      b.box(m, 0.06, h, 0.06, -side * (leaf - 0.03), h / 2, 0);
      for (let i = 1; i < leaf / 0.12; i++) {
        const xx = -side * i * 0.12;
        b.box(m, 0.02, h - 0.15, 0.02, xx, h / 2, 0);
        b.box(m, 0.04, 0.12, 0.012, xx, h + 0.02, 0);
      }
      // Sheet panel on the lower half for privacy.
      b.box(this.sheet(color), leaf - 0.1, h * 0.5, 0.012, cx, h * 0.3, -0.02);
      b.pop();
    }
  }
  /** Painted block wall with piers and coping; returns collider. */
  wall(x0: number, z0: number, x1: number, z1: number, h: number, finish: THREE.Material, coping: THREE.Material) {
    const b = this.b;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) return;
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    b.push((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
    b.box(finish, len, h, 0.22, 0, h / 2, 0);
    b.box(coping, len + 0.05, 0.08, 0.32, 0, h + 0.04, 0);
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 3) b.box(finish, 0.34, h + 0.12, 0.34, s, (h + 0.12) / 2, 0);
    b.collide(len, h, 0.3, 0, h / 2, 0);
    if (this.r.chance(0.35)) {
      const len2 = this.r.range(0.8, Math.min(3, len));
      b.quad(this.decal("blotch"), len2, this.r.range(0.6, 1.2), this.r.range(-len / 2 + 1, len / 2 - 1), this.r.range(0.4, 0.9), 0.115);
    }
    b.pop();
  }
  /** Bougainvillea spilling over a wall top. */
  bougainvillea(x: number, y: number, z: number, ry: number, len: number) {
    const b = this.b,
      r = this.r;
    const mat = this.leaves("bougainvillea");
    b.push(x, y, z, ry);
    for (let s = -len / 2; s < len / 2; s += 0.7) {
      const w = r.range(1.0, 1.8),
        h = r.range(0.9, 1.6);
      b.quad(mat, w, h, s, -h * 0.25, 0.2 + r.range(0, 0.15), r.range(-0.3, 0.3), -0.25);
      b.quad(mat, w, h * 0.8, s + 0.3, h * 0.15, 0.05, r.range(-0.5, 0.5) + Math.PI / 2, -1.2);
    }
    b.pop();
  }
}
