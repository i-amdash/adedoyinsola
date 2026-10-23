import * as THREE from "three";
import type { Kit } from "./Kit";

// Building types of a 1970s federal housing estate in Lagos, as they look today:
// walk-up blocks of flats with stair cores and screen walls, owner-painted terraced
// duplexes, bungalows behind block walls, converted ground-floor shops and kiosks.
// Every builder works in a local frame: front facade faces +z, ground at y = 0.

export const paints = {
  pastelGreen: "#a8c4a0",
  pastelBlue: "#a6bfcf",
  cream: "#ddd0b0",
  peach: "#e0b48f",
  butter: "#e4d396",
  offWhite: "#dcd8cc",
  mint: "#b9d3bf",
  sky: "#9fc1d8",
  sand: "#cdb99a",
  salmon: "#d99f86",
};
const paintList = Object.values(paints);
const bases = ["#7c4b3c", "#6d6a62", "#5a3b33", "#4f5d52", "#8a5a40"];
const trims = ["#ebe7dc", "#e2d9c3", "#d8d3c7", "#efe6cf"];

export type Shop = { key: string; lines: string[]; bg: string; fg: string; style?: "painted" | "panel" | "neon" };
export const shopNames: Shop[] = [
  { key: "provisions", lines: ["MAMA T PROVISIONS", "SOFT DRINKS • BREAD • DETERGENT"], bg: "#1e4f8a", fg: "#ffffff" },
  { key: "salon", lines: ["BLESSED HANDS", "UNISEX SALON & BARBING"], bg: "#7a1f4f", fg: "#ffe9f4" },
  { key: "phones", lines: ["GOD'S TIME PHONES", "ACCESSORIES • REPAIRS"], bg: "#f0c419", fg: "#1a1a1a" },
  { key: "chemist", lines: ["DE-LIGHT CHEMIST", "PATENT MEDICINE STORE"], bg: "#1f7a4c", fg: "#ffffff" },
  { key: "cyber", lines: ["NET CONNECT CYBER CAFE", "PRINTING • TYPING • SCANNING"], bg: "#20262c", fg: "#7fe0ff" },
  { key: "tailor", lines: ["TOKS FASHION DESIGNER", "MALE & FEMALE • ASO-EBI"], bg: "#e9e1cf", fg: "#8a1c1c" },
  { key: "pos", lines: ["EXPRESS POS", "TRANSFER • WITHDRAWAL • DEPOSIT"], bg: "#0f5c8f", fg: "#ffe14a" },
  { key: "eatery", lines: ["CHOP & GO EATERY", "RICE • BEANS • SWALLOW • PEPPER SOUP"], bg: "#c0392b", fg: "#fff3d6" },
  { key: "spare", lines: ["UNITY AUTO SPARE PARTS"], bg: "#2c3e50", fg: "#f1c40f" },
  { key: "electric", lines: ["BRIGHT LIGHT ELECTRICALS", "CABLES • BULBS • INVERTERS"], bg: "#f39c12", fg: "#1b1b1b" },
  { key: "laundry", lines: ["SPARKLE DRY CLEANERS"], bg: "#2980b9", fg: "#ffffff" },
  { key: "bukka", lines: ["IYA BASIRAT BUKA", "AMALA • EWEDU • GBEGIRI"], bg: "#e8d9a8", fg: "#5b2c0f" },
];

