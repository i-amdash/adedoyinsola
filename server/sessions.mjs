import { createHash, randomBytes } from "node:crypto";
import { cloudResult } from "./cloud.mjs";
const digest = token => createHash("sha256").update(token).digest("hex");
export function createSessions(client, now = Date.now) {
  const memory = new Map();
  return {
    async issue(kind, player, ttl) {
      const token = randomBytes(32).toString("hex"), key = digest(token), expires = now() + ttl;
      if (client) {
        cloudResult(await client.from("portfolio_sessions").delete().lt("expires_at", new Date(now()).toISOString()));
        cloudResult(await client.from("portfolio_sessions").insert({ token_hash: key, kind, player_id: player?.id || null, expires_at: new Date(expires).toISOString() }));
      } else {
        for (const [id, session] of memory) if (session.expires <= now()) memory.delete(id);
        memory.set(key, { kind, player, expires });
      }
      return token;
    },
    async read(token, kind) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      if (client) {
        const row = cloudResult(await client.from("portfolio_sessions").select("player:portfolio_players(id,username)").eq("token_hash", digest(token)).eq("kind", kind).gt("expires_at", new Date(now()).toISOString()).maybeSingle());
        return row ? (kind === "admin" ? { admin: true } : row.player) : null;
      }
      const row = memory.get(digest(token));
      return row && row.kind === kind && row.expires > now() ? (kind === "admin" ? { admin: true } : row.player) : null;
    },
    async revoke(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
      if (client) cloudResult(await client.from("portfolio_sessions").delete().eq("token_hash", digest(token)));
      else memory.delete(digest(token));
    },
  };
}
