import * as THREE from "three";

// Procedural textures generated at load time: no downloads, deterministic, and they
// fall back to flat 1x1 textures where no 2D canvas exists (tests / workers).

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const hash = (x: number, y: number, s = 0) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
function vnoise(x: number, y: number, s: number, period: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(xi), w(yi), s),
    b = hash(w(xi + 1), w(yi), s),
    c = hash(w(xi), w(yi + 1), s),
    d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Tileable fBm in 0..1. */
export function fbm(x: number, y: number, s = 0, oct = 5, period = 8) {
  let f = 0,
    a = 0.5,
    p = period,
    xx = x,
    yy = y;
  for (let i = 0; i < oct; i++) {
    f += a * vnoise(xx, yy, s + i * 13, p);
    xx *= 2;
    yy *= 2;
    p *= 2;
    a *= 0.5;
  }
  return f / (1 - Math.pow(0.5, oct));
}

function data(size: number, fill: (x: number, y: number, out: number[]) => void, srgb = true, wrap = true) {
  const arr = new Uint8Array(size * size * 4);
  const px = [0, 0, 0, 255];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      px[3] = 255;
      fill(x, y, px);
      const i = (y * size + x) * 4;
      arr[i] = px[0];
      arr[i + 1] = px[1];
      arr[i + 2] = px[2];
      arr[i + 3] = px[3];
    }
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
/** Normal map from a height function (tileable if the height function is). */
function normals(size: number, height: (x: number, y: number) => number, strength: number) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return data(
    size,
    (x, y, o) => {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      o[0] = ((-dx / l) * 0.5 + 0.5) * 255;
      o[1] = ((dy / l) * 0.5 + 0.5) * 255;
      o[2] = ((1 / l) * 0.5 + 0.5) * 255;
    },
    false,
  );
}

