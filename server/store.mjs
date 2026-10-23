import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { seed } from "./seed.mjs";
import { cloudResult, cloudFailure } from "./cloud.mjs";
import { uploadPath } from "./uploads.mjs";
const text = z.string().trim().min(1).max(4000);
const link = z.union([
  z.literal(""),
  z.url().refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL"),
]);
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
        image: z.union([link, z.string().regex(uploadPath, "Use an uploaded image or an http/https image URL")]),
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
});
export function createStore(directory, client = null) {
  const file = path.join(directory, "content.json");
  let queue = Promise.resolve();
  async function read() {
    if (client) {
      const row = cloudResult(await client.from("portfolio_content").select("document").eq("id", "main").maybeSingle());
      return row ? contentSchema.parse(row.document) : structuredClone(seed);
    }
    try {
      return contentSchema.parse(JSON.parse(await readFile(file, "utf8")));
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
