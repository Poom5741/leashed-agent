/**
 * ThaiFi Agent Auth (TAA) — on-chain identity for agent APIs.
 *
 * An agent proves it controls an access key that is authorized ON-CHAIN
 * (AccountKeychain, TIP-1011 — the same keys the web wallet's "Authorized
 * Apps" manages). The server verifies with a single eth_call to the
 * Signature Verifier precompile (`verifyKeychain`), which returns true only
 * when the signature is valid AND the key is active (not revoked, not
 * expired). Revocation in the web wallet therefore takes effect immediately.
 *
 * Wire format (mirrors the mpp.thaifi.com reference implementation):
 *   1. Server answers 401 with
 *        WWW-Authenticate: ThaiFiAgent realm="…", challenge="<b64u>", expires="<unix>"
 *      where challenge is a stateless nonce: 4B expiry (BE) + 28B random +
 *      16B = HMAC-SHA256(secret, "auth|" + hex(payload)) truncated.
 *   2. The agent signs, with its access key (keychain envelope), the hash
 *        keccak256(tag4("thaifi-agent-auth") ‖ 0x01 ‖ fp10(realm)
 *                  ‖ nonceBytes ‖ utf8(METHOD) ‖ utf8(pathWithQuery)
 *                  ‖ sha256(body) | 0x00*32 ‖ uint64be(timestamp))
 *      and retries with
 *        Authorization: ThaiFiAgent <b64u {v, ts, nonce, signature}>
 *   3. The server recomputes the hash from ITS OWN view of the request,
 *      extracts {account, keyId} from the signature envelope (never trusts
 *      self-reported identity), then verifies on-chain.
 *
 * Private keys never leave the agent; the server only learns the
 * pseudonymous {account, keyId} pair.
 */

import { createMiddleware } from "hono/factory";
import {
  concatHex,
  createClient,
  defineChain,
  http,
  keccak256,
  sha256,
  slice,
  stringToHex,
  toHex,
  type Chain,
  type Hex,
} from "viem";
import { Actions } from "viem/tempo";
import { SignatureEnvelope } from "ox/tempo";

export const AUTH_SCHEME = "ThaiFiAgent";
/** 4-byte domain separator: keccak256("thaifi-agent-auth")[0..4). */
const AUTH_TAG = slice(keccak256(stringToHex("thaifi-agent-auth")), 0, 4);
const AUTH_VERSION = "0x01";
const ZERO_BODY_HASH = `0x${"00".repeat(32)}` as `0x${string}`;

export interface AgentIdentity {
  /** Wallet account the agent key is authorized for. */
  account: `0x${string}`;
  /** The agent's access key id (address derived from its public key). */
  keyId: `0x${string}`;
}

export interface AgentAuthOptions {
  /** Server realm — binds challenges and signatures. */
  realm: string;
  /** HMAC key for stateless challenge nonces (JWT_SECRET). */
  secretKey: string;
  rpcUrl: string;
  chainId: number;
  /** Max client clock skew (seconds). Default 120. */
  maxAgeSeconds?: number;
  /** Challenge lifetime (seconds). Default 300. */
  challengeTtlSeconds?: number;
}

// ---------------------------------------------------------------------------
// base64url + HMAC helpers (WebCrypto — runs on Workers and Node 20+)

const textEncoder = new TextEncoder();

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(message)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// ---------------------------------------------------------------------------
// Stateless challenge nonces

/** Issue a nonce: b64u(4B expiry BE ‖ 28B random ‖ 16B HMAC(payload)[0..16)). */
export async function issueChallengeNonce(
  secretKey: string,
  ttlSeconds: number,
  now: number,
): Promise<string> {
  const expires = now + ttlSeconds;
  const payload = new Uint8Array(32);
  new DataView(payload.buffer).setUint32(0, expires);
  crypto.getRandomValues(payload.subarray(4));
  const mac = await hmacSha256(secretKey, `auth|${toHex(payload)}`);
  return b64uEncode(concatBytes(payload, mac.subarray(0, 16)));
}

/** Verify a stateless nonce (HMAC + embedded expiry). */
export async function verifyChallengeNonce(
  secretKey: string,
  nonce: string,
  now: number,
): Promise<boolean> {
  let raw: Uint8Array;
  try {
    raw = b64uDecode(nonce);
  } catch {
    return false;
  }
  if (raw.length !== 48) return false;
  const payload = raw.subarray(0, 32);
  const mac = raw.subarray(32);
  const expected = (await hmacSha256(secretKey, `auth|${toHex(payload)}`)).subarray(0, 16);
  if (!constantTimeEqual(mac, expected)) return false;
  const expires = new DataView(payload.buffer, payload.byteOffset).getUint32(0);
  return expires >= now;
}

export async function issueChallengeHeader(
  opts: AgentAuthOptions,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const ttl = opts.challengeTtlSeconds ?? 300;
  const nonce = await issueChallengeNonce(opts.secretKey, ttl, now);
  return `${AUTH_SCHEME} realm="${opts.realm}", challenge="${nonce}", expires="${now + ttl}"`;
}

// ---------------------------------------------------------------------------
// Hash + verification

/**
 * The signed hash, computed identically by agent and server. `body` is the
 * raw request body (empty string / GET → 32 zero bytes).
 */