/** Hipped or gabled roof shell as raw geometry. */
function roofGeometry(w: number, d: number, rise: number, hip: boolean) {
  const a = [-w / 2, 0, -d / 2],
    b = [w / 2, 0, -d / 2],
    c = [w / 2, 0, d / 2],
    e = [-w / 2, 0, d / 2];
  const r1 = [hip ? -w * 0.28 : -w / 2, rise, 0],
    r2 = [hip ? w * 0.28 : w / 2, rise, 0];
  const tris = [a, r1, r2, a, r2, b, c, r2, r1, c, r1, e];
  if (hip) tris.push(b, r2, c, e, r1, a);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((tris.length) * 2).fill(0), 2));
  return g;
}
export function roof(k: Kit, w: number, d: number, y: number, rise: number, hip: boolean, mat: THREE.Material) {
  const g = roofGeometry(w, d, rise, hip);
  k.b.push(0, y, 0);
  k.b.geometry(g, mat);
  // Underside, so eaves read from below.
  const under = g.clone();
  under.translate(0, -0.03, 0);
  const idx = under.getAttribute("position");
  for (let i = 0; i < idx.count; i += 3) {
    // Flip winding so the underside faces down.
    const x = idx.getX(i + 1), yy = idx.getY(i + 1), z = idx.getZ(i + 1);
    idx.setXYZ(i + 1, idx.getX(i + 2), idx.getY(i + 2), idx.getZ(i + 2));
    idx.setXYZ(i + 2, x, yy, z);
  }
  under.computeVertexNormals();
  k.b.geometry(under, k.paint("#cfc8b6", 0.1, 0));
  k.b.pop();
  g.dispose();
  under.dispose();
  // Fascia boards.
  const fascia = k.paint("#d8d2c4", 0.2, 0);
  k.b.box(fascia, w + 0.06, 0.18, 0.04, 0, y + 0.02, d / 2);
  k.b.box(fascia, w + 0.06, 0.18, 0.04, 0, y + 0.02, -d / 2);
  if (!hip) {
    // Gable infill walls are painted; the caller supplies the colour by drawing the triangle.
  }
}

function parapetStreaks(k: Kit, L: number, top: number, z: number) {
  const r = k.r;
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.6; x += r.range(0.8, 2.6)) {
    const w = r.range(0.6, 2.4),
      h = r.range(0.8, 3.4);
    if (r.chance(0.75)) k.b.quad(k.decal("streak"), w, h, x, top - h / 2, z);
  }
}

