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
