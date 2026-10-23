export const gameNames = { sprint: "Avenue sprint", memory: "Pattern recognition" };
export function validScore(s) {
  return s && Object.hasOwn(gameNames, s.game) && Number.isInteger(s.durationMs) &&
    s.durationMs >= (s.game === "sprint" ? 15000 : 1000) && s.durationMs <= 3600000 &&
    (s.game === "memory" ? Number.isInteger(s.moves) && s.moves >= 6 && s.moves <= 10000 : s.moves === undefined);
}
// Memory rewards fewer moves, then faster completion. Sprint rewards the fastest lap.
export function compareScores(a, b) {
  return (a.game === "memory" ? a.moves - b.moves : 0) || a.durationMs - b.durationMs;
}
export function rankScores(scores) {
  const sorted = [...scores].sort((a, b) => compareScores(a, b) || a.completedAt.localeCompare(b.completedAt));
  let rank = 1;
  return sorted.map((s, i) => {
    if (i && compareScores(s, sorted[i - 1]) !== 0) rank = i + 1;
    return { ...s, rank };
  });
}