// ------------------------------------------------------------------ walk-up flats
export type FlatsOptions = {
  units: number; // stair units, each with a flat either side
  floors: number;
  flatW?: number;
  color?: string;
  detail?: boolean;
  shops?: (Shop | "landmark" | null)[]; // one entry per ground-floor flat
  landmark?: (k: Kit, x: number, w: number) => void; // draws a landmark shopfront
};
export function flats(k: Kit, o: FlatsOptions) {
  const b = k.b,
    r = k.r;
  const detail = o.detail !== false;
  const color = o.color || r.pick(paintList);
  const wall = k.paint(color),
    trim = k.paint(r.pick(trims), 0.18, 0.2),
    base = k.paint(r.pick(bases), 0.25, 0.7),
    balconyWall = k.paint(r.chance(0.5) ? color : r.pick(trims), 0.4, 0.3);
  const flatW = o.flatW ?? 6.2,
    coreW = 2.8,
    D = 10.5,
    fh = 3,
    plinth = 0.5;
  const L = o.units * (2 * flatW + coreW);
  const F = o.floors;
  const top = plinth + F * fh;
  b.box(wall, L, top - plinth, D, 0, plinth + (top - plinth) / 2, 0);
  b.box(base, L + 0.12, plinth, D + 0.12, 0, plinth / 2, 0);
  b.collide(L + 0.3, top + 1, D + 2.4, 0, top / 2, 0.4);
  for (let f = 1; f <= F; f++) b.box(trim, L + 0.18, 0.2, D + 0.18, 0, plinth + f * fh - 0.08, 0);
  // Roof: parapet with coping, slab, stair huts, tanks, dishes.
  b.box(k.concrete("#9c988d", 0.1), L - 0.2, 0.12, D - 0.2, 0, top + 0.06, 0);
  for (const s of [-1, 1]) {
    b.box(wall, L, 0.9, 0.2, 0, top + 0.45, s * (D / 2 - 0.1));
    b.box(wall, 0.2, 0.9, D, s * (L / 2 - 0.1), top + 0.45, 0);
    b.box(trim, L + 0.1, 0.08, 0.32, 0, top + 0.94, s * (D / 2 - 0.1));
    b.box(trim, 0.32, 0.08, D + 0.1, s * (L / 2 - 0.1), top + 0.94, 0);
  }
  if (detail) {
    parapetStreaks(k, L, top + 0.9, D / 2 + 0.005);
    b.push(0, 0, -D / 2 - 0.005, Math.PI);
    parapetStreaks(k, L, top + 0.9, 0);
    b.pop();
  }
  const ground = (x: number, w: number) => {
    // Damp and laterite splash along the base.
    if (detail && r.chance(0.6)) b.quad(k.decal("blotch"), w, r.range(0.6, 1.3), x, r.range(0.5, 0.8), D / 2 + 0.065);
  };
  let flatIndex = 0;
  for (let u = 0; u < o.units; u++) {
    const ux = -L / 2 + u * (2 * flatW + coreW);
    const cx = ux + flatW + coreW / 2;
    // ---- stair core: piers, landings, screen walls, entrance, roof hut.
    const coreH = top + 2.6;
    const cz = D / 2 + 0.5;
    for (const s of [-1, 1]) b.box(wall, 0.3, coreH, 0.9, cx + s * (coreW / 2 - 0.15), coreH / 2, D / 2 + 0.05);
    for (let f = 2; f <= F; f++) {
      b.box(trim, coreW, 0.22, 0.95, cx, plinth + f * fh - 1.6, D / 2 + 0.07);
      if (r.chance(0.6)) b.quad(k.emissive("#ffe2a8", 2.2, 0, "#c9c3b2"), 0.25, 0.12, cx, plinth + f * fh - 1.85, D / 2 + 0.06);
    }
    b.box(trim, coreW + 0.1, 0.14, 1.0, cx, coreH, D / 2 + 0.05);
    b.box(trim, coreW, 0.22, 0.95, cx, plinth + 2.4, D / 2 + 0.07);
    b.quad(k.interior(), coreW - 0.6, coreH - 0.3, cx, coreH / 2, D / 2 + 0.02);
    b.quad(k.interior(), coreW - 0.6, 2.3, cx, plinth + 1.15, cz - 0.02);
    b.box(k.concrete("#8f8b82"), coreW - 0.4, 0.17, 0.8, cx, 0.08, D / 2 + 0.9);
    b.box(k.concrete("#8f8b82"), coreW - 0.4, 0.17, 0.5, cx, 0.25, D / 2 + 0.75);
    const sy0 = plinth + 2.52,
      sh = coreH - 0.1 - sy0;
    b.quad(k.screen(), coreW - 0.6, sh, cx, sy0 + sh / 2, cz, 0, 0, [0, 0, (coreW - 0.6) / 1.2, sh / 1.2]);
    b.box(wall, coreW, 2.6, 3.2, cx, top + 1.3, D / 2 - 1.6);
    b.box(trim, coreW + 0.2, 0.12, 3.4, cx, top + 2.62, D / 2 - 1.6);
    // ---- the two flats on this unit
    for (const side of [-1, 1]) {
      const fx = side < 0 ? ux + flatW / 2 : cx + coreW / 2 + flatW / 2;
      const balX = fx - side * 1.35; // balcony away from the core
      const winX = fx + side * 1.75;
      const shop = o.shops?.[flatIndex] ?? null;
      flatIndex++;
      for (let f = 0; f < F; f++) {
        const yb = plinth + f * fh;
        const isShop = f === 0 && shop;
        b.push(0, 0, D / 2);
        if (isShop) {
          if (shop === "landmark") o.landmark?.(k, fx, flatW - 0.4);
          else shopfront(k, fx, flatW - 0.4, shop);
        } else {
          // Window by the stair.
          k.window(winX, yb + 0.95, 1.8, 1.35, { detail });
          if (detail && r.chance(0.3)) k.ac(winX + side * 1.25, yb + 2.4, 0);
          // Balcony: door + window behind a solid parapet.
          const dark = k.metal(r.pick(["#2c2e2c", "#5a2e24", "#2d3f4f", "#3b3b38"]), 0.6, 0.3);
          b.box(k.interior(), 1.0, 2.15, 0.04, balX - side * 0.7, yb + 1.08, -0.06);
          b.box(dark, 0.95, 2.1, 0.06, balX - side * 0.7, yb + 1.06, 0.02);
          k.window(balX + side * 0.55, yb + 0.95, 1.3, 1.35, { detail, bars: "none" });
          const by = f === 0 ? 0.02 : yb - 0.1;
          b.box(trim, 3.4, 0.2, 1.4, balX, by + 0.1, 0.7);
          b.box(balconyWall, 3.4, 1.05, 0.12, balX, by + 0.72, 1.34);
          for (const s of [-1, 1]) b.box(balconyWall, 0.12, 1.05, 1.3, balX + s * 1.64, by + 0.72, 0.7);
          b.box(trim, 3.5, 0.06, 0.2, balX, by + 1.27, 1.34);
          if (detail) {
            if (r.chance(0.55)) k.laundry(balX - 1.5, balX + 1.5, yb + 2.35, 0.95);
            if (r.chance(0.3)) {
              // Caged balcony: burglar-proof grille up to the slab above.
              const bars = k.metal(r.pick(["#1d1f1e", "#f0ede4", "#5d2a22"]), 0.6, 0.5);
              for (let xx = -1.6; xx <= 1.6; xx += 0.15) b.box(bars, 0.02, fh - 1.3, 0.02, balX + xx, by + 1.3 + (fh - 1.3) / 2, 1.38);
            }
            if (r.chance(0.35)) {
              b.box(k.plastic(r.pick(["#e9e9e2", "#c0392b", "#2a6db3"]), 0.5), 0.45, 0.45, 0.45, balX + side * 0.9, by + 0.42, 0.65);
            }
            if (r.chance(0.2)) k.satellite(balX + side * 1.3, by + 1.3, 1.25);
            b.quad(k.decal("streak"), 3.2, r.range(0.8, 1.8), balX, by - 0.5, 1.405);
          }
        }
        b.pop();
        // Back facade: kitchen and bathroom windows, drainpipes, AC.
        b.push(0, 0, -D / 2, Math.PI);
        k.window(-fx + side * 1.4, yb + 1.1, 1.2, 1.0, { detail: detail && r.chance(0.5) });
        k.window(-fx - side * 1.2, yb + 1.9, 0.6, 0.55, { detail: false, bars: "none" });
        if (detail && r.chance(0.4)) k.ac(-fx - side * 0.2, yb + 1.6, 0);
        if (detail && f === F - 1 && r.chance(0.6)) k.laundry(-fx - 2.4, -fx + 2.4, yb + 2.4, 0.5);
        b.pop();
      }
      ground(fx, flatW);
      if (detail) {
        b.cylinder(k.plastic("#d7d4c8", 0.6), 0.055, 0.055, top, fx + side * 3.0, top / 2, -D / 2 - 0.08, 8);
        b.cylinder(k.plastic("#4b4d4a", 0.6), 0.05, 0.05, top, fx - side * 2.6, top / 2, D / 2 + 0.06, 8);
      }
    }
    // Roof clutter.
    if (detail) {
      for (let i = 0; i < 4; i++) if (r.chance(0.75)) k.tank(cx + r.range(-5, 5), top + 0.12, r.range(-3, 2), r.chance(0.3));
      if (r.chance(0.7)) k.satellite(cx + r.range(-6, 6), top + 0.12, r.range(-3.5, 3.5), r.range(0, Math.PI * 2));
      if (r.chance(0.5)) b.bar(k.metal("#9a9c98", 0.5, 0.6), new THREE.Vector3(cx + 3, top, -3), new THREE.Vector3(cx + 3, top + 4.5, -3), 0.03);
    }
  }
  // Side windows.
  for (const s of [-1, 1]) {
    b.push(s * L / 2, 0, 0, (s * Math.PI) / 2);
    for (let f = 0; f < F; f++) for (const xx of [-2.4, 2.4]) k.window(xx, plinth + f * fh + 1.0, 1.2, 1.3, { detail: detail && r.chance(0.5) });
    if (detail) parapetStreaks(k, D, top + 0.9, 0.005);
    b.pop();
  }
  return { length: L, depth: D, height: top + 1 };
}

