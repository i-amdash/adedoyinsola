import * as THREE from "three";
import { Kit } from "./Kit";
import { flats, duplexRow, bungalow, kiosk, umbrellaStand, vulcanizer, generator, chairs, jerrycans, shopNames, paints } from "./Buildings";
import { almond, neem, coconut, royalPalm, shrub, grassField } from "./Flora";
import { AV, JUNCTIONS, SEGMENTS, STREET, SIDE_X } from "./roads";
import { wind } from "./Materials";
import * as T from "./Textures";

// The neighbourhood: a 1970s planned estate in Lagos, as it is lived in today.
// A palm-lined dual-carriageway avenue with open drains, numbered side roads, walk-up
// blocks of flats with converted shop fronts, terraced duplexes and bungalows behind
// block walls, almond trees, kiosks and the clutter of tanks, dishes and generators.

const V = THREE.Vector3;
const inJunction = (z: number, pad: number) => JUNCTIONS.some((j) => Math.abs(z - j) < pad);
const MARKERS: [number, number][] = [
  [-14, 2],
  [14, -42],
  [-14, -88],
  [14, 65],
];

export class District {
  root = new THREE.Group();
  kit: Kit;
  colliders: THREE.Box3[] = [];
  lamps: THREE.Vector3[] = [];
  parking: [number, number, number][] = [];
  canopies: THREE.Sphere[] = [];
  private pools?: THREE.InstancedMesh;
  private beacon?: THREE.MeshBasicMaterial;
  private extra: THREE.Material[] = [];
  private grassSpots: THREE.Vector3[] = [];
  constructor(
    private scene: THREE.Scene,
    anisotropy = 8,
    manager?: THREE.LoadingManager,
  ) {
    this.kit = new Kit(anisotropy, manager);
    this.roads();
    this.median();
    this.utilities();
    this.plots();
    this.streetTrees();
    this.streetLife();
    this.signage();
    this.distant();
    this.kit.b.build(this.root);
    this.colliders = this.kit.b.colliders;
    this.lamps = this.kit.lamps;
    this.parking = this.kit.parking;
    this.canopies = this.kit.canopies;
    grassField(this.root, this.grassSpots, this.kit.leaves("grass"));
    this.lightPools();
    scene.add(this.root);
  }
  /** Walkable surface height: footpaths sit a kerb above the road. */
  groundHeight(x: number, z: number) {
    const ax = Math.abs(x);
    if (ax > AV.drain && ax < AV.foot && z > AV.from && z < AV.to && !inJunction(z, STREET.drain)) return 0.16;
    return 0;
  }