export function agentAuthHash(params: {
  realm: string;
  nonce: Hex;
  method: string;
  path: string;
  body: string | null;
  ts: number;
}): Hex {
  const bodyHash =
    params.body && params.body.length > 0 ? sha256(stringToHex(params.body)) : ZERO_BODY_HASH;
  return keccak256(
    concatHex([
      AUTH_TAG,
      AUTH_VERSION,
      slice(keccak256(stringToHex(params.realm)), 0, 10),
      params.nonce,
      stringToHex(params.method.toUpperCase()),
      stringToHex(params.path),
      bodyHash,
      toHex(BigInt(params.ts), { size: 8 }),
    ]),
  );
}

/** Extract {account, keyId} from a keychain signature envelope (off-chain,
 *  structural — the authoritative check is `verifyAgentAuth`'s eth_call). */
export function extractAgentIdentity(
  hash: Hex,
  signature: Hex,
): AgentIdentity | null {
  try {
    const envelope = SignatureEnvelope.from(signature);
    const account = SignatureEnvelope.extractAddress({
      payload: hash,
      signature: envelope,
      root: true,
    }) as `0x${string}`;
    const keyId = SignatureEnvelope.extractAddress({
      payload: hash,
      signature: envelope,
    }) as `0x${string}`;
    return { account, keyId };
  } catch {
    return null;
  }
}

export type AgentAuthResult =
  | { ok: true; identity: AgentIdentity }
  | { ok: false; reason: string };

export async function verifyAgentAuth(
  opts: AgentAuthOptions,
  ctx: {
    method: string;
    path: string;
    body: string | null;
    authorizationHeader: string | null;
  },
  now = Math.floor(Date.now() / 1000),
): Promise<AgentAuthResult> {
  const header = ctx.authorizationHeader;
  if (!header || !header.startsWith(`${AUTH_SCHEME} `)) {
    return { ok: false, reason: "Missing ThaiFiAgent credential." };
  }
  let credential: { v?: number; ts?: number; nonce?: string; signature?: string };
  try {
    credential = JSON.parse(new TextDecoder().decode(b64uDecode(header.slice(AUTH_SCHEME.length + 1))));
  } catch {
    return { ok: false, reason: "Malformed ThaiFiAgent credential." };
  }
  if (credential.v !== 1 || typeof credential.ts !== "number" || typeof credential.nonce !== "string" || typeof credential.signature !== "string") {
    return { ok: false, reason: "Malformed ThaiFiAgent credential." };
  }
  const maxAge = opts.maxAgeSeconds ?? 120;
  if (Math.abs(now - credential.ts) > maxAge) {
    return { ok: false, reason: "Stale credential — check system clock and retry." };
  }
  if (!(await verifyChallengeNonce(opts.secretKey, credential.nonce, now))) {
    return { ok: false, reason: "Invalid or expired challenge nonce." };
  }

  const nonceHex = toHex(b64uDecode(credential.nonce));
  const hash = agentAuthHash({
    realm: opts.realm,
    nonce: nonceHex,
    method: ctx.method,
    path: ctx.path,
    body: ctx.body,
    ts: credential.ts,
  });

  const identity = extractAgentIdentity(hash, credential.signature as Hex);
  if (!identity) {
    return { ok: false, reason: "Could not parse the keychain signature." };
  }

  const client = createClient({
    chain: defineChain({
      id: opts.chainId,
      name: "ThaiFi",
      nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 6 },
      rpcUrls: { default: { http: [opts.rpcUrl] } },
    }) as Chain,
    transport: http(opts.rpcUrl),
  });
  // admin: false — agent keys are regular (non-admin) access keys. Returns
  // false for unknown, revoked, or expired keys: the chain is the source of
  // truth for "is this agent authorized". Not cached — revocation in the web
  // wallet applies on the very next request.
  const active = await Actions.accessKey.verifyHash(client, {
    account: identity.account,
    hash,
    signature: credential.signature as Hex,
    admin: false,
  }).catch(() => false);

  if (!active) {
    return { ok: false, reason: "Access key is not authorized (revoked, expired, or unknown)." };
  }
  return { ok: true, identity };
}

// ---------------------------------------------------------------------------
// Hono middleware

/** Hono middleware: 401 + challenge when unauthorized, else sets `agent`.
 *  Loosely typed so it composes with any app env that declares
 *  `Variables: { agent: AgentIdentity }`. */
export function requireAgentAuth(opts: AgentAuthOptions) {
  return createMiddleware(async (c: { req: any; json: any; set: any }, next: () => Promise<void>) => {
    const url = new URL(c.req.url);
    const method = c.req.method;
    const body = method === "GET" || method === "HEAD" ? null : await c.req.text().catch(() => null);
    const result = await verifyAgentAuth(
      opts,
      {
        method,
        path: url.pathname + url.search,
        body,
        authorizationHeader: c.req.header("authorization") ?? null,
      },
    );
    if (!result.ok) {
      const challenge = await issueChallengeHeader(opts);
      return c.json(
        {
          type: "https://wallet.thaifi.com/errors/agent-auth",
          title: "Agent authentication required",
          status: 401,
          detail: result.reason,
        },
        401,
        { "www-authenticate": challenge, "cache-control": "no-store" },
      );
    }
    c.set("agent", result.identity);
    await next();
  });
}
