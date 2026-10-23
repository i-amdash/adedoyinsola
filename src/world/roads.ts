// Road network shared by the neighbourhood builder, radar, GPS routing and the map.
// World units are metres. The main avenue is a dual carriageway with a planted median.
export const JUNCTIONS = [-112, -65, -20, 28, 110];
export const AV = {
  median: 1.5, // half width of the raised median
  edge: 9, // outer edge of each carriageway
  kerb: 9.25,
  drain: 10.55,
  foot: 15, // outer edge of the footpath
  plot: 16.5, // compound walls start here
  from: -185,
  to: 135,
};
export const LANES = { inner: 3.4, outer: 6.9 };
export const STREET = { half: 4.5, drain: 5.7, foot: 7.7, plotGap: 8.5 };
export const SIDE_X = 70;
export const BOUNDS = { minX: -112, maxX: 112, minZ: -182, maxZ: 132 };
export const avenues = [
  { x: 0, from: AV.from, to: AV.to, width: AV.edge * 2 },
  { x: -SIDE_X, from: AV.from, to: AV.to, width: STREET.half * 2 },
  { x: SIDE_X, from: AV.from, to: AV.to, width: STREET.half * 2 },
];
export const streets = JUNCTIONS.map((z) => ({
  z,
  from: -SIDE_X - STREET.half,
  to: SIDE_X + STREET.half,
  width: STREET.half * 2,
}));
/** Plot strips between junctions along the avenue (z ranges). */
export const SEGMENTS: [number, number][] = [
  [-180, JUNCTIONS[0] - STREET.plotGap],
  ...JUNCTIONS.slice(0, -1).map((j, i) => [j + STREET.plotGap, JUNCTIONS[i + 1] - STREET.plotGap] as [number, number]),
  [JUNCTIONS[4] + STREET.plotGap, 133],
];

type P = [number, number];
const nodes: P[] = [];
const edges: [number, number][] = [];
const key = (p: P) => `${p[0]},${p[1]}`;
const index = new Map<string, number>();
function node(p: P) {
  const k = key(p);
  if (!index.has(k)) {
    index.set(k, nodes.length);
    nodes.push(p);
  }
  return index.get(k)!;
}
for (const a of avenues) {
  const stops = [a.from + 10, ...streets.map((s) => s.z), a.to - 10].sort((x, y) => x - y);
  for (let i = 0; i < stops.length - 1; i++)
    edges.push([node([a.x, stops[i]]), node([a.x, stops[i + 1]])]);
}
for (const s of streets) {
  const xs = avenues.map((a) => a.x).sort((x, y) => x - y);
  for (let i = 0; i < xs.length - 1; i++) edges.push([node([xs[i], s.z]), node([xs[i + 1], s.z])]);
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function project(p: P) {
  let best = { d: Infinity, point: p, edge: 0 };
  edges.forEach(([i, j], e) => {
    const a = nodes[i],
      b = nodes[j];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const q: P = [a[0] + dx * t, a[1] + dz * t];
    const d = dist(p, q);
    if (d < best.d) best = { d, point: q, edge: e };
  });
  return best;
}
/** Shortest drive along the road network, as a polyline of [x, z] points. */
export function route(from: P, to: P): P[] {
  const s = project(from),
    t = project(to);
  if (s.edge === t.edge) return [from, s.point, t.point, to];
  const n = nodes.length;
  const S = n,
    T = n + 1;
  const pts: P[] = [...nodes, s.point, t.point];
  const adj: [number, number][][] = Array.from({ length: n + 2 }, () => []);
  const link = (a: number, b: number) => {
    const w = dist(pts[a], pts[b]);
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  };
  edges.forEach(([a, b], e) => {
    if (e !== s.edge && e !== t.edge) link(a, b);
  });
  for (const [x, e] of [
    [S, s.edge],
    [T, t.edge],
  ]) {
    link(x, edges[e][0]);
    link(x, edges[e][1]);
  }
  const best = new Array(n + 2).fill(Infinity),
    prev = new Array(n + 2).fill(-1),
    done = new Array(n + 2).fill(false);
  best[S] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n + 2; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || best[u] === Infinity || u === T) break;
    done[u] = true;
    for (const [v, w] of adj[u])
      if (best[u] + w < best[v]) {
        best[v] = best[u] + w;
        prev[v] = u;
      }
  }
  const path: P[] = [to];
  for (let u = T; u >= 0; u = prev[u]) path.push(pts[u]);
  path.push(from);
  return path.reverse();
}
