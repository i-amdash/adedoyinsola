import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch } from "./Geo";
import { createDriver, placeDriver, steeringWheels } from "./Drivers";

// Procedural street vehicles: the yellow minibus, the three-wheeler, everyday saloons and
// SUVs with extruded body profiles. Each model faces -Z, sits on y = 0, and is merged
// into a handful of meshes using vertex colours so traffic stays cheap to draw.

export type Kind = "danfo" | "keke" | "sedan" | "suv";
export type Vehicle = {
  root: THREE.Object3D;
  wheels: THREE.Object3D[];
  kind: Kind;
  length: number;
  radius: number;
};

// Shared base materials; colour comes from vertex colours.
const bases = new Map<string, THREE.Material>();
const base = (key: string, make: () => THREE.Material) => {
  if (!bases.has(key)) bases.set(key, make());
  return bases.get(key)!;
};
type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; color?: THREE.Color };
const paint = () =>
  base("paint", () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 }));
const satin = () => base("satin", () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
const flat = () => base("flat", () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.1 }));
const chrome = () => base("chrome", () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.95 }));
const glass = () => base("glass", () => new THREE.MeshPhysicalMaterial({ color: "#b5cfce", roughness: 0.1, metalness: 0.05, clearcoat: 0.7, envMapIntensity: 0.7, transparent: true, opacity: 0.17, depthWrite: false }));
const lamps: { m: THREE.MeshStandardMaterial; peak: number; base: number }[] = [];
function lamp(kind: "head" | "tail" | "indicator") {
  return base("lamp-" + kind, () => {
    const color = kind === "head" ? "#fff4d6" : kind === "tail" ? "#5e0f0a" : "#ff9a1f";
    const emissive = kind === "head" ? "#fff1cf" : kind === "tail" ? "#ff2a14" : "#ff8a1f";
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.3, roughness: 0.15 });
    lamps.push({ m, peak: kind === "head" ? 7 : kind === "tail" ? 4 : 0.6, base: kind === "head" ? 0.3 : 0.4 });
    return m;
  });
}
/** Brighten head and tail lamps after dark. */
export function setVehicleNight(night: number) {
  const k = THREE.MathUtils.smoothstep(night, 0.2, 0.8);
  for (const { m, peak, base: b } of lamps) m.emissiveIntensity = THREE.MathUtils.lerp(b, peak, k);
}

