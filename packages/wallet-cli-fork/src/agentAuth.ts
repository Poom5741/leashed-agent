/**
 * ThaiFi Agent Auth (TAA) — client-side helper.
 *
 * Signs a server challenge with the agent access key (P256, keychain
 * envelope binding the wallet account) so the server can verify on-chain
 * that this key is authorized (AccountKeychain, TIP-1011). Server-side
 * reference implementation: thaifi/mpp repo, src/agentAuth.ts.
 *
 * Signed hash (must match the server byte-for-byte):
 *   keccak256(tag4("thaifi-agent-auth") ‖ 0x01 ‖ keccak256(realm)[0:10]
 *             ‖ nonceBytes ‖ utf8(METHOD) ‖ utf8(pathWithQuery)
 *             ‖ sha256(body) | 0x00*32 ‖ uint64be(timestamp))
 */

import { concatHex, keccak256, sha256, slice, stringToBytes, stringToHex, toHex } from "viem";
import { Account } from "viem/tempo";
import type { Store } from "./store.js";

const AUTH_TAG = slice(keccak256(stringToBytes("thaifi-agent-auth")), 0, 4);
const ZERO_BODY_HASH = `0x${"00".repeat(32)}` as `0x${string}`;

export interface AgentChallenge {
  realm: string;
  nonce: string;
}

function b64uDecodeBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

/** base64url-encode (utf8) — used for the ThaiFiAgent credential header. */
export function b64uEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Parse a `WWW-Authenticate: ThaiFiAgent realm="…", challenge="<b64u>"`
 *  header — ThaiFi Agent Auth (identity proof, no payment). */
export function parseAgentChallenge(header: string): AgentChallenge | null {
  const m = /^ThaiFiAgent\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const params: Record<string, string> = {};
  const re = /([a-zA-Z]+)=((?:"((?:[^"\\]|\\.)*)")|[^\s,]+)/g;
  let pm: RegExpExecArray | null;
  while ((pm = re.exec(m[1]))) {
    const value = pm[3] !== undefined ? pm[3].replace(/\\(.)/g, "$1") : pm[2];
    params[pm[1].toLowerCase()] = value;
  }
  if (!params.realm || !params.challenge) return null;
  return { realm: params.realm, nonce: params.challenge };
}

export function agentAuthHash(params: {
  realm: string;
  nonce: `0x${string}`;
  method: string;
  path: string;
  body: string | null;
  ts: number;
}): `0x${string}` {
  const bodyHash =
    params.body && params.body.length > 0 ? sha256(stringToBytes(params.body)) : ZERO_BODY_HASH;
  return keccak256(
    concatHex([
      AUTH_TAG,
      "0x01",
      slice(keccak256(stringToBytes(params.realm)), 0, 10),
      params.nonce,
      stringToHex(params.method.toUpperCase()),
      stringToHex(params.path),
      bodyHash,
      toHex(BigInt(params.ts), { size: 8 }),
    ]),
  );
}

/** Sign the ThaiFiAgent challenge → the b64u credential for the retry header. */
export async function buildAgentAuthCredential(
  store: Store,
  challenge: AgentChallenge,
  req: { method: string; url: string; body?: string },
): Promise<{ v: number; ts: number; nonce: string; signature: string }> {
  if (!store.userAddress) throw new Error("Not paired.");
  const url = new URL(req.url);
  const path = url.pathname + url.search;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = toHex(b64uDecodeBytes(challenge.nonce));
  const hash = agentAuthHash({
    realm: challenge.realm,
    nonce,
    method: req.method,
    path,
    body: req.body ?? null,
    ts,
  });
  const account = Account.fromP256(store.privateKey as `0x${string}`, {
    access: store.userAddress as `0x${string}`,
  });
  const signature = await account.sign({ hash });
  return { v: 1, ts, nonce: challenge.nonce, signature };
}
