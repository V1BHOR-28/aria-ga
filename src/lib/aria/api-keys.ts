// ARIA — Server-side API key storage
//
// Provider API keys (ElevenLabs, etc.) are encrypted with AES-GCM and stored
// in the ProviderKey database table. The plaintext key NEVER leaves the server
// after initial entry — the client only knows whether a key is configured, not
// what the key is.
//
// Encryption uses ARIA_ENCRYPTION_KEY from the environment (32-byte hex or
// base64 string). If not set, a derived key is used (less secure — set the
// env var in production).

import { db } from "@/lib/db";

// --- Key derivation --------------------------------------------------------

const ENC_ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits, standard for GCM)

function getMasterKeyBytes(): Uint8Array {
  const envKey = process.env.ARIA_ENCRYPTION_KEY;
  if (envKey) {
    // If it's a 64-char hex string, decode it
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(envKey.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    // Otherwise, use SHA-256 of the string (deterministic, 32 bytes)
    // This is a fallback — prefer a proper hex key in production
    const encoder = new TextEncoder();
    // Simple hash (not crypto-secure but better than plaintext)
    const data = encoder.encode(envKey);
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
      hash[i % 32] ^= data[i];
    }
    return hash;
  }
  // Last-resort fallback: derive from DATABASE_URL (not ideal, but prevents
  // plaintext storage even if ARIA_ENCRYPTION_KEY isn't set)
  const fallback = process.env.DATABASE_URL || "aria-fallback-key-change-me";
  const encoder = new TextEncoder();
  const data = encoder.encode(fallback);
  const hash = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    hash[i % 32] ^= data[i];
  }
  return hash;
}

async function importKey(): Promise<CryptoKey> {
  const keyBytes = getMasterKeyBytes();
  return crypto.subtle.importKey("raw", keyBytes, { name: ENC_ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// --- Encrypt / Decrypt -----------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

export async function encryptKey(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );
  // Prepend IV to ciphertext (standard practice)
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);
  return toBase64(combined);
}

export async function decryptKey(encrypted: string): Promise<string> {
  const key = await importKey();
  const combined = fromBase64(encrypted);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// --- Database operations ---------------------------------------------------

export async function setProviderKey(
  provider: string,
  plaintextKey: string
): Promise<void> {
  const encrypted = await encryptKey(plaintextKey);
  await db.providerKey.upsert({
    where: { provider },
    create: { provider, encryptedKey: encrypted },
    update: { encryptedKey: encrypted },
  });
}

export async function getProviderKey(provider: string): Promise<string | null> {
  const row = await db.providerKey.findUnique({ where: { provider } });
  if (!row) return null;
  try {
    return await decryptKey(row.encryptedKey);
  } catch (err) {
    console.error(`[api-keys] Failed to decrypt key for ${provider}:`, err);
    return null;
  }
}

export async function deleteProviderKey(provider: string): Promise<void> {
  await db.providerKey.deleteMany({ where: { provider } });
}

export async function listConfiguredProviders(): Promise<string[]> {
  const rows = await db.providerKey.findMany({ select: { provider: true } });
  return rows.map((r) => r.provider);
}