/** Converted ground-floor flat: shop opening, half-raised shutter, painted sign, awning. */
export function shopfront(k: Kit, x: number, w: number, shop: Shop) {
  const b = k.b,
    r = k.r;
  const h = 2.55;
  // Opening and interior with stocked shelves.
  b.quad(k.interior(), w - 0.3, h, x, 0.5 + h / 2, 0.02);
  const shelf = k.metal("#6b5a46", 0.8, 0);
  for (const yy of [1.0, 1.6, 2.2]) {
    b.box(shelf, w - 0.6, 0.04, 0.4, x, yy, 0.22);
    for (let xx = -w / 2 + 0.5; xx < w / 2 - 0.5; xx += r.range(0.18, 0.32))
      b.box(k.plastic(r.pick(["#c0392b", "#f1c40f", "#2e86c1", "#27ae60", "#ecf0f1", "#e67e22", "#8e44ad"]), 0.5), 0.14, r.range(0.14, 0.4), 0.22, x + xx, yy + 0.15, 0.24);
  }
  b.box(k.plastic("#e8e3d6", 0.6), w * 0.55, 1.0, 0.6, x + r.range(-0.5, 0.5), 1.0, 0.75);
  // Fluorescent tube: shops trade late, lit by generator power.
  b.box(k.emissive(r.chance(0.7) ? "#e8f4ff" : "#fff1d0", 5, 0, "#f4f4f0"), w * 0.6, 0.05, 0.05, x, 0.5 + h - 0.35, 0.3);
  b.quad(k.emissive("#fff3dc", 0.55, 0.0, "#3a3631"), w - 0.4, h - 0.4, x, 0.5 + h / 2, 0.025);
  // Rolled-up shutter drum and frame.
  b.box(k.sheet("#8f9493"), w - 0.2, 0.55, 0.12, x, 0.5 + h - 0.25, 0.08);
  b.cylinder(k.metal("#7b807f"), 0.16, 0.16, w - 0.2, x, 0.5 + h + 0.12, 0.12, 12, 0, Math.PI / 2);
  // Step / forecourt slab with tiles.
  b.box(k.concrete("#b4ada0"), w + 0.4, 0.5, 1.8, x, 0.25, 0.9);
  // Awning of roofing sheet on two posts, with the painted sign board on its front edge.
  b.box(k.sheet(r.pick(["#7d2e25", "#2d5c3a", "#2f4f7a", "#9aa0a0"])), w, 0.03, 1.9, x, 0.5 + h - 0.2, 1.85, 0, 0.12);
  for (const s of [-1, 1]) b.box(k.metal("#3d3f3c"), 0.06, h - 0.2, 0.06, x + s * (w / 2 - 0.15), 0.5 + (h - 0.2) / 2, 2.7);
  const rect = k.signs.add(shop.key, shop.lines, shop.bg, shop.fg, 1024, 220, shop.style || "painted");
  b.box(k.metal("#3a3a38"), w - 0.1, 0.66, 0.05, x, 3.22, 2.76);
  b.quad(k.signs_(shop.style === "neon"), w - 0.2, 0.6, x, 3.22, 2.79, 0, 0, rect);

}

