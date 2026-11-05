import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { seed } from "./seed.mjs";
import { cloudResult, cloudFailure } from "./cloud.mjs";
import { uploadPath } from "./uploads.mjs";
import { defaultBuilder } from "../shared/builder.mjs";
const text = z.string().trim().min(1).max(4000);
const link = z.union([
  z.literal(""),
  z.url().refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL"),
]);
const staticCover = /^\/project-covers\/[a-z0-9-]+\.(png|jpg|gif|webp)$/;
const coverImage = z.union([link, z.string().regex(uploadPath), z.string().regex(staticCover)], { error: "Use an uploaded image or an http/https image URL" });
const slug = z.string().regex(/^[a-z0-9-]+$/).max(40);
const naira = z.number().int().min(0).max(10_000_000_000);
const option = z.object({
  id: slug,
  label: text.max(140),
  price: naira,
  weeks: z.number().min(0).max(52).optional(),
  monthly: naira.optional(),
  multiplier: z.number().min(1).max(3).optional(),
  speed: z.number().min(0.3).max(1).optional(),
  enabled: z.boolean().optional(),
});
const question = z.object({
  id: slug,
  label: text.max(200),
  help: z.string().trim().max(300).optional(),
  type: z.enum(["single", "multi", "count"]),
  options: z.array(option).max(30).optional(),
  min: z.number().int().min(0).max(1000).optional(),
  max: z.number().int().min(1).max(1000).optional(),
  included: z.number().int().min(0).max(1000).optional(),
  unitPrice: naira.optional(),
  unitWeeks: z.number().min(0).max(10).optional(),
  unit: z.string().trim().max(40).optional(),
});
const step = z.object({ id: slug, title: text.max(80), questions: z.array(question).max(12) });
export const builderSchema = z.object({
  usdRate: z.number().positive().max(100000),
  spread: z.number().min(0).max(0.5),
  products: z
    .array(
      z.object({
        id: slug,
        kind: z.enum(["web", "mobile"]),
        name: text.max(80),
        tagline: text.max(200),
        base: naira,
        weeks: z.tuple([z.number().min(0).max(104), z.number().min(0).max(104)]),
        includes: z.array(text.max(80)).max(10),
        enabled: z.boolean(),
        steps: z.array(step).max(6),
      }),
    )
    .min(1)
    .max(8)
    .refine((v) => new Set(v.map((p) => p.id)).size === v.length, "Product IDs must be unique"),
  finishing: z.array(step).max(4),
});
export const contentSchema = z.object({
  revision: z.number().int().positive(),
  profile: z.object({
    name: text.max(80),
    role: text.max(120),
    tagline: text.max(180),
    bio: text,
    email: z.email(),
    availability: text.max(100),
    skills: z.array(text.max(60)).max(30),
    github: link,
    linkedin: link,
  }),
  world: z.object({
    title: text.max(120),
    subtitle: text.max(300),
    welcome: text.max(120),
    district: text.max(50),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  projects: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(100),
        title: text.max(100),
        category: text.max(80),
        description: text,
        stack: z.array(text.max(60)).max(20),
        url: link,
        image: coverImage,
        poster: coverImage.optional().default(""),
        featured: z.boolean(),
      }),
    )
    .max(50)
    .refine(
      (v) => new Set(v.map((p) => p.id)).size === v.length,
      "Project IDs must be unique",
    ),
  services: z
    .array(z.object({ title: text.max(100), description: text }))
    .max(20),
  builder: builderSchema.default(() => structuredClone(defaultBuilder)),
});
/**
 * Rebuild a stored document that no longer matches the schema (an older format, or an edit
 * made directly in the database) section by section, so the site and admin keep working.
 */
export function repairContent(raw) {
  const exact = contentSchema.safeParse(raw);
  if (exact.success) return { content: exact.data, repaired: false };
  const doc = raw && typeof raw === "object" ? raw : {};
  const shape = contentSchema.shape;
  const pick = (key) => {
    const r = shape[key].safeParse(doc[key]);
    return r.success ? r.data : structuredClone(seed[key]);
  };
  const project = shape.projects.element ?? shape.projects.def?.element ?? shape.projects._def?.innerType?.element;
  const seen = new Set();
  const projects = (Array.isArray(doc.projects) ? doc.projects : [])
    .map((p) => project?.safeParse(p))
    .filter((r) => r?.success && !seen.has(r.data.id) && seen.add(r.data.id))
    .map((r) => r.data)
    .slice(0, 50);
  const content = {
    revision: Number.isInteger(doc.revision) && doc.revision > 0 ? doc.revision : seed.revision,
    profile: pick("profile"),
    projects: projects.length ? projects : structuredClone(seed.projects),
    world: pick("world"),
    services: pick("services"),
    builder: pick("builder"),
  };
  return { content: contentSchema.parse(content), repaired: true };
}
export function createStore(directory, client = null) {
  const file = path.join(directory, "content.json");
  let queue = Promise.resolve();
  async function read() {
    if (client) {
      const row = cloudResult(await client.from("portfolio_content").select("document").eq("id", "main").maybeSingle());
      return row ? repairContent(row.document).content : structuredClone(seed);
    }
    try {
      return repairContent(JSON.parse(await readFile(file, "utf8"))).content;
    } catch (e) {
      if (e.code === "ENOENT") return structuredClone(seed);
      throw e;
    }
  }
  function save(content) {
    const next = queue.then(async () => {
      const valid = contentSchema.parse(content);
      const current = await read();
      if (valid.revision !== current.revision) {
        const e = new Error(
          "Content changed in another session. Reload before saving.",
        );
        e.status = 409;
        throw e;
      }
      valid.revision++;
      if (client) {
        const row = { id: "main", revision: valid.revision, document: valid, updated_at: new Date().toISOString() };
        const updated = cloudResult(await client.from("portfolio_content").update(row).eq("id", "main").eq("revision", current.revision).select("document").maybeSingle());
        if (updated) return contentSchema.parse(updated.document);
        // Only the initial seed is insertable. A competing update/insert gets a conflict.
        if (current.revision === seed.revision) {
          const inserted = await client.from("portfolio_content").insert(row).select("document").single();
          if (!inserted.error) return contentSchema.parse(inserted.data.document);
          if (inserted.error.code !== "23505") cloudResult(inserted);
        }
        throw cloudFailure(409, "Content changed in another session. Reload before saving.");
      }
      await mkdir(directory, { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(valid, null, 2), {
        mode: 0o600,
      });
      await rename(file + ".tmp", file);
      return valid;
    });
    queue = next.catch(() => {});
    return next;
  }
  return { read, save };
}
