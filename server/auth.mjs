import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
/** Constant-time check that doesn't block the event loop while hashing. */
export async function verifyPassword(password, hash) {
  try {
    const [salt, key] = hash.split(":");
    const actual = await derive(password, salt, 64),
      expected = Buffer.from(key, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
/** Short fingerprint of the configured hash: changing the password signs out old admin sessions. */
export const hashFingerprint = (hash) => createHash("sha256").update(String(hash || "")).digest("hex").slice(0, 16);
