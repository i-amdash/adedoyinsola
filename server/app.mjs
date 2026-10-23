import express from "express";
import { mountUploads } from "./uploads.mjs";
import { mountPlayers } from "./players.mjs";
import { rateLimit } from "express-rate-limit";
import { createSessions } from "./sessions.mjs";
import { cloudResult, rateOptions } from "./cloud.mjs";
import { createStore } from "./store.mjs";
import { verifyPassword } from "./auth.mjs";
export function createApp({
  directory,
  passwordHash,
  production = false,
  staticDirectory,
  trustProxy = false,
  now,
  supabase = null,
}) {
  const app = express(),
    store = createStore(directory, supabase),
    sessions = createSessions(supabase, now);
  if (trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    if (production)
      res.set(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' blob: data: ${supabase ? new URL(supabase.supabaseUrl).origin : ''}; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`,
      );
    next();
  });
  app.use("/api", express.json({ limit: "512kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin) {
        try {
          if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Origin not allowed" });
        } catch { return res.status(403).json({ error: "Origin not allowed" }); }
      }
      if (!(req.method === "POST" && req.path === "/uploads") && !req.is("application/json"))
        return res.status(415).json({ error: "JSON is required" });
    }
    next();
  });
  const cookieName = production ? "__Host-doyin_session" : "doyin_session";
  function session(req) {
    const raw = req.headers.cookie
      ?.split(";")
      .find((v) => v.trim().startsWith(cookieName + "="))
      ?.trim()
      .slice(cookieName.length + 1);
    return sessions.read(raw, "admin");
  }
  async function auth(req, res, next) {
    if (!await session(req)) return res.status(401).json({ error: "Please sign in" });
    next();
  }
  mountUploads(app, { directory, auth, supabase });
  app.get("/api/health", async (_req, res) => {
    if (supabase) cloudResult(await supabase.from("portfolio_content").select("id").limit(1));
    res.json({ ok: true, storage: supabase ? "supabase" : "local" });
  });
  app.get("/api/content", async (_req, res, next) => {
    try {
      res.json(await store.read());
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/auth/session", async (req, res) =>
    res.json({ authenticated: !!await session(req), configured: !!passwordHash }),
  );
  app.post(
    "/api/auth/login",
    rateLimit(rateOptions(supabase, "admin-login", {
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many attempts. Try again in 15 minutes." },
    })),
    async (req, res) => {
      if (!passwordHash)
        return res
          .status(503)
          .json({
            error:
              "Run npm run admin:setup in the project folder, then restart the server.",
          });
      if (
        typeof req.body?.password !== "string" ||
        req.body.password.length > 512 ||
        !verifyPassword(req.body.password, passwordHash)
      )
        return res.status(401).json({ error: "Incorrect password" });
      const id = await sessions.issue("admin", null, 8 * 60 * 60 * 1000);
      res.cookie(cookieName, id, {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/",
      });
      res.json({ ok: true });
    },
  );
  app.post("/api/auth/logout", async (req, res) => {
    const raw = req.headers.cookie
      ?.split(";")
      .find((v) => v.trim().startsWith(cookieName + "="))
      ?.trim()
      .slice(cookieName.length + 1);
    await sessions.revoke(raw);
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  app.put("/api/content", auth, async (req, res, next) => {
    try {
      res.json(await store.save(req.body));
    } catch (e) {
      next(e);
    }
  });
  mountPlayers(app, { directory, production, now, supabase });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  if (staticDirectory) {
    app.use(express.static(staticDirectory));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(staticDirectory + "/index.html"),
    );
  }
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "File is too large. Choose an image or GIF smaller than 8 MB." });
    if (err.name === "ZodError")
      return res
        .status(400)
        .json({
          error: "Invalid content",
          details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
    res
      .status(err.status || 500)
      .json({ error: err.status ? err.message : "Unable to complete request" });
  });
  return app;
}
