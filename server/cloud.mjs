import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const cloudFailure = (status, message) => Object.assign(new Error(message), { status });
export function createCloud(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const required = env.VERCEL === "1" || env.DATA_BACKEND === "supabase";
  if (env.DATA_BACKEND === "local" && !required) return null;
  if (!secret) {
    if (required) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY before deploying.");
    return null;
  }
  if (!url || !/^https:\/\//.test(url)) throw new Error("Set a valid HTTPS SUPABASE_URL.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
export function cloudResult({ data, error }, message = "Database unavailable. Please try again.") {
  if (error) {
    if (error.code === "PT409") throw cloudFailure(409, error.message);
    if (error.code === "PT400") throw cloudFailure(400, error.message);
    throw cloudFailure(503, message);
  }
  return data;
}
const hash = value => createHash("sha256").update(value).digest("hex");
class CloudRateStore {
  localKeys = false;
  constructor(client, scope) { this.client = client; this.prefix = `${scope}:`; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const result = cloudResult(await this.client.rpc("portfolio_rate_hit", { p_key: hash(this.prefix + key), p_window_ms: this.windowMs }));
    return { totalHits: result.totalHits, resetTime: new Date(result.resetTime) };
  }
  async resetKey(key) { cloudResult(await this.client.from("portfolio_rate_limits").delete().eq("key", hash(this.prefix + key))); }
  // All configured limiters count both successful and failed requests.
  async decrement() {}
}
export const rateOptions = (client, scope, options) => ({ ...options, ...(client ? { store: new CloudRateStore(client, scope) } : {}) });
