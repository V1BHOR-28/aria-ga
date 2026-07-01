#!/usr/bin/env npx tsx
//
// Generate a scrypt hash for ARIA_AUTH_PASSWORD_HASH.
//
// Usage:
//   npx tsx scripts/generate-password-hash.ts
//
// Then copy the output into your .env file:
//   ARIA_AUTH_PASSWORD_HASH=scrypt:abc123...:def456...

import { hashPassword } from "../src/lib/auth-password";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: npx tsx scripts/generate-password-hash.ts <password>");
    process.exit(1);
  }
  const hash = await hashPassword(password);
  console.log(hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
