// One table drives validation, ranking and labels for every game, on the client,
// the Express API and (mirrored in supabase/setup.sql) the database.
// `count` is what the `moves` field means for that game:
//   none  – time only, fastest wins
//   fewer – a count where lower is better (moves, scrapes), then fastest
//   more  – a count where higher is better (trips, points), then fastest
export const games = {
  sprint: { name: "Avenue sprint", count: "none", minMs: 15000 },
  // Minimum times are the fastest physically possible runs (route length at top speed,
  // plus the stops), so impossible results are rejected. Keep in step with supabase/setup.sql.
  dispatch: { name: "Danfo dispatch", count: "none", minMs: 30000 },
  // At least 6 s per trip: a 70 m+ ride plus two full stops.
  taxi: { name: "Palm Avenue taxi", count: "more", unit: "trips", min: 0, max: 60, minMs: 1000, maxMs: 300000, msPerCount: 6000 },
  parking: { name: "Kerbside parking", count: "fewer", unit: "scrapes", min: 0, max: 99, minMs: 15000 },
  hunt: { name: "Find the a.", count: "none", minMs: 40000 },
  memory: { name: "Pattern recognition", count: "fewer", unit: "moves", min: 6, max: 10000, minMs: 3000 },
  // Each round shows its answer for 1.1 s and is worth at most 1,000 points.
  guess: { name: "Guess the project", count: "more", unit: "points", min: 0, max: 8000, minMs: 4400, msPerCount: 1.1 },
};
export const gameNames = Object.fromEntries(Object.entries(games).map(([id, g]) => [id, g.name]));
export const usesCount = (game) => games[game]?.count !== "none";

export function validScore(s) {
  const g = s && Object.hasOwn(games, s.game) ? games[s.game] : null;
  if (!g || !Number.isInteger(s.durationMs) || s.durationMs < Math.max(1000, g.minMs) || s.durationMs > (g.maxMs ?? 3600000)) return false;
  if (g.count === "none") return s.moves === undefined;
  return Number.isInteger(s.moves) && s.moves >= g.min && s.moves <= g.max && (!g.msPerCount || s.moves * g.msPerCount <= s.durationMs);
}
/** Lower sorts first. */
function countKey(s) {
  const g = games[s.game];
  if (!g || g.count === "none") return 0;
  return g.count === "more" ? -s.moves : s.moves;
}
export function compareScores(a, b) {
  return countKey(a) - countKey(b) || a.durationMs - b.durationMs;
}
export function rankScores(scores) {
  const sorted = [...scores].sort((a, b) => compareScores(a, b) || a.completedAt.localeCompare(b.completedAt));
  let rank = 1;
  return sorted.map((s, i) => {
    if (i && compareScores(s, sorted[i - 1]) !== 0) rank = i + 1;
    return { ...s, rank };
  });
}
