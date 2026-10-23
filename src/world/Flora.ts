import * as THREE from "three";
import type { Kit } from "./Kit";
import { foliage } from "./Materials";
import * as T from "./Textures";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const V = THREE.Vector3;

/** A crossed pair of leaf cards plus a horizontal one: reads as a volume from any angle. */
function cluster(k: Kit, mat: THREE.Material, p: THREE.Vector3, size: number, ry: number) {
  const b = k.b;
  b.push(p.x, p.y, p.z, ry);
  b.quad(mat, size, size * 0.8, 0, 0, 0, 0, 0.25);
  b.quad(mat, size, size * 0.8, 0, 0, 0, Math.PI / 2, -0.2);
  b.quad(mat, size * 1.1, size * 1.1, 0, 0.05, 0, 0.6, -Math.PI / 2 + 0.15);
  b.pop();
}

/**
 * Indian almond (Terminalia catappa): the street tree of the estate. A straight trunk with
 * branches in horizontal tiers, big leaves, a few turning red.
 */
export function almond(k: Kit, x: number, z: number, height: number) {
  const b = k.b,
    r = k.r;
  const bark = k.concrete("#5e5649", 0.05);
  const leaf = k.leaves("almond");
  b.bar(bark, new V(x, 0, z), new V(x, height, z), 0.3, 9, 0.12);
  // Whitewashed trunk base, a common municipal touch.
  b.cylinder(k.paint("#e8e6dc", 0, 0.3), 0.31, 0.33, 1.1, x, 0.55, z, 9);
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const y = height * (0.46 + t * 0.16);
    const reach = (4.6 - t * 0.95) * (0.85 + r.next() * 0.3);
    const n = 5 + (t < 2 ? 1 : 0);
    const off = r.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
      const end = new V(x + Math.cos(a) * reach, y + reach * 0.12, z + Math.sin(a) * reach);
      b.bar(bark, new V(x, y, z), end, 0.09 - t * 0.015, 5, 0.03);
      for (let j = 0; j < 3; j++) {
        const s = 0.45 + j * 0.28;
        const p = new V(x + Math.cos(a) * reach * s, y + reach * 0.12 * s + 0.25 + r.range(-0.15, 0.25), z + Math.sin(a) * reach * s);
        cluster(k, leaf, p, 1.7 + r.next() * 0.9 - t * 0.15, r.range(0, Math.PI));
      }
    }
  }
  cluster(k, leaf, new V(x, height + 0.4, z), 2.0, r.range(0, Math.PI));
  k.canopies.push(new THREE.Sphere(new V(x, height * 0.75, z), 5.2));
  b.collide(0.7, height, 0.7, x, height / 2, z);
}

/** Neem: dense rounded canopy of small leaves. */
export function neem(k: Kit, x: number, z: number, height: number) {
  const b = k.b,
    r = k.r;
  const bark = k.concrete("#4f4a40", 0.05);
  const leaf = k.leaves("neem");
  b.bar(bark, new V(x, 0, z), new V(x + r.range(-0.4, 0.4), height * 0.55, z + r.range(-0.4, 0.4)), 0.24, 7, 0.14);
  for (let i = 0; i < 5; i++) {
    const a = r.next() * Math.PI * 2;
    b.bar(bark, new V(x, height * 0.45, z), new V(x + Math.cos(a) * 2.2, height * 0.75, z + Math.sin(a) * 2.2), 0.09, 5, 0.04);
  }
  for (let i = 0; i < 38; i++) {
    const a = r.next() * Math.PI * 2,
      u = r.range(-0.4, 1),
      rr = Math.sqrt(r.next());
    const p = new V(x + Math.cos(a) * Math.sqrt(1 - u * u) * rr * 3.6, height * 0.78 + u * 1.9, z + Math.sin(a) * Math.sqrt(1 - u * u) * rr * 3.6);
    cluster(k, leaf, p, 1.6 + r.next(), r.range(0, Math.PI));
  }
  k.canopies.push(new THREE.Sphere(new V(x, height * 0.78, z), 4.2));
}

function fronds(k: Kit, top: THREE.Vector3, count: number, len: number, droop: number, mat: THREE.Material) {
  const b = k.b,
    r = k.r;
  for (let i = 0; i < count; i++) {
    const L = len * (0.85 + r.next() * 0.3),
      dr = droop * (0.7 + r.next() * 0.6),
      yaw = (i / count) * Math.PI * 2 + r.range(-0.2, 0.2),
      rise = 0.5 + r.next() * 0.45;
    const g = new THREE.PlaneGeometry(L, 1.6, 12, 2);
    const p = g.getAttribute("position");
    for (let j = 0; j < p.count; j++) {
      const t = (p.getX(j) + L / 2) / L,
        w = p.getY(j);
      const along = t * L;
      p.setXYZ(j, along * (1 - t * 0.15), along * rise - t * t * L * dr - Math.abs(w) * 0.35, w * (1 - t * 0.5));
    }
    g.computeVertexNormals();
    b.push(top.x, top.y, top.z, yaw);
    b.geometry(g, mat, undefined, false);
    b.pop();
    g.dispose();
  }
}