// ------------------------------------------------------------------ terraced duplexes
export function duplexRow(k: Kit, units: number, o: { detail?: boolean; yard?: number } = {}) {
  const b = k.b,
    r = k.r;
  const detail = o.detail !== false;
  const uw = 7.4,
    D = 11,
    fh = 3.1,
    plinth = 0.45;
  const L = units * uw;
  const H = plinth + 2 * fh;
  const roofMat = k.sheet(r.pick(["#7a2f28", "#2c5a3b", "#2f4f7a", "#5b5f60", "#8c3b23"]));
  const trim = k.paint(r.pick(trims), 0.18, 0.2);
  b.collide(L + 0.3, H + 2, D + 2.2, 0, H / 2, 0.4);
  for (let i = 0; i < units; i++) {
    const x = -L / 2 + uw * (i + 0.5);
    // Owners repaint their own unit: same block, different colours.
    const wall = k.paint(r.pick(paintList));
    b.box(wall, uw, H - plinth, D, x, plinth + (H - plinth) / 2, 0);
    b.box(k.paint(r.pick(bases), 0.25, 0.7), uw + 0.08, plinth, D + 0.08, x, plinth / 2, 0);
    b.box(trim, uw + 0.12, 0.2, D + 0.12, x, plinth + fh - 0.05, 0);
    b.push(0, 0, D / 2);
    // Porch canopy doubling as the balcony floor.
    b.box(trim, 3.0, 0.18, 1.7, x - 1.6, plinth + fh - 0.05, 0.85);
    for (const s of [-1, 1]) b.box(trim, 0.22, fh - 0.15, 0.22, x - 1.6 + s * 1.35, plinth + (fh - 0.15) / 2, 1.55);
    const door = k.metal(r.pick(["#3b2a1d", "#5a2e24", "#1e2c3a", "#2d3a2a"]), 0.55, 0.35);
    b.box(k.interior(), 1.1, 2.25, 0.03, x - 1.6, plinth + 1.12, -0.04);
    b.box(door, 1.05, 2.2, 0.06, x - 1.6, plinth + 1.1, 0.02);
    b.box(k.metal("#c8a654", 0.3, 0.9), 0.04, 0.12, 0.04, x - 1.2, plinth + 1.1, 0.07);
    k.window(x + 1.6, plinth + 0.95, 2.0, 1.35, { detail });
    k.window(x + 1.6, plinth + fh + 0.95, 2.0, 1.35, { detail });
    k.window(x - 1.6, plinth + fh + 0.95, 1.4, 1.35, { detail, bars: "none" });
    // Balcony railing.
    const rail = k.metal(r.pick(["#1d1f1e", "#e9e6dc", "#2b4a36"]), 0.55, 0.5);
    b.box(rail, 3.0, 0.05, 0.05, x - 1.6, plinth + fh + 1.0, 1.66);
    for (let xx = -1.45; xx <= 1.45; xx += 0.14) b.box(rail, 0.02, 1.0, 0.02, x - 1.6 + xx, plinth + fh + 0.5, 1.66);
    if (detail && r.chance(0.5)) k.laundry(x - 3, x - 0.2, plinth + fh + 2.3, 1.2);
    if (detail && r.chance(0.35)) k.ac(x + 3.0, plinth + fh + 2.4, 0);
    if (detail && r.chance(0.6)) b.quad(k.decal("streak"), uw - 0.4, r.range(1.0, 2.4), x, H - 1.1, 0.006);
    b.pop();
    // Party-wall pilasters.
    b.box(trim, 0.3, H + 0.1, D + 0.3, x + uw / 2, (H + 0.1) / 2, 0);
    // Back windows.
    b.push(0, 0, -D / 2, Math.PI);
    k.window(-x, plinth + 1.1, 1.2, 1.0, { detail: false });
    k.window(-x, plinth + fh + 1.1, 1.2, 1.0, { detail: false });
    b.pop();
    if (detail && r.chance(0.4)) k.tank(x + r.range(-2, 2), H + 1.2, -2.5);
    if (r.chance(0.65)) {
      // A car in the front yard.
      const m = b.matrix;
      const p = new THREE.Vector3(x + 1.6, 0, D / 2 + (o.yard ?? 3.6)).applyMatrix4(m);
      k.parking.push([p.x, p.z, Math.atan2(m.elements[8], m.elements[10]) + Math.PI / 2]);
    }
    if (detail && r.chance(0.45)) k.satellite(x + 2.5, H + 0.6, 3.5, r.range(-0.5, 0.5));
  }
  b.box(trim, 0.3, H + 0.1, D + 0.3, -L / 2, (H + 0.1) / 2, 0);
  for (const s of [-1, 1]) {
    b.push(s * (L / 2 + 0.15), 0, 0, (s * Math.PI) / 2);
    for (const f of [0, 1]) for (const xx of [-2.6, 2.6]) k.window(xx, plinth + f * fh + 0.95, 1.2, 1.2, { detail: false });
    b.pop();
  }
  // Low-pitched gable roof over the whole terrace.
  roof(k, L + 1.0, D + 1.2, H, 1.7, false, roofMat);
  for (const s of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -D / 2, 0, 1.6, 0, 0, 0, D / 2], 3));
    tri.computeVertexNormals();
    tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    b.push(s * (L / 2 + 0.12), H, 0, s > 0 ? 0 : Math.PI);
    b.geometry(tri, trim);
    b.pop();
    tri.dispose();
  }
  return { length: L, depth: D, unit: uw };
}

