// ARIA — Password hashing (node:crypto scrypt, nodejs runtime only)
//
// This module uses node:crypto and must only be imported from route
// handlers with runtime = "nodejs". NEVER import from middleware.ts.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Hash a password using scrypt.
 *
 * Usage:
 *   npx tsx scripts/generate-password-hash.ts "your-password"
 *
 * Or programmatically:
 *   const hash = await hashPassword("your-password");
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/**
 * Verify a password against the stored hash. Uses timingSafeEqual to
 * prevent timing attacks.
 */
export function verifyPassword(
  password: string,
  storedHash: string
): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, hash] = parts;
    const testHash = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hash, "hex");
    return (
      storedBuf.length === testHash.length &&
      timingSafeEqual(storedBuf, testHash)
    );
  } catch {
    return false;
  }
}