/** Coconut palm with a leaning, ringed trunk. */
export function coconut(k: Kit, x: number, z: number, h: number, lean: number, dir: number) {
  const b = k.b,
    r = k.r;
  const trunk = k.concrete("#8a7a63", 0.05);
  const ring = k.concrete("#6b5d4b", 0);
  const at = (t: number) => new V(x + Math.cos(dir) * lean * t * t, h * t, z + Math.sin(dir) * lean * t * t);
  for (let i = 0; i < 10; i++) {
    const a = at(i / 10),
      c = at((i + 1) / 10),
      rad = THREE.MathUtils.lerp(0.27, 0.16, i / 10);
    b.bar(trunk, a, c, rad, 9, rad * 0.92);
    b.bar(ring, a, a.clone().lerp(c, 0.1), rad * 1.07, 9);
  }
  const top = at(1);
  for (let i = 0; i < 5; i++) b.cylinder(k.plastic("#5d5a2a", 0.6), 0.17, 0.17, 0.3, top.x + Math.cos(i * 1.3) * 0.3, top.y - 0.4, top.z + Math.sin(i * 1.3) * 0.3, 8);
  fronds(k, top, 13 + Math.floor(r.next() * 4), 4.6, 0.75, k.leaves("frond"));
  k.canopies.push(new THREE.Sphere(top.clone(), 4.2));
  b.collide(0.6, h * 0.8, 0.6, x, h * 0.4, z);
}

/** Royal palm: smooth grey column trunk, green crownshaft. Lines the avenue median. */
export function royalPalm(k: Kit, x: number, z: number, h: number) {
  const b = k.b,
    r = k.r;
  const trunk = k.concrete("#b9b6ad", 0.1);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs,
      t1 = (i + 1) / segs;
    const rad = (t: number) => 0.3 * (1 + 0.18 * Math.sin(t * Math.PI * 0.9)) * (1 - t * 0.25);
    b.bar(trunk, new V(x, h * t0, z), new V(x, h * t1, z), rad(t0), 12, rad(t1));
  }
  b.bar(k.paint("#6d8a3a", 0, 0), new V(x, h, z), new V(x, h + 1.8, z), 0.27, 12, 0.22);
  fronds(k, new V(x, h + 1.8, z), 11, 4.2, 0.55, k.leaves("frond", "#e3ecd0"));
  k.canopies.push(new THREE.Sphere(new V(x, h + 1.8, z), 4));
  b.collide(0.6, h, 0.6, x, h / 2, z);
}

/** Low flowering shrub / hedge clump. */
export function shrub(k: Kit, x: number, z: number, size = 1) {
  const r = k.r;
  const mat = k.leaves(r.chance(0.3) ? "bougainvillea" : "shrub");
  for (let i = 0; i < 3; i++)
    cluster(k, mat, new V(x + r.range(-0.4, 0.4) * size, 0.45 * size + r.range(0, 0.2), z + r.range(-0.4, 0.4) * size), 1.1 * size, r.range(0, Math.PI));
}

/** Instanced wind-blown grass tufts. */
export function grassField(scene: THREE.Object3D, spots: THREE.Vector3[], seedMat?: THREE.Material) {
  const mat = (seedMat as THREE.MeshStandardMaterial) || foliage(T.leaves("grass"), { sway: 0.08, flutter: 0.02, tipAxis: "v" });
  const a = new THREE.PlaneGeometry(1.0, 0.7);
  a.translate(0, 0.35, 0);
  const b2 = a.clone().rotateY(Math.PI / 2);
  const c = a.clone().rotateY(Math.PI / 4);
  const geo = mergeGeometries([a, b2, c])!;
  a.dispose();
  b2.dispose();
  c.dispose();
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach((p, i) => {
    o.position.copy(p);
    o.rotation.y = (i * 2.399) % (Math.PI * 2);
    o.scale.setScalar(0.55 + ((i * 0.618) % 1) * 0.8);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, col.setHSL(0.13 + ((i * 0.37) % 1) * 0.06, 0.35, 0.62 + ((i * 0.71) % 1) * 0.25));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);
  return mesh;
}
