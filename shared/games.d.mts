export type Game = "sprint" | "memory";
export type Score = { game: Game; durationMs: number; moves?: number; completedAt: string };
export const gameNames: Record<Game, string>;
export function validScore(s: unknown): boolean;
export function compareScores(a: Score, b: Score): number;
export function rankScores<T extends Score>(scores: T[]): (T & {rank: number})[];