let shadowMat: THREE.MeshBasicMaterial | null = null;
export function contactShadow() {
  if (shadowMat) return shadowMat;
  const S = 64;
  const arr = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x - 31.5) / 32,
        dy = (y - 31.5) / 32;
      const d = Math.max(Math.abs(dx) ** 3 + Math.abs(dy) ** 3, 0) ** (1 / 3);
      arr[(y * S + x) * 4 + 3] = Math.max(0, 1 - d) ** 1.5 * 200;
    }
  const t = new THREE.DataTexture(arr, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  shadowMat = new THREE.MeshBasicMaterial({ map: t, color: "#000", transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  shadowMat.userData.castShadow = false;
  return shadowMat;
}

class Builder {
  parts: Part[] = [];
  wheels: THREE.Object3D[] = [];
  root = new THREE.Group();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, color?: string, m?: THREE.Matrix4) {
    if (m) geo.applyMatrix4(m);
    this.parts.push({ geo, mat, color: color ? new THREE.Color(color) : undefined });
  }
  box(mat: THREE.Material, color: string | undefined, w: number, h: number, d: number, x: number, y: number, z: number, r = 0, rx = 0, ry = 0) {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d);
    this.add(g, mat, color, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1)));
  }
  cyl(mat: THREE.Material, color: string | undefined, r: number, h: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "x", sides = 16) {
    const g = new THREE.CylinderGeometry(r, r, h, sides);
    const rot = axis === "x" ? new THREE.Euler(0, 0, Math.PI / 2) : axis === "z" ? new THREE.Euler(Math.PI / 2, 0, 0) : new THREE.Euler();
    this.add(g, mat, color, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1)));
  }
  /** Side profile (z, y) extruded across the width, with soft edges and wheel arches. */
  profile(mat: THREE.Material, color: string, pts: [number, number][], width: number, bevel = 0.06, arches: [number, number, number][] = []) {
    const outline = pts.slice();
    if (arches.length) {
      // The last two points form the sill, rear to front: cut the arches into it.
      const yb = outline[outline.length - 1][1];
      const tail = outline.pop()!;
      for (const [cz, cy, R] of [...arches].sort((p, q) => q[0] - p[0])) {
        const a0 = Math.asin(Math.max(-1, Math.min(1, (yb - cy) / R)));
        for (let i = 0; i <= 16; i++) {
          const a = a0 + ((Math.PI - 2 * a0) * i) / 16;
          outline.push([cz + R * Math.cos(a), cy + R * Math.sin(a)]);
        }
      }
      outline.push(tail);
    }
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (const [z, y] of outline.slice(1)) shape.lineTo(z, y);
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 3, curveSegments: 18 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    this.add(g, mat, color);
  }
  wheel(x: number, y: number, z: number, r: number, width: number, rim = "#9ea3a3") {
    const w = new THREE.Group();
    w.position.set(x, y, z);
    const tyre = new THREE.CylinderGeometry(r, r, width, 22);
    const wall = new THREE.TorusGeometry(r * 0.86, width * 0.42, 6, 22);
    wall.rotateY(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.02, 12);
    tyre.rotateZ(Math.PI / 2);
    hub.rotateZ(Math.PI / 2);
    const spokes = new THREE.BoxGeometry(width + 0.04, r * 0.18, r * 1.1);
    const s2 = spokes.clone().rotateX(Math.PI / 3),
      s3 = spokes.clone().rotateX(-Math.PI / 3);
    const color = (g: THREE.BufferGeometry, c: string) => {
      const n = g.getAttribute("position").count;
      const cc = new THREE.Color(c);
      g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
      return g.index ? g.toNonIndexed() : g;
    };
    const merged = mergeGeometries([color(tyre, "#141516"), color(wall, "#1b1c1d"), color(hub, rim), color(spokes, "#6c7171"), color(s2, "#6c7171"), color(s3, "#6c7171")]);
    const mesh = new THREE.Mesh(merged!, flat());
    mesh.castShadow = true;
    w.add(mesh);
    this.root.add(w);
    this.wheels.push(w);
  }
  finish(length: number, width: number) {
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      for (const k of Object.keys(g.attributes)) if (!["position", "normal"].includes(k)) g.deleteAttribute(k);
      if ((p.mat as THREE.MeshStandardMaterial).vertexColors) {
        const c = p.color || new THREE.Color("#ffffff");
        const n = g.getAttribute("position").count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
        g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      }
      const list = groups.get(p.mat) || [];
      list.push(g);
      groups.set(p.mat, list);
      if (g !== p.geo) p.geo.dispose();
    }
    for (const [m, list] of groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.35, length * 1.12), contactShadow());
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    blob.renderOrder = 1;
    this.root.add(blob);
    return this.root;
  }
}

