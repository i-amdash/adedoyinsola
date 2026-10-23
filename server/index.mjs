import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCloud } from "./cloud.mjs";
import { createApp } from "./app.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1";
createApp({
  supabase: createCloud(),
  directory: process.env.DATA_DIR || path.join(root, "data"),
  passwordHash: process.env.ADMIN_PASSWORD_HASH,
  production: process.env.NODE_ENV === "production",
  staticDirectory: path.join(root, "dist"),
  trustProxy: process.env.TRUST_PROXY === "1",
}).listen(port, host, () => {
  console.log(`Adedoyinsola World API: http://${host}:${port}`);
  if (!process.env.ADMIN_PASSWORD_HASH)
    console.log(
      "Admin is locked. Run npm run admin:setup to choose your password, then restart.",
    );
});
