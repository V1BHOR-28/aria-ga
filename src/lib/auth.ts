// ARIA — Session cookie utilities (Web Crypto, edge-safe)
//
// HMAC-signed session cookies. Uses Web Crypto API so it works in both
// the edge runtime (proxy) and nodejs runtime (login route).
//
// This module must NOT import node:crypto, Buffer, or any Node-only module.

const COOKIE_NAME = "aria-session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getAuthSecret(): string {
  const secret = process.env.ARIA_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ARIA_AUTH_SECRET environment variable is required in production"
      );
    }
    return "dev-only-secret-change-in-production";
  }
  return secret;
}

let cachedKey: CryptoKey | null = null;
let cachedSecret = "";

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getAuthSecret();
  if (cachedKey && cachedSecret === secret) return cachedKey;
  const encoder = new TextEncoder();
  cachedKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  cachedSecret = secret;
  return cachedKey;
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

// base64url encode (no Buffer — uses btoa which works in edge runtime)
function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// base64url decode (no Buffer — uses atob which works in edge runtime)
function base64urlDecode(str: string): string {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

/**
 * Create a signed session cookie value.
 * Format: base64url(payload).hex(signature)
 * Payload: { exp: number } (expiry timestamp in ms)
 */
export async function createSessionCookie(): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const encoded = base64urlEncode(payload);
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded)
  );
  return `${encoded}.${bufferToHex(sig)}`;
}

/**
 * Verify a session cookie value. Returns true if the signature is valid
 * and the session hasn't expired.
 */
export async function verifySessionCookie(
  cookieValue: string | undefined
): Promise<boolean> {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;
  const [encoded, sigHex] = parts;

  try {
    const key = await getHmacKey();
    const sigBytes = hexToBuffer(sigHex);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(encoded)
    );
    if (!valid) return false;

    // Check expiry
    const payload = JSON.parse(base64urlDecode(encoded));
    if (typeof payload.exp !== "number") return false;
    return Date.now() < payload.exp;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * Extract and verify the session cookie from a Request's Cookie header.
 * Returns true if authenticated, false otherwise.
 */
export async function isAuthenticated(
  cookieHeader: string | null
): Promise<boolean> {
  if (!cookieHeader) return false;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  return verifySessionCookie(cookies[COOKIE_NAME]);
}
