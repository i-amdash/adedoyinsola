import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createCloud } from "../server/cloud.mjs";

// Read-only preflight. Never log credentials, connection URLs or private rows.
try {
  const client = createCloud({ ...process.env, DATA_BACKEND: "supabase" });
  for (const table of ["content", "players", "attempts", "scores", "sessions", "rate_limits"]) {
    const { error } = await client.from(`portfolio_${table}`).select("*", { count: "exact", head: true });
    if (error) throw new Error(`portfolio_${table}: ${error.code || "query failed"}. Run the Supabase setup SQL and check Data API access.`);
    console.log(`OK: portfolio_${table} is reachable by the backend.`);
  }
  const { error: rankError } = await client.rpc("portfolio_leaderboard", { p_game: "memory" });
  if (rankError) throw new Error(`Leaderboard function: ${rankError.code || "query failed"}. Run the setup SQL.`);
  const { data: bucket, error: storageError } = await client.storage.getBucket("project-covers");
  if (storageError || !bucket?.public || Number(bucket.file_size_limit) !== 8388608 || !["image/png", "image/jpeg", "image/gif", "image/webp"].every(m => bucket.allowed_mime_types?.includes(m)))
    throw new Error("Configure the public project-covers bucket with an 8 MB limit and PNG, JPG, GIF and WebP MIME types.");
  console.log("OK: leaderboard function and project-cover storage are configured.");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (key) {
    const publicClient = createClient(client.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const table of ["players", "scores", "sessions", "content", "attempts", "rate_limits"]) {
      // GET with a zero-row limit retains PostgREST's error code; HEAD omits it.
      const { error } = await publicClient.from(`portfolio_${table}`).select("*").limit(0);
      if (error?.code !== "42501") throw new Error(`Public access to portfolio_${table} was not explicitly denied. Reapply the table grants from setup SQL.`);
    }
    console.log("OK: the publishable key cannot read the private application tables.");
  }
  console.log("Supabase preflight passed. Add the server environment variables to Vercel before deployment.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
