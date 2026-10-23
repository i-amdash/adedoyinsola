import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { hashPassword } from "../server/auth.mjs";
import { createStore, contentSchema } from "../server/store.mjs";
import { MAX_IMAGE_BYTES } from "../server/uploads.mjs";

const password = "disposable-upload-test";
// Two valid one-pixel frames with a loop extension. Preserve bytes, not just a thumbnail.
const gif = Buffer.from("47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b", "hex");
async function fixture(t) {
  const directory = await mkdtemp(`${tmpdir()}/portfolio-covers-`);
  const server = createApp({ directory, passwordHash: hashPassword(password) }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(r => server.close(r)); await rm(directory, { recursive: true, force: true }); });
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const upload = (bytes, headers = {}) => fetch(`${base}/api/uploads`, { method: "POST", headers: { "Content-Type": "application/octet-stream", cookie, ...headers }, body: bytes });
  return { base, cookie, upload, directory };
}
test("uploaded GIFs retain all frames and their saved covers survive a store restart", async t => {
  const f = await fixture(t), response = await f.upload(gif);
  assert.equal(response.status, 201);
  const cover = await response.json();
  assert.match(cover.url, /^\/uploads\/[^/]+\.gif$/);
  const image = await fetch(f.base + cover.url);
  assert.match(image.headers.get("content-type"), /image\/gif/);
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), gif);
  const content = await createStore(f.directory).read(); content.projects[0].image = cover.url;
  await createStore(f.directory).save(content);
  assert.equal((await createStore(f.directory).read()).projects[0].image, cover.url);
});
test("uploads require admin auth, same-origin requests, valid bytes and the size limit", async t => {
  const f = await fixture(t);
  assert.equal((await f.upload(gif, { cookie: "" })).status, 401);
  assert.equal((await f.upload(gif, { origin: "https://evil.example" })).status, 403);
  for (const bytes of [Buffer.from("<svg onload='alert(1)'></svg>"), gif.subarray(0, 20), Buffer.from("<html>fake.gif</html>")])
    assert.equal((await f.upload(bytes)).status, 400);
  assert.equal((await f.upload(Buffer.alloc(MAX_IMAGE_BYTES + 1))).status, 413);
  const data = await createStore(f.directory).read(); data.projects[0].image = "/uploads/../../.env";
  assert.equal(contentSchema.safeParse(data).success, false);
  data.projects[0].image = "https://example.com/demo.gif";
  assert.equal(contentSchema.safeParse(data).success, true);
});
test("the upload preparation endpoint validates metadata and preserves local development", async t => {
  const f = await fixture(t);
  const prepare = (type, size, cookie = f.cookie) => fetch(f.base + "/api/uploads/sign", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ type, size }) });
  assert.equal((await prepare("image/gif", gif.length, "")).status, 401);
  assert.equal((await prepare("image/svg+xml", gif.length)).status, 400);
  assert.equal((await prepare("image/gif", MAX_IMAGE_BYTES + 1)).status, 400);
  assert.deepEqual(await (await prepare("image/gif", gif.length)).json(), { mode: "local" });
});