export function canvas(w: number, h: number) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx || typeof ctx.fillRect !== "function" || typeof ctx.getImageData !== "function") return null;
  return { c, ctx };
}
export function fromCanvas(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/** Red laterite earth with pebbles: the bare ground of yards and verges. */
export const laterite = () =>
  once("laterite", () => {
    const S = 256;
    const height = (x: number, y: number) => {
      const n = fbm(x / 32, y / 32, 3, 5, 8);
      const peb = Math.max(0, hash(Math.floor(x / 5), Math.floor(y / 5), 9) - 0.86) * 4;
      return n * 0.7 + peb;
    };
    const color = data(S, (x, y, o) => {
      const n = fbm(x / 32, y / 32, 3, 5, 8),
        m = fbm(x / 64, y / 64, 5, 3, 4);
      const peb = hash(Math.floor(x / 5), Math.floor(y / 5), 9) > 0.86;
      const base = [150 + m * 40, 84 + m * 26, 52 + m * 16];
      const k = 0.72 + n * 0.45;
      o[0] = base[0] * k * (peb ? 1.12 : 1);
      o[1] = base[1] * k * (peb ? 1.08 : 1);
      o[2] = base[2] * k * (peb ? 1.1 : 1);
    });
    return { color, normal: normals(S, height, 3) };
  });

/** Bare sandcrete block walls (450 x 225 mm blocks). */
export const sandcrete = () =>
  once("sandcrete", () => {
    const S = 256; // 256px = 1.8m x 1.8m -> 4 blocks wide, 8 courses
    const bw = S / 4,
      bh = S / 8;
    const mortar = (x: number, y: number) => {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      const mx = (x + off) % bw,
        my = y % bh;
      return mx < 3 || my < 3;
    };
    const color = data(S, (x, y, o) => {
      const n = fbm(x / 24, y / 24, 11, 4, 10.6666);
      const row = Math.floor(y / bh),
        col = Math.floor((x + (row % 2 ? bw / 2 : 0)) / bw);
      const tone = 0.88 + hash(col, row, 4) * 0.16;
      const g = mortar(x, y) ? 150 : 168 * tone;
      o[0] = g * (0.92 + n * 0.16);
      o[1] = g * (0.9 + n * 0.16);
      o[2] = g * (0.84 + n * 0.14);
    });
    const normal = normals(S, (x, y) => (mortar(x, y) ? 0 : 1) + fbm(x / 8, y / 8, 2, 3, 32) * 0.4, 1.5);
    return { color, normal };
  });

/** Decorative concrete screen blocks used on stair cores (alpha = openings). */
export const breezeBlock = () =>
  once("breeze", () => {
    const S = 128; // one 4x4 tile repeat = 1.2m
    const cell = S / 4;
    return data(S, (x, y, o) => {
      const cx = (x % cell) - cell / 2,
        cy = (y % cell) - cell / 2;
      // Four-leaf motif typical of 1970s screen walls.
      const r = Math.hypot(cx, cy);
      const leaf = Math.abs(cx) + Math.abs(cy) < cell * 0.42 && r > cell * 0.12;
      const frame = Math.abs(cx) > cell * 0.44 || Math.abs(cy) > cell * 0.44;
      const n = fbm(x / 16, y / 16, 21, 3, 8);
      const g = 200 + n * 30;
      o[0] = g;
      o[1] = g * 0.97;
      o[2] = g * 0.9;
      o[3] = leaf && !frame ? 0 : 255;
    });
  });

/** Corrugated roofing / shutter normal map (ridges run along v). */
export const corrugation = () =>
  once("corr", () => normals(64, (x) => Math.sin((x / 64) * Math.PI * 2 * 4) * 0.5, 2.5));

/** Louvre window: steel frame, nine glass blades with sky reflection. */
export const louvre = () =>
  once("louvre", () => {
    const S = 128;
    return data(
      S,
      (x, y, o) => {
        const frame = x < 6 || x > S - 7 || y < 6 || y > S - 7 || Math.abs(x - S / 2) < 3;
        if (frame) {
          o[0] = 58;
          o[1] = 60;
          o[2] = 58;
          return;
        }
        const blade = (y - 6) % 13;
        const edge = blade < 2;
        const t = blade / 13;
        const sky = 0.55 + 0.45 * (1 - t);
        o[0] = edge ? 140 : 60 + 70 * sky;
        o[1] = edge ? 150 : 74 + 76 * sky;
        o[2] = edge ? 150 : 80 + 84 * sky;
      },
      true,
      false,
    );
  });

/** Vertical rain-streak / mould decal (alpha). */
export const streak = () =>
  once("streak", () => {
    const W = 128,
      H = 256;
    const arr = new Uint8Array(W * H * 4);
    const cols = Array.from({ length: W }, (_, x) => fbm(x / 9, 0, 31, 4, 14.222) * (0.6 + 0.4 * hash(x, 1, 2)));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = y / H; // 0 at the top edge in texture space (flipped below)
        const fade = Math.pow(1 - t, 1.6);
        const edge = Math.min(1, x / 18, (W - x) / 18);
        const n = fbm(x / 6, y / 30, 33, 3, 100);
        const a = Math.max(0, cols[x] * 1.6 - 0.45) * fade * edge * (0.5 + 0.5 * n);
        const i = ((H - 1 - y) * W + x) * 4;
        arr[i] = 34;
        arr[i + 1] = 36;
        arr[i + 2] = 30;
        arr[i + 3] = Math.min(255, a * 255);
      }
    const t = new THREE.DataTexture(arr, W, H, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  });

/** Patchy black mould / damp blotch (alpha). */
export const blotch = () =>
  once("blotch", () =>
    data(
      128,
      (x, y, o) => {
        const d = Math.hypot(x - 64, y - 64) / 64;
        const n = fbm(x / 14, y / 14, 41, 5, 9.1428);
        const a = Math.max(0, n * 1.4 - 0.35 - d * 0.9);
        o[0] = 30;
        o[1] = 33;
        o[2] = 26;
        o[3] = Math.min(255, a * 300);
      },
      true,
      false,
    ),
  );

/** Soft round shadow / glow disc (alpha). */
export const disc = () =>
  once("disc", () =>
    data(
      64,
      (x, y, o) => {
        const d = Math.hypot(x - 31.5, y - 31.5) / 32;
        o[0] = o[1] = o[2] = 255;
        o[3] = Math.max(0, 1 - d) ** 1.8 * 255;
      },
      true,
      false,
    ),
  );

/** Curtain / interior fabric atlas: 4 x 2 panels of colour and pattern. */
export const curtains = () =>
  once("curtains", () => {
    const pal = [
      [150, 52, 46],
      [46, 86, 140],
      [196, 160, 60],
      [70, 110, 70],
      [210, 200, 180],
      [120, 60, 120],
      [40, 40, 44],
      [200, 120, 60],
    ];
    const S = 256;
    return data(
      S,
      (x, y, o) => {
        const i = Math.floor(x / 64) + Math.floor(y / 128) * 4;
        const c = pal[i % pal.length];
        const fold = 0.75 + 0.25 * Math.sin((x % 64) * 0.55);
        const pattern = i % 3 === 0 ? (Math.floor(x / 6) + Math.floor(y / 6)) % 2 * 0.12 : 0;
        const dark = 0.55; // interiors read darker than the street
        o[0] = c[0] * fold * dark * (1 - pattern);
        o[1] = c[1] * fold * dark * (1 - pattern);
        o[2] = c[2] * fold * dark * (1 - pattern);
      },
      true,
      false,
    );
  });

/** Broad-leaf cluster card (almond / neem), alpha-cut. */
export function leaves(kind: "almond" | "neem" | "bougainvillea" | "shrub" | "grass") {
  return once("leaves-" + kind, () => {
    const S = 256;
    const arr = new Uint8Array(S * S * 4);
    seed = kind.length * 977;
    const put = (x: number, y: number, r: number, g: number, b: number) => {
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const i = (y * S + x) * 4;
      arr[i] = r;
      arr[i + 1] = g;
      arr[i + 2] = b;
      arr[i + 3] = 255;
    };
    const ellipse = (cx: number, cy: number, rx: number, ry: number, ang: number, col: number[], vein = true) => {
      const ca = Math.cos(ang),
        sa = Math.sin(ang);
      const R = Math.ceil(Math.max(rx, ry));
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
          const u = (x * ca + y * sa) / rx,
            v = (-x * sa + y * ca) / ry;
          const d = u * u + v * v;
          if (d > 1) continue;
          const shade = 0.78 + 0.22 * (1 - d) + (vein && Math.abs(u) < 0.05 ? -0.12 : 0) + v * 0.06;
          put(Math.round(cx + x), Math.round(cy + y), col[0] * shade, col[1] * shade, col[2] * shade);
        }
    };
    if (kind === "grass") {
      for (let i = 0; i < 70; i++) {
        const x0 = 8 + rnd() * 240,
          h = 90 + rnd() * 160,
          lean = (rnd() - 0.5) * 60;
        const col = [[108, 118, 58], [140, 136, 72], [92, 108, 50], [168, 150, 86]][i % 4];
        for (let t = 0; t < 1; t += 0.004) {
          const x = x0 + lean * t * t,
            y = h * t,
            w = (1 - t) * 2.6 + 0.5;
          for (let k = -w; k <= w; k++) put(Math.round(x + k), Math.round(y), col[0] * (0.8 + t * 0.3), col[1] * (0.8 + t * 0.3), col[2]);
        }
      }
    } else {
      const count = kind === "almond" ? 34 : kind === "neem" ? 140 : kind === "bougainvillea" ? 160 : 120;
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2,
          r = Math.sqrt(rnd()) * 105;
        const cx = 128 + Math.cos(a) * r,
          cy = 128 + Math.sin(a) * r;
        if (kind === "almond") {
          const tone = rnd();
          const col = tone < 0.04 ? [166, 158, 70] : tone < 0.0 ? [170, 160, 64] : [78 + tone * 40, 132 + tone * 40, 46 + tone * 16];
          ellipse(cx, cy, 11 + rnd() * 5, 24 + rnd() * 8, a + Math.PI / 2 + (rnd() - 0.5), col);
        } else if (kind === "neem") {
          const col = [70 + rnd() * 34, 116 + rnd() * 34, 44 + rnd() * 16];
          ellipse(cx, cy, 3.5, 9 + rnd() * 3, rnd() * Math.PI, col, false);
        } else if (kind === "bougainvillea") {
          const flower = rnd() < 0.55;
          const col = flower ? (rnd() < 0.8 ? [196, 34, 120] : [222, 90, 150]) : [56, 96, 42];
          ellipse(cx, cy, flower ? 5 : 4, flower ? 6 : 8, rnd() * Math.PI, col, !flower);
        } else {
          const col = rnd() < 0.08 ? [210, 60, 50] : [48 + rnd() * 26, 90 + rnd() * 30, 40 + rnd() * 10];
          ellipse(cx, cy, 4, 8, rnd() * Math.PI, col, false);
        }
      }
    }
    const t = new THREE.DataTexture(arr, S, S, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  });
}