  // ------------------------------------------------------------ roads, kerbs, drains
  roads() {
    const k = this.kit,
      b = k.b,
      r = k.r;
    const asphalt = k.ground("asphalt"),
      paving = k.ground("paving"),
      dirt = k.ground("laterite"),
      far = k.ground("laterite", "#c9a888");
    const kerbW = k.paint("#e7e3d8", 0.05, 0.5),
      kerbB = k.paint("#26282a", 0.05, 0.3),
      gutter = k.concrete("#8d897f", 0.3),
      water = k.metal("#1e2421", 0.08, 0.2);
    // Ground: plots and verges are bare laterite.
    b.box(far, 1400, 0.4, 1400, 0, -0.62, -25);
    b.box(dirt, 300, 0.3, 340, 0, -0.17, -25);
    const L = AV.to - AV.from,
      mid = (AV.from + AV.to) / 2;
    // Carriageways (the median is separate; junctions get full-width asphalt).
    for (const s of [-1, 1]) b.box(asphalt, AV.edge - AV.median, 0.12, L, (s * (AV.edge + AV.median)) / 2, -0.06, mid);
    const sideLen = SIDE_X - STREET.half - AV.edge;
    for (const j of JUNCTIONS) {
      b.box(asphalt, AV.median * 2, 0.12, 15, 0, -0.06, j);
      for (const s of [-1, 1]) b.box(asphalt, sideLen, 0.12, STREET.half * 2, s * (AV.edge + sideLen / 2), -0.06, j);
    }
    for (const s of [-1, 1]) b.box(asphalt, STREET.half * 2, 0.12, L, s * SIDE_X, -0.06, mid);
    // Avenue kerbs, open drains and footpaths, broken at junctions.
    const cuts: [number, number][] = [];
    let z0 = AV.from;
    for (const j of JUNCTIONS) {
      cuts.push([z0, j - STREET.drain]);
      z0 = j + STREET.drain;
    }
    cuts.push([z0, AV.to]);
    for (const s of [-1, 1])
      for (const [a, c] of cuts) {
        const len = c - a,
          m = (a + c) / 2;
        for (let z = a; z < c - 0.05; z += 1.0) {
          const l = Math.min(1, c - z);
          b.box(Math.floor(z) % 2 ? kerbW : kerbB, 0.25, 0.3, l, s * (AV.edge + 0.125), 0.05, z + l / 2);
        }
        b.box(gutter, 0.15, 0.62, len, s * (AV.kerb + 0.075), -0.16, m);
        b.box(gutter, 0.15, 0.62, len, s * (AV.drain - 0.075), -0.16, m);
        b.box(water, AV.drain - AV.kerb - 0.3, 0.05, len, (s * (AV.kerb + AV.drain)) / 2, -0.4, m);
        b.box(paving, AV.foot - AV.drain, 0.28, len, (s * (AV.drain + AV.foot)) / 2, 0.02, m);
        b.box(dirt, AV.plot - AV.foot + 0.2, 0.2, len, (s * (AV.foot + AV.plot)) / 2, -0.02, m);
        // Crossing slabs meet the paving edge without overlapping its top surface.
        for (let z = a + 4; z < c - 2; z += r.range(7, 13)) b.box(k.concrete("#a29d92"), AV.drain - AV.kerb, 0.12, 2.6, (s * (AV.kerb + AV.drain)) / 2, 0.1, z);
        for (let z = a; z < c; z += 0.9) if (r.chance(0.55)) this.grassSpots.push(new V(s * r.range(AV.foot + 0.2, AV.plot - 0.2), 0, z + r.range(-0.4, 0.4)));
        b.collide(0.3, 0.6, len, s * (AV.kerb + 0.15), 0, m);
      }
    // Side streets: kerbs, narrow drains, laterite verges with grass.
    for (const j of JUNCTIONS)
      for (const s of [-1, 1]) {
        const x0 = AV.drain,
          x1 = SIDE_X - STREET.drain;
        const len = x1 - x0,
          m = (x0 + x1) / 2;
        for (const e of [-1, 1]) {
          b.box(kerbB, len, 0.26, 0.2, s * m, 0.04, j + e * (STREET.half + 0.1));
          b.box(gutter, len, 0.5, 0.12, s * m, -0.12, j + e * (STREET.drain - 0.06));
          b.box(water, len, 0.05, 0.9, s * m, -0.35, j + e * (STREET.half + 0.65));
          b.box(dirt, len, 0.2, STREET.plotGap - STREET.drain, s * m, -0.02, j + (e * (STREET.drain + STREET.plotGap)) / 2);
          for (let x = x0; x < x1; x += 1.1) if (r.chance(0.5)) this.grassSpots.push(new V(s * x, 0, j + e * r.range(STREET.drain + 0.2, STREET.plotGap)));
        }
      }
    // Markings: worn lane dashes, edge lines, stop lines and zebra crossings.
    const paint = k.paint("#e9e6da", 0, 0),
      yellow = k.paint("#e2b53a", 0, 0);
    for (let z = AV.from; z < AV.to; z += 9) {
      if (inJunction(z, 9)) continue;
      for (const s of [-1, 1]) if (r.chance(0.85)) b.box(paint, 0.13, 0.01, 3, s * 5.15, 0.008, z);
    }
    for (const s of [-1, 1]) for (const [a, c] of cuts) b.box(yellow, 0.1, 0.01, c - a - 2, s * (AV.edge - 0.35), 0.008, (a + c) / 2);
    for (const j of JUNCTIONS)
      for (const s of [-1, 1]) {
        b.box(paint, AV.edge - AV.median - 0.4, 0.01, 0.35, (s * (AV.edge + AV.median)) / 2, 0.008, j - s * 6.2);
        if (j === 28 || j === -65) for (let x = -AV.edge + 0.8; x < AV.edge - 0.5; x += 1.1) if (Math.abs(x) > AV.median) b.box(paint, 0.55, 0.01, 3.2, x, 0.008, j + 9.5);
      }
    // Speed bumps, painted black and yellow.
    for (const z of [60, -140])
      for (let x = -AV.edge + 0.4; x < AV.edge - 0.3; x += 0.9) {
        if (Math.abs(x + 0.45) < AV.median + 0.2) continue;
        b.box(Math.floor(x / 0.9) % 2 ? yellow : kerbB, 0.9, 0.09, 1.1, x + 0.45, 0.02, z);
      }
    // Wear: patches, oil stains, sand blown against the kerb.
    const patch = k.ground("asphalt", "#7d7f78");
    for (let i = 0; i < 60; i++) {
      const s = r.chance(0.5) ? 1 : -1;
      b.box(patch, r.range(0.8, 2.8), 0.006, r.range(1, 4.5), s * r.range(AV.median + 0.8, AV.edge - 0.6), 0.012, r.range(AV.from + 5, AV.to - 5), r.range(-0.4, 0.4));
    }
    for (let i = 0; i < 70; i++) {
      const s = r.chance(0.5) ? 1 : -1;
      b.quad(k.decal("shadow"), r.range(0.5, 1.6), r.range(0.5, 2.4), s * r.range(AV.median + 0.6, AV.edge - 0.4), 0.02, r.range(AV.from + 5, AV.to - 5), r.range(0, 3), -Math.PI / 2);
    }
    const sand = k.ground("laterite", "#e6c9a6");
    for (const s of [-1, 1])
      for (let i = 0; i < 50; i++) {
        const z = r.range(AV.from + 5, AV.to - 5);
        if (inJunction(z, 6)) continue;
        b.box(sand, r.range(0.3, 0.9), 0.02, r.range(2, 7), s * (AV.edge - 0.35), 0.0, z);
      }
  }

