import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, hash) {
  try {
    const [salt, key] = hash.split(":");
    const actual = scryptSync(password, salt, 64),
      expected = Buffer.from(key, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
