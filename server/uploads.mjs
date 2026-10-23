import express from "express";
import { rateLimit } from "express-rate-limit";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { cloudResult, rateOptions } from "./cloud.mjs";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const uploadPath = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

// Check the bytes, not the supplied filename or browser MIME type. Originals are
// retained so animated GIF/WebP frames survive upload and future server restarts.
function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 14) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length >= 45 && bytes.toString("ascii", 12, 16) === "IHDR" && bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return "jpg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0 && bytes.at(-1) === 0x3b) return "gif";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) && bytes.readUInt32LE(4) === bytes.length - 8) return "webp";
  return null;
}

const mimeTypes = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const coverPath = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

export function mountUploads(app, { directory, auth, supabase = null }) {
  const folder = path.join(directory, "uploads");
  const limit = rateLimit(rateOptions(supabase, "covers", {
    windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many uploads. Try again in 15 minutes." },
  }));
  app.post("/api/uploads/sign", auth, limit, async (req, res) => {
    const type = Object.keys(mimeTypes).find(key => mimeTypes[key] === req.body?.type);
    if (!type || !Number.isInteger(req.body?.size) || req.body.size < 14 || req.body.size > MAX_IMAGE_BYTES)
      return res.status(400).json({ error: "Choose a PNG, JPG, WebP or GIF up to 8 MB." });
    if (!supabase) return res.json({ mode: "local" });
    const filename = `${randomUUID()}.${type}`;
    const data = cloudResult(await supabase.storage.from("project-covers").createSignedUploadUrl(filename, { upsert: false }), "Unable to prepare the upload. Check the project-covers storage bucket.");
    res.json({ mode: "supabase", path: data.path, signedUrl: data.signedUrl });
  });
  app.post("/api/uploads/complete", auth, limit, async (req, res) => {
    if (!supabase || typeof req.body?.path !== "string" || !coverPath.test(req.body.path))
      return res.status(400).json({ error: "Invalid upload." });
    const bucket = supabase.storage.from("project-covers");
    const blob = cloudResult(await bucket.download(req.body.path), "The upload could not be verified. Please try again.");
    if (blob.size > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Choose an image or GIF up to 8 MB." });
    const bytes = Buffer.from(await blob.arrayBuffer()), type = imageType(bytes);
    if (!type || !req.body.path.endsWith(`.${type}`))
      return res.status(400).json({ error: "Choose a valid PNG, JPG, WebP or GIF image." });
    res.status(201).json({ url: bucket.getPublicUrl(req.body.path).data.publicUrl, size: bytes.length, type: mimeTypes[type] });
  });
  app.post("/api/uploads", auth, limit, (req, res, next) => {
    if (supabase) return res.status(400).json({ error: "Use the direct upload option for cloud storage." });
    if (!req.is("application/octet-stream")) return res.status(415).json({ error: "Upload an image file." });
    next();
  }, express.raw({ type: "application/octet-stream", limit: MAX_IMAGE_BYTES, inflate: false }), async (req, res, next) => {
    try {
      const type = imageType(req.body);
      if (!type) return res.status(400).json({ error: "Choose a valid PNG, JPG, WebP or GIF image." });
      const filename = `${randomUUID()}.${type}`;
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, filename), req.body, { flag: "wx", mode: 0o600 });
      res.status(201).json({ url: `/uploads/${filename}`, size: req.body.length, type: mimeTypes[type] });
    } catch (error) { next(error); }
  });
  app.use("/uploads", (req, res, next) => {
    if (!uploadPath.test(`/uploads${req.path}`)) return res.status(404).json({ error: "Image not found" });
    next();
  }, express.static(folder, { index: false, fallthrough: false, immutable: true, maxAge: "1y" }));
}
