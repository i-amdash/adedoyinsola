import { createApp } from "../server/app.mjs";
import { createCloud } from "../server/cloud.mjs";

// Vercel serves dist/ from its CDN; this function handles only /api/*.
export default createApp({
  directory: "/tmp/portfolio-unused",
  passwordHash: process.env.ADMIN_PASSWORD_HASH,
  production: true,
  trustProxy: true,
  supabase: createCloud({ ...process.env, DATA_BACKEND: "supabase" }),
});