// ------------------------------------------------------------------ bungalow
export function bungalow(k: Kit, o: { detail?: boolean } = {}) {
  const b = k.b,
    r = k.r;
  const W = 14,
    D = 10,
    h = 3.4,
    plinth = 0.45;
  const wall = k.paint(r.pick(paintList));
  const trim = k.paint(r.pick(trims), 0.18, 0.2);
  b.box(wall, W, h, D, 0, plinth + h / 2, 0);
  b.box(k.paint(r.pick(bases), 0.25, 0.7), W + 0.1, plinth, D + 0.1, 0, plinth / 2, 0);
  b.collide(W + 0.4, h + 3, D + 3, 0, h / 2, 0.8);
  roof(k, W + 1.6, D + 1.8, plinth + h, 2.2, true, k.sheet(r.pick(["#7a2f28", "#2c5a3b", "#5b5f60", "#8c3b23"])));
  b.push(0, 0, D / 2);
  for (const xx of [-4.6, -1.6, 3.4]) k.window(xx, plinth + 0.9, 1.8, 1.3, { detail: o.detail });
  b.box(k.metal("#3b2a1d", 0.6, 0.3), 1.1, 2.2, 0.06, 1.0, plinth + 1.1, 0.02);
  b.box(k.concrete("#b4ada0"), 6.5, 0.3, 2.2, 0.5, 0.15, 1.1);
  for (const s of [-1, 1]) b.box(trim, 0.25, h, 0.25, 0.5 + s * 3.1, plinth + h / 2, 2.0);
  b.box(trim, 6.6, 0.16, 2.4, 0.5, plinth + h - 0.08, 1.1);
  if (o.detail !== false) b.quad(k.decal("streak"), W - 1, 1.2, 0, plinth + h - 0.6, 0.006);
  b.pop();
  for (const s of [-1, 1]) {
    b.push((s * W) / 2, 0, 0, (s * Math.PI) / 2);
    k.window(-2, plinth + 0.9, 1.2, 1.2, { detail: false });
    k.window(2, plinth + 0.9, 1.2, 1.2, { detail: false });
    b.pop();
  }
  if (o.detail !== false) k.tank(-4, plinth + h + 1.0, -2.5);
  return { width: W, depth: D };
}

