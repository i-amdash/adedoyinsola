import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultBuilder, estimate, cleanAnswers, defaultAnswers, formatMoney, describe } from "../shared/builder.mjs";
import { briefPdf, pdfText } from "../shared/brief.mjs";
import { builderSchema, repairContent } from "../server/store.mjs";
import { seed } from "../server/seed.mjs";
import { createApp } from "../server/app.mjs";
import { hashPassword } from "../server/auth.mjs";

test("the default catalogue is valid and every product has a sensible starting price", () => {
  assert.equal(builderSchema.safeParse(defaultBuilder).success, true);
  for (const p of defaultBuilder.products) {
    const e = estimate(defaultBuilder, p.id, defaultAnswers(defaultBuilder, p.id));
    assert.ok(e.low <= e.total && e.total <= e.high, p.id);
    assert.ok(e.weeks[0] >= 1 && e.weeks[0] <= e.weeks[1], p.id);
    const ids = defaultBuilder.finishing.concat(p.steps).flatMap((s) => s.questions.map((q) => q.id));
    assert.equal(new Set(ids).size, ids.length, `${p.id} question ids are unique`);
  }
});

test("each choice moves the price and timeline, and the total matches the breakdown", () => {
  const base = estimate(defaultBuilder, "mobile", {});
  const full = estimate(defaultBuilder, "mobile", { type: "restaurant", pieces: ["pos", "rider"], features: ["tracking"], support: "essential" });
  assert.equal(full.total - base.total, 1400000 + 1600000 + 450000);
  assert.ok(full.weeks[0] > base.weeks[0]);
  assert.equal(full.monthly - base.monthly, 50000);
  const sum = full.lines.reduce((a, l) => a + l.amount, 0);
  assert.equal(full.total, Math.round(sum / 50000) * 50000);
  const pages = estimate(defaultBuilder, "website", { pages: 8 });
  assert.ok(pages.lines.some((l) => l.label === "3 extra pages" && l.amount === 105000));
  const rush = estimate(defaultBuilder, "website", { speed: "priority" });
  assert.ok(rush.total > estimate(defaultBuilder, "website", {}).total);
  assert.ok(rush.weeks[1] <= estimate(defaultBuilder, "website", {}).weeks[1]);
});

test("answers that aren't in the catalogue are ignored", () => {
  const clean = cleanAnswers(defaultBuilder, "website", { pages: 9999, look: "gold-plated", features: ["blog", "blog", "free-money", 4], extra: "x" });
  assert.equal(clean.pages, 40);
  assert.equal(clean.look, "template");
  assert.deepEqual(clean.features, ["blog"]);
  assert.equal("extra" in clean, false);
  const off = structuredClone(defaultBuilder);
  off.products[0].steps[0].questions[2].options.find((o) => o.id === "blog").enabled = false;
  assert.deepEqual(cleanAnswers(off, "website", { features: ["blog"] }).features, []);
  assert.equal(estimate(defaultBuilder, "nope", {}), null);
});

test("money reads naturally in naira and dollars", () => {
  assert.equal(formatMoney(350000), "₦350k");
  assert.equal(formatMoney(1250000), "₦1.25M");
  assert.equal(formatMoney(2000000), "₦2M");
  assert.equal(formatMoney(10000000), "₦10M");
  assert.equal(formatMoney(12500000), "₦12.5M");
  assert.equal(formatMoney(1550000, "USD", 1550), "$1,000");
});

test("the PDF brief is a well-formed document", () => {
  const e = estimate(defaultBuilder, "store", { features: ["accounts"] });
  const pdf = briefPdf({ reference: "BR-TEST22", createdAt: new Date(0).toISOString(), productName: "Online store", estimate: e, summary: describe(defaultBuilder, "store", e.answers), contact: { name: "Adé (O’Neil)", email: "a@b.co", notes: "x".repeat(3000) } });
  const text = Buffer.from(pdf).toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /%%EOF\n$/);
  assert.match(text, /\(Online store\) Tj/);
  assert.match(text, /\\\(O'Neil\\\)/);
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
  assert.equal(pdfText("₦5 – ok…"), "NGN 5 - ok...");
});

test("older content without a builder is upgraded with the default catalogue", () => {
  const { builder, ...old } = structuredClone(seed);
  const { content } = repairContent(old);
  assert.deepEqual(content.builder, defaultBuilder);
});

test("requests are priced on the server, emailed, and visible only to the admin", async (t) => {
  const dir = await mkdtemp(tmpdir() + "/doyin-req-");
  const sent = [];
  const pass = "test-only-password-726!";
  const server = createApp({ directory: dir, passwordHash: hashPassword(pass), notify: async (m) => void sent.push(m) }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const contact = { name: "Ada", email: "ada@example.com", phone: "+234 800 000 0000" };
  const bad = await post("/api/requests", { product: "mobile", answers: {}, contact: { name: "A", email: "nope" } });
  assert.equal(bad.status, 400);
  const res = await post("/api/requests", { product: "mobile", answers: { type: "restaurant", pieces: ["pos"], total: 1 }, contact, estimate: { total: 1 } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reference, /^BR-[A-Z2-9]{6}$/);
  assert.equal(body.emailed, true);
  assert.equal(body.estimate.total, estimate(defaultBuilder, "mobile", { type: "restaurant", pieces: ["pos"] }).total);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Ada/);
  assert.equal(sent[0].replyTo, "ada@example.com");
  assert.match(Buffer.from(sent[0].attachments[0].content, "base64").toString("latin1"), /^%PDF/);
  const trap = await post("/api/requests", { product: "website", answers: {}, contact, website: "http://spam" });
  assert.equal(trap.status, 200);
  assert.equal(sent.length, 1);
  assert.equal((await fetch(base + "/api/admin/requests")).status, 401);
  const login = await post("/api/auth/login", { password: pass });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const list = await (await fetch(base + "/api/admin/requests", { headers: { cookie } })).json();
  assert.equal(list.requests.length, 1);
  assert.equal(list.requests[0].contact.name, "Ada");
  assert.equal((await post("/api/admin/requests/status", { id: list.requests[0].id, status: "won" }, cookie)).status, 200);
  assert.equal((await post("/api/admin/requests/status", { id: list.requests[0].id, status: "paid" }, cookie)).status, 400);
  const after = await (await fetch(base + "/api/admin/requests", { headers: { cookie } })).json();
  assert.equal(after.requests[0].status, "won");
  assert.equal((await post("/api/admin/requests/remove", { id: list.requests[0].id }, cookie)).status, 200);
  assert.equal((await (await fetch(base + "/api/admin/requests", { headers: { cookie } })).json()).requests.length, 0);
});
