import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { hashPassword } from "../server/auth.mjs";
import { createStore } from "../server/store.mjs";
const pass = "test-only-password-726!";
async function fixture(t, options = {}) {
  const dir = await mkdtemp(tmpdir() + "/doyin-test-");
  const app = createApp({
    directory: dir,
    passwordHash: hashPassword(pass),
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    base,
    req: async (path, method = "GET", body, cookie, origin) =>
      fetch(base + path, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}
test("content is public, writes require authentication, and bad passwords are rejected", async (t) => {
  const f = await fixture(t);
  const data = await (await f.req("/api/content")).json();
  assert.equal(data.profile.name, "Adedoyinsola");
  assert.equal((await f.req("/api/content", "PUT", data)).status, 401);
  assert.equal(
    (await f.req("/api/auth/login", "POST", { password: "wrong" })).status,
    401,
  );
});
test("admin updates persist across store restarts, reject stale writes, and logout revokes access", async (t) => {
  const f = await fixture(t);
  const login = await f.req("/api/auth/login", "POST", { password: pass });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
  const content = await (await f.req("/api/content")).json();
  content.profile.tagline = "Updated from the studio";
  const saved = await f.req("/api/content", "PUT", content, cookie);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);
  assert.equal(
    (await createStore(f.dir).read()).profile.tagline,
    "Updated from the studio",
  );
  assert.equal(
    (await f.req("/api/content", "PUT", content, cookie)).status,
    409,
  );
  await f.req("/api/auth/logout", "POST", {}, cookie);
  assert.equal(
    (await f.req("/api/content", "PUT", content, cookie)).status,
    401,
  );
});
test("rejects unsafe URLs, duplicate IDs and cross-origin writes", async (t) => {
  const f = await fixture(t);
  const login = await f.req("/api/auth/login", "POST", { password: pass });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const content = await (await f.req("/api/content")).json();
  content.projects[0].url = "javascript:alert(1)";
  assert.equal(
    (await f.req("/api/content", "PUT", content, cookie)).status,
    400,
  );
  content.projects[0].url = "";
  content.projects.push({ ...content.projects[0] });
  assert.equal(
    (await f.req("/api/content", "PUT", content, cookie)).status,
    400,
  );
  assert.equal(
    (
      await f.req(
        "/api/auth/login",
        "POST",
        { password: pass },
        undefined,
        "https://evil.example",
      )
    ).status,
    403,
  );
});
test("concurrent writes cannot silently overwrite content", async (t) => {
  const f = await fixture(t);
  const store = createStore(f.dir);
  const data = await store.read();
  const results = await Promise.allSettled([
    store.save(data),
    store.save(data),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("unconfigured admin stays locked and production cookies require HTTPS", async (t) => {
  const f = await fixture(t, { passwordHash: undefined });
  assert.equal(
    (await f.req("/api/auth/login", "POST", { password: pass })).status,
    503,
  );
  const p = await fixture(t, { production: true });
  const login = await p.req("/api/auth/login", "POST", { password: pass });
  assert.match(login.headers.get("set-cookie"), /__Host-doyin_session/);
  assert.match(login.headers.get("set-cookie"), /Secure/);
  assert.ok(login.headers.get("content-security-policy"));
});
test("project creation and removal are reflected in the public content API", async (t) => {
  const f = await fixture(t);
  const login = await f.req("/api/auth/login", "POST", { password: pass });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  let content = await (await f.req("/api/content")).json();
  content.projects.push({
    id: "qa-project",
    title: "QA project",
    category: "Web",
    description: "Temporary integration test project",
    stack: ["React"],
    url: "https://example.com",
    image: "",
    featured: false,
  });
  let response = await f.req("/api/content", "PUT", content, cookie);
  assert.equal(response.status, 200);
  content = await response.json();
  assert.equal(
    (await (await f.req("/api/content")).json()).projects.at(-1).id,
    "qa-project",
  );
  content.projects = content.projects.filter((p) => p.id !== "qa-project");
  response = await f.req("/api/content", "PUT", content, cookie);
  assert.equal(response.status, 200);
  assert.equal(
    (await (await f.req("/api/content")).json()).projects.some(
      (p) => p.id === "qa-project",
    ),
    false,
  );
});

test("a paused or unreachable database still serves the site's content", async (t) => {
  const failing = { then: (r) => r({ data: null, error: { code: "57P01", message: "unavailable" } }) };
  const chain = new Proxy({}, { get: (_, k) => (k === "then" ? failing.then : () => chain) });
  const f = await fixture(t, { supabase: { from: () => chain, rpc: () => chain, storage: { from: () => chain } } });
  const r = await f.req("/api/content");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-content-source"), "built-in");
  assert.ok((await r.json()).projects.length > 0);
});

test("stored content that no longer matches the schema is repaired, not fatal", async (t) => {
  const f = await fixture(t);
  const { writeFile } = await import("node:fs/promises");
  const good = await (await f.req("/api/content")).json();
  const broken = { ...good, world: { ...good.world, accent: "not-a-colour" }, projects: [{ id: "BAD ID" }, good.projects[0]] };
  await writeFile(f.dir + "/content.json", JSON.stringify(broken));
  const r = await f.req("/api/content");
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.match(data.world.accent, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(data.projects.map((p) => p.id), [good.projects[0].id]);
  assert.equal(data.profile.name, good.profile.name, "valid sections are kept");
});

test("admin cookies are tied to the current password and compressed bodies are refused", async (t) => {
  const f = await fixture(t);
  const login = await f.req("/api/auth/login", "POST", { password: pass });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await f.req("/api/auth/session", "GET", undefined, cookie)).json()).authenticated, true);
  const stale = cookie.replace(/\.[0-9a-f]{16}$/, ".0000000000000000");
  assert.equal((await (await f.req("/api/auth/session", "GET", undefined, stale)).json()).authenticated, false);
  const gz = await fetch(f.base + "/api/players/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: Buffer.from([31, 139, 8, 0]) });
  assert.equal(gz.status, 415);
});

test("the admin can remove a player and their scores leave the leaderboard", async (t) => {
  const f = await fixture(t);
  const admin = (await f.req("/api/auth/login", "POST", { password: pass })).headers.get("set-cookie").split(";")[0];
  const reg = await f.req("/api/players/register", "POST", { username: "spam_name", password: "test-passphrase-1234" });
  const player = (await reg.json()).player;
  assert.equal((await f.req("/api/admin/players")).status, 401, "moderation needs the admin");
  const list = await (await f.req("/api/admin/players?q=spam", "GET", undefined, admin)).json();
  assert.deepEqual(list.players.map((p) => p.username), ["spam_name"]);
  assert.equal((await f.req("/api/admin/players/remove", "POST", { id: player.id }, admin)).status, 200);
  assert.deepEqual((await (await f.req("/api/admin/players", "GET", undefined, admin)).json()).players, []);
});
