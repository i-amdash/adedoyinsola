// Project requests from the /build configurator. The price is always recalculated here
// from the stored catalogue, so a request can't carry a tampered estimate.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomInt } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { estimate, describe, formatMoney } from "../shared/builder.mjs";
import { briefPdf } from "../shared/brief.mjs";
import { cloudResult, rateOptions } from "./cloud.mjs";
import { createNotifier } from "./notify.mjs";

export const statuses = ["new", "contacted", "won", "lost", "archived"];
const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const optional = (max) => z.string().trim().max(max).optional().default("");
const requestSchema = z.object({
  product: z.string().max(40),
  answers: z.record(z.string(), z.unknown()),
  contact: z.object({
    name: z.string().trim().min(2, "Please tell me your name").max(80),
    email: z.email("Please enter a valid email").max(200),
    phone: optional(30).refine((v) => /^[0-9+()\-.\s]*$/.test(v), "Use digits, spaces and + only"),
    company: optional(100),
    notes: optional(2000),
  }),
  website: z.string().max(200).optional(), // honeypot: people never fill this in
});
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newReference = () => "BR-" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function briefFor(doc, catalog, owner) {
  const product = catalog.products.find((p) => p.id === doc.product);
  return {
    reference: doc.reference,
    createdAt: doc.createdAt,
    productName: doc.productName,
    tagline: product?.tagline,
    estimate: doc.estimate,
    summary: doc.summary,
    contact: doc.contact,
    usdRate: catalog.usdRate,
    owner,
  };
}

function emailFor(doc, catalog) {
  const money = (n) => formatMoney(n, "NGN");
  const range = `${money(doc.estimate.low)} – ${money(doc.estimate.high)}`;
  const c = doc.contact;
  const rows = (pairs) => pairs.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b776b;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2a24;max-width:620px">
<p style="color:#486a33;font-size:12px;letter-spacing:.12em;font-weight:700">NEW PROJECT REQUEST · ${escapeHtml(doc.reference)}</p>
<h2 style="margin:0 0 4px">${escapeHtml(doc.productName)} for ${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ""}</h2>
<p style="font-size:18px;margin:8px 0">${escapeHtml(range)} · ${doc.estimate.weeks[0]}–${doc.estimate.weeks[1]} weeks${doc.estimate.monthly ? ` · +${escapeHtml(money(doc.estimate.monthly))}/month` : ""}</p>
<table style="border-collapse:collapse;font-size:14px">${rows([["Email", c.email], ["Phone / WhatsApp", c.phone || "—"], ["Notes", c.notes || "—"]])}</table>
<h3 style="margin-top:24px">Answers</h3>
<table style="border-collapse:collapse;font-size:14px">${rows(doc.summary)}</table>
<p style="color:#6b776b;font-size:12px;margin-top:24px">The PDF brief is attached. Reply to this email to answer ${escapeHtml(c.name)} directly.</p></div>`;
  const text = [`New project request ${doc.reference}`, `${doc.productName} for ${c.name}`, range, `Email: ${c.email}`, `Phone: ${c.phone || "-"}`, `Notes: ${c.notes || "-"}`, "", ...doc.summary.map(([k, v]) => `${k}: ${v}`)].join("\n");
  return { subject: `New ${doc.productName.toLowerCase()} request · ${range} · ${c.name}`, html, text };
}

function createLocalRequests(directory) {
  const file = path.join(directory, "requests.json");
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return { requests: [] };
      throw e;
    }
  }
  function update(fn) {
    const task = queue.then(async () => {
      const data = await read();
      const result = await fn(data);
      await mkdir(directory, { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
      await rename(file + ".tmp", file);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    add: (doc) => update((d) => void (d.requests = [doc, ...d.requests].slice(0, 1000))),
    list: async () => (await read()).requests.slice(0, 200),
    setStatus: (id, status) => update((d) => d.requests.forEach((r) => r.id === id && (r.status = status))),
    remove: (id) => update((d) => void (d.requests = d.requests.filter((r) => r.id !== id))),
  };
}
function createCloudRequests(client) {
  const table = () => client.from("portfolio_requests");
  return {
    add: async (doc) => void cloudResult(await table().insert({ id: doc.id, reference: doc.reference, status: doc.status, created_at: doc.createdAt, document: doc })),
    list: async () => cloudResult(await table().select("id,status,document").order("created_at", { ascending: false }).limit(200)).map((r) => ({ ...r.document, id: r.id, status: r.status })),
    setStatus: async (id, status) => void cloudResult(await table().update({ status }).eq("id", id)),
    remove: async (id) => void cloudResult(await table().delete().eq("id", id)),
  };
}

export function mountRequests(app, { directory, supabase = null, content, adminAuth, notify = createNotifier(), now = Date.now }) {
  const store = supabase ? createCloudRequests(supabase) : createLocalRequests(directory);
  const limit = rateLimit(
    rateOptions(supabase, "project-request", {
      windowMs: 60 * 60 * 1000,
      limit: 8,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "You've sent several requests already. Please email me instead." },
    }),
  );
  app.post("/api/requests", limit, async (req, res) => {
    const input = requestSchema.safeParse(req.body);
    if (!input.success) throw fail(400, input.error.issues[0]?.message || "Please check the form.");
    const { product, answers, contact, website } = input.data;
    const doc = await content.read();
    const catalog = doc.builder;
    const item = catalog.products.find((p) => p.id === product && p.enabled);
    if (!item) throw fail(400, "That project type isn't available right now.");
    const quote = estimate(catalog, product, answers);
    const createdAt = new Date(now()).toISOString();
    const request = {
      id: randomUUID(),
      reference: newReference(),
      createdAt,
      status: "new",
      product,
      productName: item.name,
      answers: quote.answers,
      estimate: { low: quote.low, high: quote.high, total: quote.total, weeks: quote.weeks, monthly: quote.monthly, lines: quote.lines },
      summary: describe(catalog, product, quote.answers),
      contact,
    };
    // Bots fill every field; they get a normal-looking reply and nothing is stored.
    if (website) return res.json({ reference: request.reference, createdAt, estimate: request.estimate, summary: request.summary, emailed: false });
    await store.add(request);
    let emailed = false;
    if (notify) {
      try {
        const owner = { name: doc.profile.name, email: doc.profile.email };
        const pdf = briefPdf(briefFor(request, catalog, owner));
        await notify({
          to: doc.profile.email,
          replyTo: contact.email,
          ...emailFor(request, catalog),
          attachments: [{ filename: `brief-${request.reference}.pdf`, content: Buffer.from(pdf).toString("base64") }],
        });
        emailed = true;
      } catch (e) {
        console.error("Request saved, but the email failed:", e.message);
      }
    }
    res.json({ reference: request.reference, createdAt, estimate: request.estimate, summary: request.summary, emailed });
  });
  app.get("/api/admin/requests", adminAuth, async (_req, res) => res.json({ requests: await store.list() }));
  app.post("/api/admin/requests/status", adminAuth, async (req, res) => {
    const { id, status } = req.body || {};
    if (typeof id !== "string" || !uuid.test(id) || !statuses.includes(status)) throw fail(400, "Unknown request or status.");
    await store.setStatus(id, status);
    res.json({ ok: true });
  });
  app.post("/api/admin/requests/remove", adminAuth, async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || !uuid.test(id)) throw fail(400, "Unknown request.");
    await store.remove(id);
    res.json({ ok: true });
  });
}