/** Coconut / royal palm frond strip (u along the frond). */
export const frond = () =>
  once("frond", () => {
    const W = 512,
      H = 128;
    const arr = new Uint8Array(W * H * 4);
    const put = (x: number, y: number, c: number[]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      arr[i] = c[0];
      arr[i + 1] = c[1];
      arr[i + 2] = c[2];
      arr[i + 3] = 255;
    };
    for (let i = 0; i < 80; i++) {
      const t = i / 80,
        x0 = 6 + t * 500,
        len = (1 - t * 0.7) * 58 + 4;
      for (const side of [-1, 1]) {
        const col = [[84, 112, 46], [98, 126, 52], [72, 98, 40], [116, 134, 60]][(i + (side > 0 ? 1 : 0)) % 4];
        for (let s = 0; s < 1; s += 0.01) {
          const x = x0 + len * 0.55 * s,
            y = 64 + side * len * (s * 0.95 + s * s * 0.05);
          const w = (1 - s) * 2.2 + 0.6;
          for (let k = -w; k <= w; k++) put(Math.round(x + k), Math.round(y), col.map((v) => v * (0.85 + s * 0.25)));
        }
      }
    }
    for (let x = 0; x < 506; x++) for (let k = -2; k <= 2; k++) put(x, 64 + k, [140, 134, 76]);
    const t = new THREE.DataTexture(arr, W, H, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  });

/** A texture atlas of painted signs. Returns UV rects by key. */
export class SignAtlas {
  texture: THREE.Texture;
  rects = new Map<string, [number, number, number, number]>();
  private c: ReturnType<typeof canvas>;
  private x = 0;
  private y = 0;
  private row = 0;
  constructor(private size = 2048) {
    this.c = canvas(size, size);
    if (this.c) {
      this.c.ctx.fillStyle = "#777";
      this.c.ctx.fillRect(0, 0, size, size);
      this.texture = fromCanvas(this.c.c);
    } else this.texture = new THREE.Texture();
  }
  /** Paint a sign; style decides fonts and finish. */
  add(key: string, lines: string[], bg: string, fg: string, w = 512, h = 128, style: "painted" | "panel" | "street" | "neon" | "wall" = "painted") {
    if (this.rects.has(key)) return this.rects.get(key)!;
    if (this.x + w > this.size) {
      this.x = 0;
      this.y += this.row;
      this.row = 0;
    }
    const x = this.x,
      y = this.y;
    this.x += w;
    this.row = Math.max(this.row, h);
    const rect: [number, number, number, number] = [x / this.size, 1 - (y + h) / this.size, (x + w) / this.size, 1 - y / this.size];
    this.rects.set(key, rect);
    if (!this.c) return rect;
    const ctx = this.c.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (style !== "wall") {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.clearRect(x, y, w, h);
      ctx.fillStyle = "rgba(0,0,0,0)";
    }
    if (style === "street") {
      ctx.strokeStyle = fg;
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    }
    if (style === "panel") {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const n = lines.length;
    lines.forEach((line, i) => {
      const big = i === 0;
      const size = Math.min(h / (n + 0.6) * (big ? 1.05 : 0.7), (w * 1.7) / Math.max(4, line.length));
      ctx.font = `${style === "street" ? 700 : big ? 800 : 600} ${size}px ${style === "wall" ? "Impact, 'Arial Black', sans-serif" : "'Arial Black', Arial, sans-serif"}`;
      if (style === "neon") {
        ctx.shadowColor = fg;
        ctx.shadowBlur = 18;
      }
      ctx.fillText(line, x + w / 2, y + h * ((i + 0.5) / n) + (n === 1 ? 2 : 0), w - 24);
    });
    // Weathering: sun-faded, dusty and chipped.
    if (style === "painted" || style === "wall") {
      for (let i = 0; i < (w * h) / 900; i++) {
        ctx.fillStyle = `rgba(${style === "wall" ? "120,110,96" : "235,225,200"},${rnd() * 0.18})`;
        ctx.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 10, 1 + rnd() * 4);
      }
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(255,240,210,0.10)");
      g.addColorStop(1, "rgba(60,40,20,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
    return rect;
  }
}

export function resetTextures() {
  for (const v of cache.values()) {
    if (v instanceof THREE.Texture) v.dispose();
    else if (v && typeof v === "object")
      for (const t of Object.values(v as Record<string, unknown>)) if (t instanceof THREE.Texture) t.dispose();
  }
  cache.clear();
}
