export type Game = "sprint" | "dispatch" | "taxi" | "parking" | "hunt" | "memory" | "guess";
export type Score = { game: Game; durationMs: number; moves?: number; completedAt: string };
export type GameSpec = { name: string; count: "none" | "fewer" | "more"; unit?: string; min?: number; max?: number; minMs: number; maxMs?: number; msPerCount?: number };
export const games: Record<Game, GameSpec>;
export const gameNames: Record<Game, string>;
export function usesCount(game: Game): boolean;
export function validScore(s: unknown): boolean;
export function compareScores(a: Score, b: Score): number;
export function rankScores<T extends Score>(scores: T[]): (T & {rank: number})[];