  median() {
    const k = this.kit,
      b = k.b,
      r = k.r;
    const kerbW = k.paint("#e7e3d8", 0.05, 0.5),
      kerbB = k.paint("#26282a", 0.05, 0.3),
      dirt = k.ground("laterite", "#b08a62");
    let z0 = AV.from;
    const spans: [number, number][] = [];
    for (const j of JUNCTIONS) {
      spans.push([z0, j - 7.5]);
      z0 = j + 7.5;
    }
    spans.push([z0, AV.to]);
    for (const [a, c] of spans) {
      const len = c - a,
        m = (a + c) / 2;
      b.box(dirt, AV.median * 2 - 0.3, 0.26, len - 0.3, 0, 0.05, m);
      // Side blocks stop at the end caps so their exterior faces never overlap.
      for (const s of [-1, 1])
        for (let z = a + 0.1; z < c - 0.1; z += 1.0) {
          const l = Math.min(1, c - 0.1 - z);
          b.box(Math.floor(z) % 2 ? kerbW : kerbB, 0.18, 0.32, l, s * (AV.median - 0.09), 0.06, z + l / 2);
        }
      b.box(kerbW, AV.median * 2, 0.32, 0.1, 0, 0.06, a + 0.05);
      b.box(kerbW, AV.median * 2, 0.32, 0.1, 0, 0.06, c - 0.05);
      b.collide(AV.median * 2, 0.6, len, 0, 0.1, m);
      for (let z = a + 1; z < c - 1; z += 0.8) if (r.chance(0.7)) this.grassSpots.push(new V(r.range(-1, 1), 0.18, z));
      // Royal palms and double-arm lamps alternate down the median.
      let n = 0;
      for (let z = a + 8; z < c - 6; z += 17, n++) {
        if (n % 2 === 0) royalPalm(k, 0, z, r.range(9, 11.5));
        else this.lampPost(0, z);
        if (r.chance(0.6) && z + 8.5 < c - 2) shrub(k, r.range(-0.5, 0.5), z + 8.5, 0.8);
      }
    }
  }
  lampPost(x: number, z: number) {
    const k = this.kit,
      b = k.b;
    const steel = k.metal("#7f8582", 0.45, 0.65);
    b.cylinder(steel, 0.09, 0.16, 9.6, x, 4.8, z, 10);
    b.cylinder(k.concrete("#9e998e"), 0.3, 0.34, 0.5, x, 0.45, z, 10);
    for (const s of [-1, 1]) {
      b.bar(steel, new V(x, 9.1, z), new V(x + s * 2.4, 9.55, z), 0.05);
      b.bar(steel, new V(x + s * 2.4, 9.55, z), new V(x + s * 3.4, 9.45, z), 0.05);
      b.box(k.metal("#5b605e", 0.5, 0.5), 0.9, 0.18, 0.4, x + s * 3.5, 9.4, z);
      b.box(k.emissive("#ffc27a", 9, 0, "#f3eadb"), 0.66, 0.04, 0.28, x + s * 3.5, 9.3, z);
      k.lamps.push(new V(x + s * 3.5, 9.25, z));
    }
    b.collide(0.4, 9.6, 0.4, x, 4.8, z);
  }
  utilities() {
    const k = this.kit,
      b = k.b,
      r = k.r;
    const wood = k.concrete("#5a4a38", 0.05),
      wire = k.metal("#151515", 0.6, 0.2),
      ceramic = k.plastic("#d8d6cc", 0.4);
    for (const s of [-1, 1]) {
      const poles: number[] = [];
      for (let z = AV.from + 10; z < AV.to - 5; z += 34) if (!inJunction(z + 8.5, 9)) poles.push(z + 8.5);
      const x = s * (AV.foot - 0.35);
      for (const z of poles) {
        b.cylinder(wood, 0.11, 0.16, 9.5, x, 4.75, z, 8);
        b.box(wood, 0.12, 0.12, 2.2, x, 8.9, z);
        for (const dz of [-0.9, 0, 0.9]) b.cylinder(ceramic, 0.06, 0.08, 0.18, x, 9.05, z + dz, 8);
        b.collide(0.4, 9, 0.4, x, 4.5, z);
        if (r.chance(0.25)) {
          b.box(k.metal("#56705c", 0.55, 0.45), 0.7, 1.1, 0.9, x + s * 0.55, 6.4, z);
          b.box(k.metal("#3b3d3b"), 0.9, 0.08, 1.2, x + s * 0.55, 5.8, z);
        }
        if (r.chance(0.5)) {
          b.bar(k.metal("#555"), new V(x, 7.4, z), new V(x - s * 1.2, 7.6, z), 0.04);
          b.box(k.emissive("#ffd9a0", 6, 0), 0.4, 0.08, 0.25, x - s * 1.25, 7.5, z);
          k.lamps.push(new V(x - s * 1.25, 7.45, z));
        }
      }
      for (let i = 0; i < poles.length - 1; i++) {
        if (poles[i + 1] - poles[i] > 40) continue;
        for (const dz of [-0.9, 0, 0.9]) {
          const a = new V(x, 9.12, poles[i] + dz),
            c = new V(x, 9.12, poles[i + 1] + dz);
          const sag = new V(0, -0.9 - r.next() * 0.3, 0);
          const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(c, 0.5).add(sag), c);
          const g = new THREE.TubeGeometry(curve, 14, 0.016, 4, false);
          b.geometry(g, wire, undefined, false);
          g.dispose();
        }
      }
      // Service drops from poles to the buildings.
      for (const z of poles)
        for (let i = 0; i < 3; i++) {
          const a = new V(x, 8.9, z),
            c = new V(s * r.range(18.5, 21), r.range(5, 9), z + r.range(-8, 8));
          const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(c, 0.5).add(new V(0, -0.7, 0)), c);
          const g = new THREE.TubeGeometry(curve, 10, 0.012, 3, false);
          b.geometry(g, wire, undefined, false);
          g.dispose();
        }
    }
  }

  // ------------------------------------------------------------ plots and buildings
  /** Place a building whose local front (+z) faces the avenue on side s. */
  private facing(s: number, x: number, z: number, build: () => void) {
    const b = this.kit.b;
    b.push(s * x, 0, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    build();
    b.pop();
  }
  private facingRoad(s: number, x: number, z: number, build: () => void) {
    const b = this.kit.b;
    b.push(s * x, 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    build();
    b.pop();
  }
  /** World z of a stair core / unit placed with facing(). */
  private along(s: number, zc: number, local: number) {
    return zc + s * local;
  }
  private yard(s: number, x0: number, x1: number, z0: number, z1: number) {
    const k = this.kit,
      b = k.b,
      r = k.r;
    // Bare courtyard with tanks, a generator and parked cars.
    b.box(k.ground("laterite"), Math.abs(x1 - x0), 0.04, z1 - z0, (s * (x0 + x1)) / 2, 0.0, (z0 + z1) / 2);
    const n = Math.floor((z1 - z0) / 4);
    for (let i = 0; i < n; i++) {
      const z = z0 + 2 + i * 4;
      if (r.chance(0.45)) k.tank(s * (x0 + 1.6), 0, z, true);
      else if (r.chance(0.5)) generator(k, s * (x0 + 1.4), z, r.range(0, 3));
    }
    for (let z = z0 + 3; z < z1 - 3; z += r.range(6.5, 10)) if (r.chance(0.55)) k.parking.push([s * (x1 - 3.2), z, r.chance(0.5) ? 0 : Math.PI]);
    if (r.chance(0.6)) neem(k, s * ((x0 + x1) / 2 - 0.5), z0 + r.range(3, z1 - z0 - 3), r.range(7, 9));
    for (let z = z0; z < z1; z += 1.3) if (r.chance(0.25)) this.grassSpots.push(new V(s * r.range(x0, x1), 0, z));
  }
  /** Compound wall along the avenue frontage with gates. */
  private frontWall(s: number, z0: number, z1: number, gates: number[], color: string) {
    const k = this.kit,
      b = k.b,
      r = k.r;
    const finish = r.chance(0.4) ? k.blocks() : k.paint(color, 0.35, 0.6);
    const coping = k.paint("#d8d2c4", 0.2, 0.3);
    const x = s * (AV.plot + 0.15);
    let z = z0;
    for (const g of [...gates].sort((a, c) => a - c)) {
      if (g - 2 > z + 0.3) {
        k.wall(x, z, x, g - 2, 2.1, finish, coping);
        if (r.chance(0.45)) k.bougainvillea(x, 2.0, (z + g - 2) / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.min(5, g - 2 - z));
      }
      b.push(x, 0, g, Math.PI / 2);
      k.gate(0, 0, 3.8, 2.0, r.pick(["#1d1f1e", "#244a33", "#2b4c7a", "#6a2b22", "#5f6463"]), r.range(0, 0.9));
      b.pop();
      for (const e of [-1, 1]) b.box(finish, 0.4, 2.4, 0.4, x, 1.2, g + e * 2.0);
      z = g + 2;
    }
    if (z1 > z + 0.5) k.wall(x, z, x, z1, 2.1, finish, coping);
    // Painted wall messages.
    if (r.chance(0.55) && z1 - z0 > 6) {
      const msg = r.pick([["THIS HOUSE IS", "NOT FOR SALE"], ["POST NO BILL"], ["NO PARKING", "GATE IN USE"], ["BEWARE OF DOG"]]);
      const rect = k.signs.add("wall-" + msg.join(""), msg, "#000", r.pick(["#9b1b1b", "#1d1d1d", "#1d3f8f"]), 512, 160, "wall");
      let zz = r.range(z0 + 1.6, z1 - 1.6);
      for (const g of gates) if (Math.abs(zz - g) < 3.4) zz = g + (zz > g ? 3.4 : -3.4);
      b.push(x - s * 0.13, 1.15, zz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.quad(k.wallPaint(), 2.6, 0.8, 0, 0, 0, 0, 0, rect);
      b.pop();
    }
  }
  private duplexGates(s: number, zc: number, units: number) {
    const L = units * 7.4;
    return Array.from({ length: units }, (_, i) => this.along(s, zc, -L / 2 + 7.4 * (i + 0.5) + 1.6));
  }
  plots() {
    const k = this.kit,
      r = k.r;
    const S = SEGMENTS;
    const shopsFrom = (n: number, exclude?: number, landmark?: number) =>
      Array.from({ length: n }, (_, i) => (i === landmark ? ("landmark" as const) : i === exclude ? null : r.pick(shopNames)));
    for (const s of [-1, 1]) {
      // S0: estate block and terraced duplexes behind block walls.
      {
        const [z0, z1] = S[0];
        const zb = z0 + 15,
          zd = z1 - 12;
        this.facing(s, 23.6, zb, () => flats(k, { units: 2, floors: 4, flatW: 6 }));
        this.frontWall(s, z0, z0 + 30.5, [zb - 7.4, zb + 7.4], paints.cream);
        this.facing(s, 28.2, zd, () => duplexRow(k, 3));
        this.frontWall(s, z0 + 31.5, z1, this.duplexGates(s, zd, 3), paints.pastelGreen);
        this.yard(s, 30.5, 40, z0 + 2, z0 + 28);
        this.facing(s, 46.5, zb, () => flats(k, { units: 2, floors: 3, flatW: 6, detail: false }));
        this.facingRoad(s, 57, zd, () => bungalow(k, { detail: false }));
      }
      // S1: the arcade on the west, a duplex terrace on the east.
      {
        const [z0, z1] = S[1];
        const zc = (z0 + z1) / 2;
        if (s < 0) {
          this.facing(s, 23.6, zc, () => flats(k, { units: 2, floors: 4, flatW: 6, shops: shopsFrom(4, undefined, 1), landmark: (kk, x, w) => landmarkFront(kk, x, w, "arcade") }));
          this.forecourt(s, z0, z1);
        } else {
          this.facing(s, 28.2, zc, () => duplexRow(k, 4));
          this.frontWall(s, z0, z1, this.duplexGates(s, zc, 4), paints.peach);
        }
        this.yard(s, 31, 40, z0 + 2, z1 - 2);
        this.facing(s, 46.5, zc, () => flats(k, { units: 2, floors: 3, flatW: 6, detail: false }));
        this.facingRoad(s, 57, zc, () => bungalow(k, { detail: false }));
      }
      // S2: the gallery on the east, a residential block on the west.
      {
        const [z0, z1] = S[2];
        const zc = (z0 + z1) / 2;
        if (s > 0) {
          this.facing(s, 23.6, zc, () => flats(k, { units: 2, floors: 4, flatW: 5.5, shops: shopsFrom(4, undefined, 2), landmark: (kk, x, w) => landmarkFront(kk, x, w, "gallery") }));
          this.forecourt(s, z0, z1);
        } else {
          this.facing(s, 23.6, zc, () => flats(k, { units: 2, floors: 4, flatW: 5.5 }));
          this.frontWall(s, z0, z1, [zc - 6.9, zc + 6.9], paints.pastelBlue);
        }
        this.yard(s, 31, 40, z0 + 2, z1 - 2);
        this.facing(s, 46.5, zc, () => flats(k, { units: 2, floors: 3, flatW: 5.5, detail: false }));
        this.facingRoad(s, 57, zc, () => bungalow(k, { detail: false }));
      }
      // S3: the studio on the west, a row of shops on the east.
      {
        const [z0, z1] = S[3];
        const zc = (z0 + z1) / 2;
        this.facing(s, 23.6, zc, () =>
          s < 0
            ? flats(k, { units: 2, floors: 4, shops: shopsFrom(4, 3, 2), landmark: (kk, x, w) => landmarkFront(kk, x, w, "studio") })
            : flats(k, { units: 2, floors: 4, shops: shopsFrom(4) }),
        );
        this.forecourt(s, z0, z1);
        this.yard(s, 31, 40, z0 + 2, z1 - 2);
        this.facing(s, 46.5, zc, () => flats(k, { units: 2, floors: 3, detail: false }));
        this.facingRoad(s, 57, zc, () => bungalow(k, { detail: false }));
      }
      // S4: the courtyard on the east; two blocks on the west.
      {
        const [z0, z1] = S[4];
        const zt = z1 - 15.5;
        if (s > 0) {
          const zd = z0 + 9;
          this.facing(s, 28.2, zd, () => duplexRow(k, 2));
          this.frontWall(s, z0, z0 + 16.5, this.duplexGates(s, zd, 2), paints.butter);
          this.courtyard(s, z0 + 17.5, z0 + 38);
          this.facing(s, 23.6, zt, () => flats(k, { units: 2, floors: 4, shops: shopsFrom(4) }));
          this.forecourt(s, zt - 15.5, z1);
        } else {
          const zb = z0 + 15.5;
          this.facing(s, 23.6, zb, () => flats(k, { units: 2, floors: 4 }));
          this.frontWall(s, z0, z0 + 31, [zb - 7.6, zb + 7.6], paints.mint);
          this.facing(s, 23.6, zt, () => flats(k, { units: 2, floors: 3, shops: shopsFrom(4) }));
          this.forecourt(s, zt - 15.5, z1);
        }
        this.yard(s, 31, 40, z0 + 2, z1 - 2);
        this.facing(s, 46.5, z0 + 16, () => flats(k, { units: 2, floors: 3, detail: false }));
        this.facing(s, 46.5, z1 - 16, () => duplexRow(k, 4, { detail: false }));
        this.facingRoad(s, 57, (z0 + z1) / 2, () => bungalow(k, { detail: false }));
      }
      // S5: bungalows at the top of the avenue.
      {
        const [z0, z1] = S[5];
        const zc = (z0 + z1) / 2;
        this.facing(s, 25.5, zc, () => bungalow(k));
        this.frontWall(s, z0, z1, [zc + s * 0.5], paints.sand);
      }
      // Compound walls along the numbered roads, with a gate into each yard.
      for (const [z0, z1] of S.slice(0, 5))
        for (const ze of [z0, z1]) {
          const x0 = s * (AV.plot + 0.3),
            x1 = s * (SIDE_X - STREET.drain - 2.2);
          const gx = s * 35;
          const finish = r.chance(0.5) ? k.blocks() : k.paint(r.pick(Object.values(paints)), 0.35, 0.6);
          const coping = k.paint("#d8d2c4", 0.2, 0.3);
          k.wall(x0, ze, gx - s * 2, ze, 2.1, finish, coping);
          k.wall(gx + s * 2, ze, x1, ze, 2.1, finish, coping);
          k.gate(gx, ze, 3.8, 2.0, r.pick(["#1d1f1e", "#244a33", "#2b4c7a", "#6a2b22"]), r.range(0, 0.7));
          if (r.chance(0.4)) k.bougainvillea(s * r.range(20, 30), 2.0, ze, 0, 4);
        }
      // Coconut palms and neem inside the compounds.
      for (let i = 0; i < 14; i++) {
        const z = r.range(-176, 128);
        if (inJunction(z, 10)) continue;
        if (r.chance(0.65)) coconut(k, s * r.range(30.5, 39.5), z, r.range(9, 13), r.range(0.8, 2.4), (s > 0 ? Math.PI : 0) + r.range(-1, 1));
        else neem(k, s * r.range(31, 39.5), z, r.range(7, 9.5));
      }
    }
  }
  /** Open, paved forecourt in front of a block with ground-floor shops. */
  private forecourt(s: number, z0: number, z1: number) {
    const k = this.kit,
      b = k.b,
      r = k.r;
    b.box(k.ground("concreteSlab"), 3.6, 0.14, z1 - z0, s * (AV.foot + 1.8), 0.03, (z0 + z1) / 2);
    for (let z = z0 + 2; z < z1 - 2; z += r.range(5, 9)) {
      if (r.chance(0.3)) generator(k, s * (AV.foot + 0.7), z, r.range(0, 3));
      else if (r.chance(0.35)) chairs(k, s * (AV.foot + 0.9), z, 2);
    }
  }
  private courtyard(s: number, z0: number, z1: number) {
    const k = this.kit,
      b = k.b;
    const zc = (z0 + z1) / 2;
    b.box(k.ground("paving", "#c9b9a0"), 14, 0.14, z1 - z0, s * (AV.plot + 7), 0.03, zc);
    almond(k, s * (AV.plot + 8), zc - 3.5, 9.5);
    almond(k, s * (AV.plot + 10), zc + 6.5, 8.2);
    for (let i = 0; i < 4; i++) {
      const x = s * (AV.plot + 3.5 + (i % 2) * 4.5),
        z = zc - 5 + Math.floor(i / 2) * 7;
      b.cylinder(k.plastic("#f2efe6", 0.5), 0.55, 0.55, 0.05, x, 0.78, z, 18);
      b.cylinder(k.plastic("#f2efe6", 0.5), 0.05, 0.08, 0.76, x, 0.38, z, 8);
      chairs(k, x, z, 3);
    }
    kiosk(k, s * (AV.plot + 12.5), zc + 1, s > 0 ? -Math.PI / 2 : Math.PI / 2, "#7a2f28", { key: "drinks", lines: ["COLD DRINKS • SUYA", "OPEN TILL LATE"], bg: "#14311f", fg: "#ffd36b" });
    // Festoon lights strung between poles.
    const bulb = k.emissive("#ffd08a", 5, 0.2, "#fff6e0");
    for (const zz of [zc - 7.5, zc + 7.5]) {
      for (let t = 0; t <= 1.0001; t += 1 / 12) b.box(bulb, 0.09, 0.12, 0.09, s * (AV.plot + 1 + t * 12), 3.6 - Math.sin(t * Math.PI) * 0.6, zz);
      for (const xx of [AV.plot + 1, AV.plot + 13]) b.cylinder(k.metal("#3a3a38"), 0.05, 0.05, 3.7, s * xx, 1.85, zz, 6);
    }
    // Entrance arch with the sign.
    const rect = k.signs.add("courtyard", ["THE COURTYARD", "SAY HELLO"], "#123524", "#f5e6b8", 1024, 220, "panel");
    for (const dz of [-2.4, 2.4]) b.box(k.paint(paints.offWhite, 0.2, 0.5), 0.4, 3.8, 0.4, s * (AV.plot + 0.2), 1.9, zc + dz);
    b.box(k.paint(paints.offWhite, 0.2, 0.3), 0.5, 0.9, 5.4, s * (AV.plot + 0.2), 4.1, zc);
    b.push(s * (AV.plot - 0.08), 4.1, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.quad(k.signs_(true), 4.8, 0.78, 0, 0, 0, 0, 0, rect);
    b.pop();
    this.frontWall(s, z0, zc - 2.6, [], paints.offWhite);
    this.frontWall(s, zc + 2.6, z1, [], paints.offWhite);
  }

  streetTrees() {
    const k = this.kit,
      r = k.r;
    for (const s of [-1, 1])
      for (let z = AV.from + 8; z < AV.to - 4; z += r.range(18, 26)) {
        if (inJunction(z, 10)) continue;
        if (MARKERS.some(([mx, mz]) => Math.sign(mx) === s && Math.abs(mz - z) < 9)) continue;
        almond(k, s * (AV.foot - 1.2), z, r.range(7.5, 10));
      }
  }
  streetLife() {
    const k = this.kit,
      r = k.r;
    for (const j of JUNCTIONS)
      for (const s of [-1, 1])
        for (const e of [-1, 1]) {
          const z = j + e * 10.5;
          if (MARKERS.some(([mx, mz]) => Math.sign(mx) === s && Math.abs(mz - z) < 7)) continue;
          const pick = r.next();
          if (pick < 0.3) kiosk(k, s * (AV.foot - 1.1), z, s > 0 ? -Math.PI / 2 : Math.PI / 2, r.pick(["#2a6db3", "#c0392b", "#f1c40f", "#27ae60"]), r.pick(shopNames));
          else if (pick < 0.6) umbrellaStand(k, s * (AV.foot - 1.3), z, r.pick(["#e74c3c", "#2e86c1", "#f1c40f", "#27ae60"]), r.chance(0.6) ? { key: "pos-mini", lines: ["POS", "CASH OUT"], bg: "#f1c40f", fg: "#111" } : undefined);
          else if (pick < 0.75) vulcanizer(k, s * (AV.foot - 1.2), z, r.range(0, 3));
          else jerrycans(k, s * (AV.foot - 1.6), z);
        }
  }
  signage() {
    const k = this.kit,
      b = k.b;
    const green = k.metal("#2b4f3a", 0.5, 0.3);
    JUNCTIONS.forEach((j, i) => {
      const name = `${31 + i} ROAD`;
      const rect = k.signs.add("road-" + name, [name], "#1f5a3a", "#ffffff", 512, 140, "street");
      for (const s of [-1, 1]) {
        const x = s * (AV.foot - 0.5),
          z = j - s * (STREET.drain + 0.6);
        b.cylinder(green, 0.04, 0.04, 2.9, x, 1.45, z, 8);
        b.push(x, 2.75, z, Math.PI / 2);
        b.box(green, 1.3, 0.38, 0.03, 0, 0, 0);
        b.quad(k.signs_(), 1.24, 0.34, 0, 0, 0.02, 0, 0, rect);
        b.quad(k.signs_(), 1.24, 0.34, 0, 0, -0.02, Math.PI, 0, rect);
        b.pop();
      }
    });
    const rect = k.signs.add("avenue", ["PALM AVENUE"], "#1f5a3a", "#ffffff", 1024, 160, "street");
    for (const z of [97, -150]) {
      for (const x of [-1.1, 1.1]) b.cylinder(green, 0.05, 0.05, 3.2, x, 1.6, z, 8);
      b.box(green, 2.5, 0.44, 0.04, 0, 3.0, z);
      for (const ry of [0, Math.PI]) {
        b.push(0, 3.0, z, ry);
        b.quad(k.signs_(), 2.4, 0.38, 0, 0, 0.03, 0, 0, rect);
        b.pop();
      }
    }
  }
  /** Simpler blocks beyond the side roads and a hazy skyline so the estate continues. */
  distant() {
    const k = this.kit,
      b = k.b,
      r = k.r;
    const grid = this.facadeGrid();
    for (const s of [-1, 1])
      for (let z = -176; z < 130; z += r.range(22, 30)) {
        const x = s * r.range(86, 96);
        const h = r.chance(0.6) ? 9.5 : 12.5;
        const len = r.range(18, 26);
        b.box(grid(r.pick(Object.values(paints))), 10.5, h, len, x, h / 2, z);
        b.box(k.paint("#d8d2c4", 0.2, 0.2), 10.9, 0.7, len + 0.3, x, h + 0.35, z);
        if (r.chance(0.6)) k.tank(x + r.range(-3, 3), h, z + r.range(-6, 6), true);
        if (r.chance(0.5)) coconut(k, s * r.range(78, 82), z + r.range(-10, 10), r.range(10, 13), r.range(0.5, 2), r.range(0, 6));
      }
    for (let x = -100; x <= 100; x += 25)
      for (const z of [-205, 160]) {
        const h = r.range(9, 13);
        b.box(grid(r.pick(Object.values(paints))), r.range(18, 24), h, 10.5, x + r.range(-3, 3), h / 2, z);
      }
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      const rad = r.range(280, 460);
      const tall = r.chance(0.15);
      const h = tall ? r.range(24, 46) : r.range(8, 16);
      b.box(grid(r.pick(["#b9ad98", "#a9a49a", "#c6b9a0"]), true), r.range(14, 30), h, r.range(12, 24), Math.cos(a) * rad, h / 2, -25 + Math.sin(a) * rad, r.range(0, Math.PI));
    }
    const steel = k.metal("#7b7f7c", 0.6, 0.6);
    this.beacon = new THREE.MeshBasicMaterial({ color: "#ff2a1a", fog: false });
    this.extra.push(this.beacon);
    for (const [x, z, h] of [
      [150, -250, 52],
      [-210, 40, 44],
    ]) {
      b.cylinder(steel, 0.35, 1.6, h, x, h / 2, z, 4);
      for (let y = 10; y < h; y += 9) b.box(steel, 2.4 - y * 0.03, 0.3, 2.4 - y * 0.03, x, y, z);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), this.beacon);
      light.position.set(x, h + 0.6, z);
      this.root.add(light);
    }
  }
  /** Painted facade with a window grid; windows glow at night. */
  private facadeGrid() {
    const k = this.kit;
    const make = (lit: boolean) => {
      const S = 128;
      const arr = new Uint8Array(S * S * 4);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const cx = x % 32,
            cy = y % 32;
          const win = cx > 6 && cx < 26 && cy > 10 && cy < 25;
          const on = Math.sin((Math.floor(x / 32) + Math.floor(y / 32) * 4) * 91.7) > 0.25;
          const i = (y * S + x) * 4;
          if (lit) {
            arr[i] = win && on ? 255 : 0;
            arr[i + 1] = win && on ? 196 : 0;
            arr[i + 2] = win && on ? 128 : 0;
          } else {
            arr[i] = arr[i + 1] = win ? 58 : 255;
            arr[i + 2] = win ? 66 : 255;
          }
          arr[i + 3] = 255;
        }
      const t = new THREE.DataTexture(arr, S, S, THREE.RGBAFormat);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    };
    const base = make(false),
      glow = make(true);
    const cache = new Map<string, THREE.Material>();
    return (color: string, far = false) => {
      const key = color + far;
      if (!cache.has(key)) {
        const m = new THREE.MeshStandardMaterial({ color, map: base, emissiveMap: glow, emissive: "#ffffff", roughness: 0.92 });
        m.userData.tile = 12;
        k.night.add(m, far ? 1.4 : 1.1);
        cache.set(key, m);
        this.extra.push(m);
      }
      return cache.get(key)!;
    };
  }
  private lightPools() {
    const count = this.lamps.length;
    if (!count) return;
    const mat = new THREE.MeshBasicMaterial({
      map: T.disc(),
      color: "#ffb766",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.extra.push(mat);
    const plane = new THREE.PlaneGeometry(14, 14);
    plane.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(plane, mat, count);
    const o = new THREE.Object3D();
    this.lamps.forEach((l, i) => {
      o.position.set(l.x, 0.05, l.z);
      o.scale.setScalar(l.y > 8 ? 1 : 0.75);
      o.updateMatrix();
      this.pools!.setMatrixAt(i, o.matrix);
    });
    this.pools.visible = false;
    this.pools.renderOrder = 2;
    this.root.add(this.pools);
  }
  update(time: number, night = 0) {
    wind.value = time;
    this.kit.night.update(night);
    const glow = THREE.MathUtils.smoothstep(night, 0.3, 0.9);
    if (this.pools) {
      (this.pools.material as THREE.MeshBasicMaterial).opacity = glow * 0.85;
      this.pools.visible = glow > 0.01;
    }
    if (this.beacon) this.beacon.color.setRGB(Math.sin(time * 3) > 0.55 ? 4 : 0.35, 0.05, 0.02);
  }
  dispose() {
    this.root.removeFromParent();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of [...this.kit.materials, ...this.extra]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      m.dispose();
    }
    textures.forEach((t) => t.dispose());
    T.resetTextures();
  }
}

