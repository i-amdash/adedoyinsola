import { randomUUID } from "node:crypto";
import { cloudResult, cloudFailure } from "./cloud.mjs";
export function createCloudPlayers(client, now = Date.now) {
  return {
    async find(username) {
      const row = cloudResult(await client.from("portfolio_players").select("id,username,password_hash").eq("username_key", username.toLowerCase()).maybeSingle());
      return row ? { id: row.id, username: row.username, hash: row.password_hash } : null;
    },
    async register(username, hash) {
      const response = await client.from("portfolio_players").insert({ username, password_hash: hash }).select("id,username").single();
      if (response.error?.code === "23505") throw cloudFailure(409, "That username is already taken.");
      return cloudResult(response);
    },
    async startAttempt(playerId, game) {
      return cloudResult(await client.from("portfolio_attempts").upsert({ id: randomUUID(), player_id: playerId, game, starts_at: new Date(now() + 3000).toISOString(), expires_at: new Date(now() + 3610000).toISOString() }, { onConflict: "player_id,game" }).select("id").single());
    },
    async finish(playerId, { attemptId, game, durationMs, moves }) {
      const row = cloudResult(await client.rpc("portfolio_finish_game", { p_player: playerId, p_attempt: attemptId, p_game: game, p_duration: durationMs, p_moves: moves ?? null }));
      return { id: row.id, playerId: row.player_id, game: row.game, durationMs: row.duration_ms, ...(row.moves === null ? {} : { moves: row.moves }), completedAt: row.completed_at };
    },
    async leaderboard(game, playerId) {
      return cloudResult(await client.rpc("portfolio_leaderboard", { p_game: game, p_player: playerId || null }));
    },
  };
}