// ------------------------------------------------------------------ models
export function danfo(seed = 0): Vehicle {
  const b = new Builder();
  const yellow = seed % 3 === 2 ? "#e2a210" : "#efb21a";
  const black = "#141516";
  const lift = 0.42;
  // Hollow lower shell keeps the cabin visible through the windscreen.
  b.box(flat(), "#34332e", 1.82, 0.16, 4.4, 0, 0.52, 0, 0.04);
  for (const side of [-1, 1])
    b.box(satin(), yellow, 0.12, 1.15, 4.55, side * 0.9, 1.04, 0, 0.05);
  for (const end of [-1, 1])
    b.box(satin(), yellow, 1.85, 1.15, 0.12, 0, 1.04, end * 2.21, 0.05);
  // An open cabin behind the windows, instead of opaque blocks hiding the occupants.
  b.box(satin(), yellow, 1.92, 0.1, 4.45, 0, lift + 1.8, 0, 0.04);
  for (const side of [-1, 1]) for (const z of [-2.07, -1.15, 2.12])
    b.box(satin(), yellow, 0.09, 0.62, 0.09, side * 0.9, lift + 1.49, z, 0.02);
  b.box(satin(), yellow, 1.88, 0.62, 0.06, 0, lift + 1.49, 2.18);
  b.box(flat(), "#2c302e", 0.58, 0.12, 0.6, -0.48, 1.0, -1.4, 0.04);
  b.box(flat(), "#2c302e", 0.58, 0.6, 0.12, -0.48, 1.3, -1.06, 0.04);
  b.box(flat(), "#34332e", 1.7, 0.14, 0.35, 0, 1.43, -1.99, 0.03);
  const control = steeringWheels.danfo;
  b.add(new THREE.TorusGeometry(control.radius, 0.024, 6, 18), flat(), "#191c19", new THREE.Matrix4().compose(new THREE.Vector3(control.x, control.y, control.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(control.tilt, 0, 0)), new THREE.Vector3(1, 1, 1)));

  b.box(glass(), undefined, 1.62, 0.6, 0.06, 0, lift + 1.45, -2.22, 0.03, -0.24);
  for (const s of [-1, 1]) {
    b.box(glass(), undefined, 0.04, 0.5, 3.1, s * 0.95, lift + 1.5, 0.5, 0.02);
    for (const z of [-0.6, 0.45, 1.5]) b.box(satin(), yellow, 0.06, 0.52, 0.08, s * 0.965, lift + 1.5, z);
    b.box(flat(), black, 0.03, 0.09, 4.4, s * 0.965, lift + 0.94, 0);
    b.box(flat(), black, 0.03, 0.09, 4.4, s * 0.965, lift + 0.73, 0);
    // Rust and dents along the sills.
    b.box(flat(), "#6b4a2a", 0.025, 0.12, r(seed, s) * 1.4 + 0.4, s * 0.97, lift + 0.18, r(seed + 3, s) * 2 - 1);
  }
  b.box(flat(), black, 1.7, 0.09, 0.03, 0, lift + 0.94, -2.28);
  b.box(flat(), black, 1.7, 0.09, 0.03, 0, lift + 0.73, -2.28);
  b.box(flat(), "#1e1d1b", 0.03, 1.55, 1.05, 0.965, lift + 1.0, -0.65);
  b.box(flat(), black, 1.98, 0.22, 0.2, 0, lift + 0.12, -2.32, 0.05);
  b.box(flat(), black, 1.98, 0.22, 0.2, 0, lift + 0.12, 2.32, 0.05);
  b.box(chrome(), "#c9cdcc", 0.9, 0.2, 0.05, 0, lift + 0.48, -2.29, 0.02);
  for (const s of [-1, 1]) {
    b.cyl(lamp("head"), undefined, 0.13, 0.06, s * 0.68, lift + 0.5, -2.29, "z");
    b.box(lamp("tail"), undefined, 0.18, 0.32, 0.04, s * 0.84, lift + 0.55, 2.29, 0.02);
    b.box(lamp("indicator"), undefined, 0.12, 0.08, 0.04, s * 0.84, lift + 0.82, -2.29);
    b.box(flat(), black, 0.06, 0.06, 0.32, s * 1.03, lift + 1.25, -2.0);
    b.box(chrome(), "#c9cdcc", 0.14, 0.2, 0.03, s * 1.08, lift + 1.25, -2.15);
  }
  for (const x of [-0.7, 0.7]) b.box(flat(), black, 0.05, 0.05, 3.2, x, lift + 1.92, 0.4);
  for (const z of [-0.9, 0.4, 1.7]) b.box(flat(), black, 1.45, 0.04, 0.05, 0, lift + 1.94, z);
  for (const s of [-1, 1]) for (const z of [-1.5, 1.48]) b.wheel(s * 0.84, 0.36, z, 0.36, 0.24, "#b9bdbb");
  return { root: b.finish(4.7, 1.95), wheels: b.wheels, kind: "danfo", length: 4.7, radius: 1.35 };
}
function r(seed: number, s: number) {
  const h = Math.sin(seed * 12.9898 + s * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

export function keke(seed = 0): Vehicle {
  const b = new Builder();
  const body = ["#f0c21d", "#2e7d4f", "#e3b21c"][seed % 3];
  const canvas = seed % 2 ? "#1f3b2a" : "#203426";
  b.box(satin(), body, 1.2, 0.5, 1.5, 0, 0.62, 0.4, 0.14);
  b.box(satin(), body, 0.8, 0.55, 0.9, 0, 0.7, -0.8, 0.14);
  b.box(satin(), body, 0.55, 0.85, 0.12, 0, 1.0, -1.2, 0.05, 0.2);
  b.box(flat(), "#3a2a22", 1.0, 0.16, 0.6, 0, 0.98, 0.65, 0.06);
  b.box(flat(), "#3a2a22", 1.0, 0.45, 0.12, 0, 1.25, 0.95, 0.05);
  b.box(flat(), "#3a2a22", 0.42, 0.12, 0.42, 0, 1.0, -0.45, 0.05);
  b.box(flat(), canvas, 1.32, 0.1, 2.15, 0, 1.92, 0.1, 0.05);
  b.box(flat(), canvas, 1.2, 0.85, 0.05, 0, 1.45, 1.17, 0.02);
  b.box(glass(), undefined, 1.0, 0.55, 0.03, 0, 1.6, -0.98, 0.02, 0.18);
  for (const s of [-1, 1]) {
    b.cyl(chrome(), "#a8acaa", 0.025, 1.0, s * 0.6, 1.42, -0.95, "y", 6);
    b.cyl(chrome(), "#a8acaa", 0.025, 1.0, s * 0.62, 1.42, 1.12, "y", 6);
    b.box(flat(), "#151515", 0.03, 0.06, 2.1, s * 0.64, 1.86, 0.1);
  }
  // Handlebar and grips are within the seated driver's reach.
  b.box(chrome(), "#a8acaa", 0.48, 0.035, 0.035, 0, 1.26, -0.78);
  b.box(chrome(), "#a8acaa", 0.035, 0.3, 0.035, 0, 1.11, -0.78);
  for (const side of [-1, 1]) b.box(flat(), "#1d2420", 0.13, 0.045, 0.045, side * 0.2, 1.26, -0.78, 0.01);
  b.cyl(lamp("head"), undefined, 0.1, 0.06, 0, 0.95, -1.27, "z");
  for (const s of [-1, 1]) b.box(lamp("tail"), undefined, 0.12, 0.12, 0.04, s * 0.45, 0.7, 1.16, 0.02);
  b.wheel(0, 0.26, -1.0, 0.26, 0.14);
  for (const s of [-1, 1]) b.wheel(s * 0.58, 0.26, 0.6, 0.26, 0.16);
  return { root: b.finish(2.6, 1.3), wheels: b.wheels, kind: "keke", length: 2.6, radius: 1.0 };
}

const carColors = ["#c9cdcf", "#e8e8e3", "#1e2226", "#3a4b62", "#6b1f24", "#8f8d86", "#2f4a3c", "#b8b2a6", "#d9d9d4"];
/** Everyday saloon or SUV built from extruded side profiles with wheel arches. */
export function car(seed = 0, suv = false): Vehicle {
  const b = new Builder();
  const color = carColors[seed % carColors.length];
  const W = suv ? 1.86 : 1.78,
    halfL = suv ? 2.35 : 2.3;
  const rearA = suv ? 1.42 : 1.38,
    frontA = suv ? -1.42 : -1.38;
  const belt = suv ? 1.12 : 0.95;
  // Lower body: bumpers, bonnet, boot, cut-outs for the wheels.
  const lower: [number, number][] = suv
    ? [
        [-halfL, 0.36],
        [-halfL - 0.03, 0.75],
        [-halfL + 0.12, 1.02],
        [-1.15, 1.1],
        [1.9, belt + 0.02],
        [halfL, 1.05],
        [halfL + 0.02, 0.4],
        [halfL - 0.1, 0.3],
        [-halfL + 0.1, 0.3],
      ]
    : [
        [-halfL, 0.3],
        [-halfL - 0.03, 0.6],
        [-halfL + 0.12, 0.8],
        [-1.0, 0.93],
        [1.45, belt + 0.04],
        [halfL - 0.12, 0.98],
        [halfL, 0.88],
        [halfL - 0.02, 0.32],
        [halfL - 0.1, 0.24],
        [-halfL + 0.1, 0.24],
      ];
  const rad = suv ? 0.4 : 0.35;
  b.profile(paint(), color, lower, W, 0.07, [
    [frontA, rad, rad + 0.08],
    [rearA, rad, rad + 0.08],
  ]);
  // Glasshouse: tinted glass extruded a little narrower, roof capped in body colour.
  const cabin: [number, number][] = suv
    ? [
        [-1.15, belt],
        [-0.45, 1.68],
        [1.85, 1.7],
        [2.05, belt],
      ]
    : [
        [-0.95, belt],
        [-0.3, 1.4],
        [0.75, 1.42],
        [1.5, belt + 0.02],
      ];
  b.profile(glass(), "#ffffff", cabin, W - 0.18, 0.05);
  const roofZ0 = cabin[1][0] + 0.12,
    roofZ1 = cabin[2][0] - 0.05;
  b.box(paint(), color, W - 0.26, 0.06, roofZ1 - roofZ0, 0, cabin[1][1] + 0.01, (roofZ0 + roofZ1) / 2, 0.03);
  // Pillars and trim.
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.11);
    const a0 = new THREE.Vector3(x, belt, cabin[0][0] + 0.05),
      a1 = new THREE.Vector3(x, cabin[1][1], cabin[1][0] + 0.05);
    const pillar = (p: THREE.Vector3, q: THREE.Vector3, rr = 0.045) => {
      const d = q.clone().sub(p);
      const g = new THREE.CylinderGeometry(rr, rr, d.length(), 6);
      b.add(g, paint(), color, new THREE.Matrix4().compose(p.clone().add(q).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
    };
    pillar(a0, a1);
    const mid = (cabin[1][0] + cabin[2][0]) / 2 + 0.05;
    pillar(new THREE.Vector3(x, belt, mid), new THREE.Vector3(x, cabin[1][1], mid), 0.05);
    pillar(new THREE.Vector3(x, belt + 0.02, cabin[3][0] - 0.05), new THREE.Vector3(x, cabin[2][1], cabin[2][0] - 0.02));
    b.box(chrome(), "#bfc3c1", 0.03, 0.03, (cabin[3][0] - cabin[0][0]) * 0.95, s * (W / 2 - 0.02), belt + 0.01, (cabin[0][0] + cabin[3][0]) / 2);
    b.box(flat(), "#111213", 0.1, 0.12, 0.22, s * (W / 2 + 0.03), belt + 0.12, cabin[0][0] + 0.25, 0.03);
    b.box(flat(), "#1a1b1c", 0.03, 0.05, 0.16, s * (W / 2 + 0.01), (suv ? 0.85 : 0.72), 0.05);
    b.box(flat(), "#1a1b1c", 0.03, 0.05, 0.16, s * (W / 2 + 0.01), (suv ? 0.85 : 0.72), 1.0);
  }
  for (const x of [-0.4, 0.4]) {
    b.box(flat(), "#333b36", 0.5, 0.12, 0.5, x, suv ? 0.68 : 0.5, 0.08, 0.04);
    b.box(flat(), "#333b36", 0.5, 0.55, 0.12, x, suv ? 0.94 : 0.77, 0.38, 0.04);
  }
  const control = steeringWheels[suv ? "suv" : "sedan"];
  const steering = new THREE.TorusGeometry(control.radius, 0.018, 6, 18);
  b.add(steering, flat(), "#1e2622", new THREE.Matrix4().compose(new THREE.Vector3(control.x, control.y, control.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(control.tilt, 0, 0)), new THREE.Vector3(1, 1, 1)));
  // Lights, grille, plates.
  const fy = suv ? 0.9 : 0.72,
    ry = suv ? 0.95 : 0.82;
  for (const s of [-1, 1]) {
    b.box(lamp("head"), undefined, 0.42, 0.14, 0.08, s * (W / 2 - 0.32), fy, -halfL - 0.02, 0.03);
    b.box(lamp("tail"), undefined, 0.44, 0.15, 0.08, s * (W / 2 - 0.3), ry, halfL + 0.0, 0.03);
    b.box(lamp("indicator"), undefined, 0.12, 0.06, 0.06, s * (W / 2 - 0.1), fy - 0.13, -halfL);
  }
  b.box(flat(), "#151617", 0.75, 0.16, 0.06, 0, fy - 0.02, -halfL - 0.02, 0.02);
  b.box(chrome(), "#c6cac8", 0.78, 0.03, 0.07, 0, fy + 0.07, -halfL - 0.02);
  b.box(flat(), "#e8e6dd", 0.5, 0.13, 0.02, 0, fy - 0.25, -halfL - 0.04);
  b.box(flat(), "#e8e6dd", 0.5, 0.13, 0.02, 0, ry - 0.25, halfL + 0.04);
  b.box(flat(), "#17181a", W - 0.1, 0.12, 0.14, 0, suv ? 0.42 : 0.36, -halfL + 0.02, 0.05);
  b.box(flat(), "#17181a", W - 0.1, 0.12, 0.14, 0, suv ? 0.42 : 0.36, halfL - 0.02, 0.05);
  // Underbody shadow box so the arches read dark inside.
  b.box(flat(), "#0b0b0b", W - 0.2, 0.3, halfL * 2 - 0.4, 0, suv ? 0.5 : 0.42, 0);
  for (const s of [-1, 1]) for (const z of [frontA, rearA]) b.wheel(s * (W / 2 - 0.12), rad, z, rad, suv ? 0.27 : 0.23, seed % 2 ? "#b4b8b8" : "#55595a");
  return { root: b.finish(halfL * 2, W), wheels: b.wheels, kind: suv ? "suv" : "sedan", length: halfL * 2, radius: 1.3 };
}
export const sedan = (seed = 0) => car(seed, false);
export const suv = (seed = 0) => car(seed, true);

function roundedLoop(corners: [number, number][], rr = 5) {
  const pts: THREE.Vector3[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector2(...corners[i]);
    const a = new THREE.Vector2(...corners[(i - 1 + n) % n]);
    const c = new THREE.Vector2(...corners[(i + 1) % n]);
    const inDir = p.clone().sub(a).normalize(),
      outDir = c.clone().sub(p).normalize();
    const start = p.clone().sub(inDir.clone().multiplyScalar(rr)),
      end = p.clone().add(outDir.clone().multiplyScalar(rr));
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const q = start
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .add(p.clone().multiplyScalar(2 * (1 - t) * t))
        .add(end.clone().multiplyScalar(t * t));
      pts.push(new THREE.Vector3(q.x, 0, q.y));
    }
  }
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
}

export const loops = [
  // Keep right: outer lane of each carriageway, near-side lanes on the cross roads.
  roundedLoop(
    [
      [6.9, 107.75],
      [6.9, -109.75],
      [67.75, -109.75],
      [67.75, 107.75],
    ],
    6,
  ),
  roundedLoop(
    [
      [-6.9, -109.75],
      [-6.9, 107.75],
      [-67.75, 107.75],
      [-67.75, -109.75],
    ],
    6,
  ),
];

type Agent = {
  v: Vehicle;
  loop: THREE.CatmullRomCurve3;
  length: number;
  u: number;
  speed: number;
  max: number;
  blocked: number;
  spin: number;
};

export class Traffic {
  agents: Agent[] = [];
  parked: Vehicle[] = [];
  group = new THREE.Group();
  onHorn?: (x: number, z: number) => void;
  private driverMaterials = new Set<THREE.Material>();
  private p = new THREE.Vector3();
  private t = new THREE.Vector3();
  constructor(scene: THREE.Scene, parking: [number, number, number][]) {
    scene.add(this.group);
    const plan: [Kind, number][] = [
      ["danfo", 0],
      ["keke", 0],
      ["sedan", 1],
      ["danfo", 1],
      ["suv", 4],
      ["keke", 1],
      ["sedan", 3],
      ["danfo", 2],
    ];
    const make = (kind: Kind, seed: number) => (kind === "danfo" ? danfo(seed) : kind === "keke" ? keke(seed) : kind === "suv" ? suv(seed) : sedan(seed));
    loops.forEach((loop, li) => {
      const length = loop.getLength();
      plan.forEach(([kind, seed], i) => {
        const v = make(kind, seed + li * 3);
        this.group.add(v.root);
        const max = kind === "keke" ? 7.5 : kind === "danfo" ? 10 : 11.5;
        this.agents.push({ v, loop, length, u: (i / plan.length + li * 0.07) % 1, speed: max * 0.6, max, blocked: 0, spin: 0 });
      });
    });
    // Parked vehicles never move: merge them all into one static batch.
    const batch = new Batch();
    parking.slice(0, 26).forEach(([x, z, heading], i) => {
      const v = i % 5 === 3 ? danfo(i) : make(i % 3 === 0 ? "suv" : "sedan", i + 2);
      v.root.position.set(x, 0, z);
      v.root.rotation.y = heading;
      v.root.updateMatrixWorld(true);
      v.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          batch.matrix.copy(o.matrixWorld);
          batch.geometry(o.geometry, o.material as THREE.Material, undefined, false, true);
          o.geometry.dispose();
        }
      });
      const marker = new THREE.Object3D();
      marker.position.copy(v.root.position);
      marker.rotation.y = heading;
      this.parked.push({ ...v, root: marker, wheels: [] });
    });
    batch.matrix.identity();
    batch.build(this.group);
    this.place(0);
  }
  /** Obstacles for the visitor's collision tests. */
  obstacles() {
    const out: { x: number; z: number; r: number }[] = [];
    for (const v of [...this.agents.map((a) => a.v), ...this.parked]) {
      const f = v.length * 0.28;
      const yaw = v.root.rotation.y;
      for (const s of [-1, 1])
        out.push({ x: v.root.position.x - Math.sin(yaw) * f * s, z: v.root.position.z - Math.cos(yaw) * f * s, r: v.kind === "keke" ? 0.85 : 1.05 });
    }
    return out;
  }
  setDrivers(source: THREE.Object3D, variant: number) {
    const templates = new Map<Kind, THREE.Group>();
    this.agents.forEach((agent, i) => {
      if (i % 3 !== variant || agent.v.root.getObjectByName("Seated driver")) return;
      const kind = agent.v.kind;
      if (!templates.has(kind)) {
        const template = createDriver(source, variant + 1, kind);
        template.traverse(o => {
          if (o instanceof THREE.Mesh) {
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach(material => this.driverMaterials.add(material));
          }
        });
        templates.set(kind, template);
      }
      agent.v.root.add(placeDriver(templates.get(kind)!, kind));
    });
  }
  private place(dt: number) {
    for (const a of this.agents) {
      a.loop.getPointAt(a.u, this.p);
      a.loop.getTangentAt(a.u, this.t);
      a.v.root.position.copy(this.p);
      const yaw = Math.atan2(-this.t.x, -this.t.z);
      let d = yaw - a.v.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.v.root.rotation.y += dt ? d * Math.min(1, dt * 8) : d;
      a.spin += (a.speed * dt) / 0.35;
      for (const w of a.v.wheels) w.rotation.x = -a.spin;
    }
  }
  update(dt: number, player: THREE.Vector3, playerRadius: number) {
    for (const a of this.agents) {
      a.loop.getPointAt(a.u, this.p);
      a.loop.getTangentAt(a.u, this.t);
      let want = a.max;
      const ahead = a.loop.getTangentAt((a.u + 8 / a.length) % 1);
      const bend = 1 - Math.max(0, ahead.dot(this.t));
      want *= 1 - Math.min(0.65, bend * 3);
      const check = (x: number, z: number, rr: number) => {
        const rx = x - this.p.x,
          rz = z - this.p.z;
        const fwd = rx * this.t.x + rz * this.t.z;
        const lat = Math.abs(rx * this.t.z - rz * this.t.x);
        if (fwd > 0 && fwd < 16 && lat < 1.6 + rr) {
          want = Math.min(want, Math.max(0, (fwd - a.v.length / 2 - rr - 1.5) * 1.1));
          return true;
        }
        return false;
      };
      const playerBlocking = check(player.x, player.z, playerRadius);
      for (const o of this.agents) if (o !== a) check(o.v.root.position.x, o.v.root.position.z, o.v.length / 2);
      a.speed = THREE.MathUtils.damp(a.speed, want, want < a.speed ? 4 : 1.2, dt);
      if (playerBlocking && a.speed < 0.6) {
        a.blocked += dt;
        if (a.blocked > 2.2) {
          a.blocked = -3;
          this.onHorn?.(this.p.x, this.p.z);
        }
      } else a.blocked = a.blocked < 0 ? a.blocked + dt : 0;
      a.u = (a.u + (a.speed * dt) / a.length) % 1;
    }
    this.place(dt);
  }
  dispose() {
    this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) geometries.add(o.geometry);
    });
    geometries.forEach(geometry => geometry.dispose());
    this.driverMaterials.forEach(material => material.dispose());
    this.driverMaterials.clear();
  }
}
