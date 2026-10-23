import * as THREE from "three";

// Static geometry accumulator. Everything the neighbourhood builds is written straight into
// one growing vertex buffer per material, so a whole street costs a few dozen draw calls.

type Stream = { pos: number[]; nor: number[]; uv: number[]; col: number[]; tinted: boolean; tile: number };

/**
 * A colour variant of a shared base material. Batching writes the colour into vertex
 * colours, so dozens of paint colours cost a single draw call.
 */
export function tinted(base: THREE.Material, color: THREE.ColorRepresentation) {
  const m = new THREE.Material();
  m.userData.base = base;
  m.userData.tint = new THREE.Color(color);
  return m;
}
const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Batch {
  streams = new Map<THREE.Material, Stream>();
  colliders: THREE.Box3[] = [];
  /** Current local-to-world transform; push/pop for nested groups. */
  matrix = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];

  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    this.stack.push(this.matrix.clone());
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(1, 1, 1));
    this.matrix.multiply(_m);
  }
  pop() {
    this.matrix = this.stack.pop() || new THREE.Matrix4();
  }
  stream(m: THREE.Material) {
    const base = (m.userData.base as THREE.Material) || m;
    let s = this.streams.get(base);
    if (!s) {
      s = { pos: [], nor: [], uv: [], col: [], tinted: false, tile: (base.userData.tile as number) || 1 };
      this.streams.set(base, s);
    }
    return s;
  }
  /** Append a geometry under the current transform (plus an optional local matrix). */
  geometry(g: THREE.BufferGeometry, m: THREE.Material, local?: THREE.Matrix4, worldUV = true, keepColors = false) {
    const src = g.index ? g.toNonIndexed() : g;
    const full = local ? this.matrix.clone().multiply(local) : this.matrix;
    _n.getNormalMatrix(full);
    const p = src.getAttribute("position"),
      n = src.getAttribute("normal"),
      uv = src.getAttribute("uv"),
      col = keepColors ? src.getAttribute("color") : undefined;
    const s = this.stream(m);
    const t = s.tile;
    const tint = m.userData.tint as THREE.Color | undefined;
    if (tint) s.tinted = true;
    const cr = tint ? tint.r : 1,
      cg = tint ? tint.g : 1,
      cb = tint ? tint.b : 1;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(full);
      _w.fromBufferAttribute(n, i).applyMatrix3(_n).normalize();
      s.pos.push(_v.x, _v.y, _v.z);
      s.nor.push(_w.x, _w.y, _w.z);
      if (col) {
        s.col.push(col.getX(i), col.getY(i), col.getZ(i));
        s.tinted = true;
      } else s.col.push(cr, cg, cb);
      if (worldUV || !uv) {
        const ax = Math.abs(_w.x),
          ay = Math.abs(_w.y),
          az = Math.abs(_w.z);
        if (ay >= ax && ay >= az) s.uv.push(_v.x / t, _v.z / t);
        else if (ax >= az) s.uv.push(_v.z / t, _v.y / t);
        else s.uv.push(_v.x / t, _v.y / t);
      } else s.uv.push(uv.getX(i), uv.getY(i));
    }
    if (src !== g) src.dispose();
  }
  private static unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(w, h, d));
    this.geometry(Batch.unit, m, _m.clone());
  }
  /** Axis-aligned (in the current frame) box resting on y; adds a collider too. */
  solid(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    this.box(m, w, h, d, x, y, z);
    this.collide(w, h, d, x, y, z);
  }
  collide(w: number, h: number, d: number, x: number, y: number, z: number) {
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2));
    this.colliders.push(b.applyMatrix4(this.matrix));
  }
  cylinder(m: THREE.Material, rt: number, rb: number, h: number, x: number, y: number, z: number, sides = 10, rx = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, sides);
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, rz)), _s.set(1, 1, 1));
    this.geometry(g, m, _m.clone(), false);
    g.dispose();
  }
  /** A cylinder between two local points. */
  bar(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 6, r2 = r) {
    const d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r2, r, d.length(), sides, 1, false);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    _m.compose(a.clone().add(b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    this.geometry(g, m, _m.clone(), false);
    g.dispose();
  }
  /** Flat quad facing +z in the current frame, with its own 0..1 UVs (for decals and signs). */
  quad(m: THREE.Material, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0, uv?: [number, number, number, number]) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uv) {
      const a = g.getAttribute("uv");
      for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
    }
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0, "YXZ")), _s.set(1, 1, 1));
    this.geometry(g, m, _m.clone(), false);
    g.dispose();
  }
  /** Build meshes, one per material. */
  build(parent: THREE.Object3D, shadows = true) {
    const meshes: THREE.Mesh[] = [];
    for (const [m, s] of this.streams) {
      if (!s.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(s.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
      if (s.tinted) {
        g.setAttribute("color", new THREE.Float32BufferAttribute(s.col, 3));
        m.vertexColors = true;
      }
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, m);
      const cast = m.userData.castShadow ?? (shadows && !(m as THREE.MeshStandardMaterial).transparent);
      mesh.castShadow = cast;
      mesh.receiveShadow = m.userData.receiveShadow ?? true;
      mesh.renderOrder = (m.userData.renderOrder as number) || 0;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.streams.clear();
    return meshes;
  }
}

/** Small deterministic random generator. */
export class Rand {
  constructor(private s = 1) {}
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  pick<T>(list: readonly T[]) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p: number) {
    return this.next() < p;
  }
}