/** Glass shopfronts for the portfolio destinations. */
export function landmarkFront(k: Kit, x: number, w: number, kind: "studio" | "gallery" | "arcade") {
  const b = k.b;
  const h = 2.3;
  const arcade = kind === "arcade";
  const warm = k.emissive(arcade ? "#9c7bff" : "#ffe7c2", arcade ? 1.1 : 0.85, arcade ? 0.55 : 0.45, "#f4efe6");
  // Bright interior box behind the glass.
  b.box(warm, w - 0.3, 0.05, 2.6, x, 0.55, -1.3);
  b.box(warm, w - 0.3, h, 0.05, x, 0.5 + h / 2, -2.6);
  b.box(warm, w - 0.3, 0.05, 2.6, x, 0.5 + h, -1.3);
  for (const s of [-1, 1]) b.box(warm, 0.05, h, 2.6, x + s * (w / 2 - 0.15), 0.5 + h / 2, -1.3);
  if (kind === "studio") {
    b.box(k.metal("#2b2b2b", 0.4, 0.2), 2.2, 0.06, 0.8, x - 0.6, 1.25, -1.6);
    b.box(k.emissive("#9fd0ff", 2.4, 1.2, "#111"), 0.7, 0.42, 0.03, x - 1.0, 1.55, -1.85);
    b.box(k.emissive("#c5ed8b", 2.4, 1.2, "#111"), 0.7, 0.42, 0.03, x - 0.1, 1.55, -1.85);
    b.box(k.plastic("#3a6b4f", 0.8), 0.6, 0.9, 0.6, x + 1.4, 0.95, -1.8);
  } else if (kind === "gallery") {
    for (let i = 0; i < 3; i++) {
      b.box(k.metal("#1d1d1d", 0.5, 0.2), 1.05, 0.8, 0.04, x - 1.6 + i * 1.6, 1.8, -2.55);
      b.box(k.emissive(["#ffd198", "#9edbd1", "#c6b7f3"][i], 1.4, 0.8, "#eee"), 0.9, 0.65, 0.02, x - 1.6 + i * 1.6, 1.8, -2.52);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const cx = x - 1.6 + i * 1.6;
      b.box(k.metal(["#c0392b", "#2e86c1", "#8e44ad"][i], 0.45, 0.4), 0.75, 1.8, 0.7, cx, 1.4, -2.1);
      b.box(k.emissive(["#ff6b6b", "#5ad1ff", "#c6b7f3"][i], 3, 1.6, "#000"), 0.55, 0.45, 0.02, cx, 1.85, -1.74, 0, -0.25);
    }
  }
  const alu = k.metal("#b7bcbc", 0.3, 0.85);
  b.box(k.glass("#3a4a4e"), w - 0.3, h, 0.03, x, 0.5 + h / 2, 0.04);
  for (let i = 0; i <= 3; i++) b.box(alu, 0.06, h, 0.08, x - (w - 0.3) / 2 + (i * (w - 0.3)) / 3, 0.5 + h / 2, 0.06);
  b.box(alu, w - 0.2, 0.08, 0.1, x, 0.5 + h, 0.06);
  b.box(k.concrete("#b4ada0"), w + 0.4, 0.5, 1.8, x, 0.25, 0.9);
  const label = kind === "studio" ? ["THE STUDIO", "ABOUT ME"] : kind === "gallery" ? ["THE GALLERY", "SELECTED WORK"] : ["PLAY ROOM", "ARCADE • GAMES"];
  const col = kind === "studio" ? "#c5ed8b" : kind === "gallery" ? "#ffd198" : "#c6b7f3";
  const rect = k.signs.add("landmark-" + kind, label, "#0d1512", col, 1024, 220, "neon");
  b.box(k.metal("#1b1f1d", 0.5, 0.3), w - 0.1, 0.52, 0.08, x, 3.08, 0.12);
  b.quad(k.signs_(true), w - 0.3, 0.46, x, 3.08, 0.17, 0, 0, rect);
}
