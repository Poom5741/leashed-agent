// Stateless HS256 session tokens via WebCrypto — no dependencies.

const encoder = new TextEncoder();

export const SESSION_COOKIE = "thaifi_session";

export interface SessionClaims {
  sub: string; // user id
  provider: string; // 'line' | 'email'
  exp: number; // epoch seconds
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(
  secret: string,
  sub: string,
  provider: string,
  ttlSeconds: number,
): Promise<string> {
  const header = bytesToB64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims: SessionClaims = { sub, provider, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = bytesToB64url(encoder.encode(JSON.stringify(claims)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function verifySession(secret: string, token: string): Promise<SessionClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  let sigBytes: Uint8Array;
  try {
    sigBytes = b64urlToBytes(sig);
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(`${header}.${payload}`));
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as SessionClaims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