// ------------------------------------------------------------------ street life
export function kiosk(k: Kit, x: number, z: number, ry: number, color: string, sign?: Shop) {
  const b = k.b,
    r = k.r;
  b.push(x, 0, z, ry);
  const body = k.metal(color, 0.6, 0.4);
  b.box(body, 2.2, 2.2, 1.8, 0, 1.3, 0);
  b.box(k.metal("#2b2b29"), 2.3, 0.2, 1.9, 0, 0.1, 0);
  b.collide(2.4, 2.4, 2, 0, 1.2, 0);
  b.box(k.interior(), 1.8, 1.0, 0.02, 0, 1.6, 0.91);
  b.box(body, 2.0, 0.04, 1.0, 0, 2.3, 1.3, 0, -0.55);
  b.box(k.plastic("#e8e3d6"), 1.9, 0.06, 0.4, 0, 1.08, 1.0);
  for (let i = 0; i < 6; i++) b.box(k.plastic(r.pick(["#f1c40f", "#e74c3c", "#3498db", "#ecf0f1"])), 0.18, 0.25, 0.12, -0.7 + i * 0.28, 1.25, 1.0);
  if (sign) {
    const rect = k.signs.add(sign.key, sign.lines, sign.bg, sign.fg, 1024, 220, sign.style || "painted");
    b.quad(k.signs_(), 2.1, 0.45, 0, 2.62, 0.4, 0, 0, rect);
  }
  b.pop();
}
export function umbrellaStand(k: Kit, x: number, z: number, color: string, sign?: Shop) {
  const b = k.b;
  b.push(x, 0, z);
  b.bar(k.metal("#cccccc", 0.4, 0.6), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.4, 0), 0.025);
  const g = new THREE.ConeGeometry(1.5, 0.5, 12, 1, true);
  b.geometry(g, k.plastic(color, 0.7), new THREE.Matrix4().makeTranslation(0, 2.45, 0), false);
  b.geometry(g, k.plastic(color, 0.7), new THREE.Matrix4().makeScale(1, -1, 1).setPosition(0, 2.45, 0), false);
  g.dispose();
  b.box(k.plastic("#f0f0ea", 0.5), 1.0, 0.04, 0.6, 0.3, 0.75, 0.2);
  for (const dx of [-0.15, 0.75]) b.box(k.plastic("#f0f0ea", 0.5), 0.04, 0.75, 0.5, dx, 0.37, 0.2);
  b.box(k.plastic("#cf2e2e", 0.5), 0.45, 0.45, 0.45, -0.6, 0.42, -0.2);
  if (sign) {
    const rect = k.signs.add(sign.key, sign.lines, sign.bg, sign.fg, 512, 160, "panel");
    b.quad(k.signs_(), 0.9, 0.3, 0.3, 0.95, 0.52, 0, -0.2, rect);
  }
  b.collide(1.2, 2, 1.2, 0, 1, 0);
  b.pop();
}
export function vulcanizer(k: Kit, x: number, z: number, ry: number) {
  const b = k.b,
    r = k.r;
  b.push(x, 0, z, ry);
  const tyre = k.metal("#151515", 0.9, 0);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.TorusGeometry(0.3, 0.11, 8, 18);
    b.geometry(g, tyre, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(r.range(-0.05, 0.05), 0.11 + i * 0.2, 0), false);
    g.dispose();
  }
  b.box(k.metal("#b03a2e", 0.5, 0.4), 0.7, 0.5, 0.45, 1.1, 0.35, 0);
  b.cylinder(k.metal("#b03a2e", 0.5, 0.4), 0.18, 0.18, 0.7, 1.1, 0.75, 0, 12, 0, Math.PI / 2);
  b.collide(2.2, 1.6, 1.0, 0.5, 0.8, 0);
  b.pop();
}
export function generator(k: Kit, x: number, z: number, ry: number) {
  const b = k.b,
    r = k.r;
  b.push(x, 0, z, ry);
  b.box(k.metal(r.pick(["#c0392b", "#d35400", "#2c3e50"]), 0.55, 0.4), 0.75, 0.55, 0.55, 0, 0.42, 0);
  b.box(k.metal("#222", 0.6, 0.5), 0.85, 0.06, 0.62, 0, 0.12, 0);
  for (const s of [-1, 1]) b.bar(k.metal("#222", 0.6, 0.5), new THREE.Vector3(s * 0.4, 0.1, -0.3), new THREE.Vector3(s * 0.4, 0.75, -0.3), 0.02);
  b.box(k.metal("#555", 0.5, 0.6), 0.25, 0.25, 0.1, 0.2, 0.5, 0.29);
  b.pop();
}
export function chairs(k: Kit, x: number, z: number, n: number) {
  const b = k.b,
    r = k.r;
  for (let i = 0; i < n; i++) {
    const col = r.pick(["#efefe8", "#d63031", "#0984e3", "#efefe8"]);
    const m = k.plastic(col, 0.45);
    b.push(x + r.range(-1.2, 1.2), 0, z + r.range(-1.2, 1.2), r.range(0, Math.PI * 2));
    b.box(m, 0.46, 0.04, 0.44, 0, 0.45, 0);
    b.box(m, 0.46, 0.45, 0.04, 0, 0.7, -0.22, 0, -0.12);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.19, 0.19]) b.box(m, 0.035, 0.45, 0.035, dx, 0.22, dz);
    b.pop();
  }
}
export function jerrycans(k: Kit, x: number, z: number) {
  const b = k.b;
  const m = k.plastic("#f2c40f", 0.45);
  for (let i = 0; i < 6; i++) b.box(m, 0.3, 0.42, 0.18, x + (i % 3) * 0.33, 0.21 + Math.floor(i / 3) * 0.43, z);
  b.box(k.metal("#4a4c49"), 1.2, 0.05, 0.6, x + 0.33, 0.0, z + 0.2);
}
