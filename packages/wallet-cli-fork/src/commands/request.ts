/** `thaifi request <url>` — curl-like HTTP client with MPP/x402 auto-payments. */

import { concatHex, keccak256, slice, stringToBytes } from "viem";
import { loadStore } from "../store.js";
import { createAgentClient, pickFeeToken } from "../chain.js";
import {
  b64uEncode,
  buildAgentAuthCredential,
  parseAgentChallenge,
  type AgentChallenge,
} from "../agentAuth.js";
import { CONFIG, PATHUSD_DECIMALS } from "../config.js";
import { PATHUSD, resolveToken } from "../tokens.js";

interface HttpRequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  dryRun?: boolean;
  maxSpend?: number; // USD cap for automatic payment
  feeToken?: string; // gas token override (default: auto-pick by balance)
}

interface PaymentChallenge {
  /** Recipient address for the TIP-20 transfer. */
  payTo: string;
  /** Amount to pay, in the token's base units. */
  amount: bigint;
  token?: string;
  /** TIP-20 transfer memo bound to this challenge (MPP tempo charge). */
  memo?: string;
  /** Decimals of the quoted amount, for display. */
  decimals?: number;
  /** Build the retry Authorization header after a successful payment. */
  proofHeader?: (txHash: string) => string;
}

interface MppChallenge {
  id: string;
  realm: string;
  method: string;
  intent: string;
  /** Decoded request object (payment terms). */
  request: Record<string, unknown>;
  /** Original base64url request string — echoed back byte-identical. */
  requestRaw: string;
  opaque?: string;
  expires?: string;
}

/**
 * Parse an MPP `WWW-Authenticate: Payment id="…", request="<b64u json>"` header.
 * See https://mpp.dev — Machine Payments Protocol.
 */
function b64uDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function parseMppChallenge(header: string): MppChallenge | null {
  const m = /^Payment\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const params: Record<string, string> = {};
  const re = /([a-zA-Z]+)=((?:"((?:[^"\\]|\\.)*)")|[^\s,]+)/g;
  let pm: RegExpExecArray | null;
  while ((pm = re.exec(m[1]))) {
    const value = pm[3] !== undefined ? pm[3].replace(/\\(.)/g, "$1") : pm[2];
    params[pm[1].toLowerCase()] = value;
  }
  if (!params.id || !params.request || !params.method) return null;
  let request: Record<string, unknown>;
  try {
    request = JSON.parse(b64uDecode(params.request));
  } catch {
    return null;
  }
  const challenge: MppChallenge = {
    id: params.id,
    realm: params.realm ?? "",
    method: params.method,
    intent: params.intent ?? "charge",
    request,
    requestRaw: params.request,
  };
  if (params.opaque !== undefined) challenge.opaque = params.opaque;
  if (params.expires !== undefined) challenge.expires = params.expires;
  return challenge;
}

/** MPP tempo charge → on-chain TIP-20 transfer (push mode: we broadcast, then send the hash). */
function mppTempoChallenge(challenge: MppChallenge): PaymentChallenge | null {
  const req = challenge.request as {
    amount?: string;
    currency?: string;
    recipient?: string;
    memo?: string;
    decimals?: number;
  };
  if (!req.amount || !req.recipient) return null;
  const amount = BigInt(req.amount);
  // mppx omits `decimals` for pathUSD-denominated challenges.
  const decimals = req.decimals ?? 6;
  return {
    payTo: req.recipient,
    amount,
    token: req.currency,
    memo: req.memo ?? attributionMemo(challenge.realm, challenge.id),
    decimals,
    proofHeader: (txHash: string) => {
      // Wire format: challenge.request is the base64url string, not a nested object.
      const credential = {
        challenge: {
          id: challenge.id,
          realm: challenge.realm,
          method: challenge.method,
          intent: challenge.intent,
          request: challenge.requestRaw,
          ...(challenge.opaque !== undefined && { opaque: challenge.opaque }),
          ...(challenge.expires !== undefined && { expires: challenge.expires }),
        },
        payload: { type: "hash", hash: txHash },
        source: `did:pkh:eip155:${CONFIG.chainId}:${storeAddress()}`,
      };
      return "Payment " + b64uEncode(JSON.stringify(credential));
    },
  };
}

function storeAddress(): string {
  const store = loadStore();
  return store?.userAddress ?? "0x0";
}

const fingerprint = (value: string) => slice(keccak256(stringToBytes(value)), 0, 10);

/**
 * MPP attribution memo (bytes32) per mppx Attribution encoding:
 * tag = keccak256("mpp")[0..4], version 0x01, serverId = realm fingerprint,
 * clientId = CLI fingerprint, nonce = keccak256(challengeId)[0..7 bytes].
 * Required by servers that don't pre-assign a memo to the challenge.
 */
function attributionMemo(realm: string, challengeId: string): `0x${string}` {
  const tag = slice(keccak256(stringToBytes("mpp")), 0, 4);
  return concatHex([
    tag,
    "0x01",
    fingerprint(realm),
    fingerprint("thaifi-wallet-cli"),
    slice(keccak256(stringToBytes(challengeId)), 0, 7),
  ]);
}

/**
 * Extract a payment challenge from a 402 response.
 * MPP (`WWW-Authenticate: Payment …`) first; legacy x402 JSON body as fallback.
 */
async function parseChallenge(
  res: Response,
  defaultToken: string,
): Promise<PaymentChallenge | null> {
  const wwwAuth = res.headers.get("www-authenticate");
  if (wwwAuth) {
    const mpp = parseMppChallenge(wwwAuth);
    if (mpp && mpp.method === "tempo" && mpp.intent === "charge") {
      const parsed = mppTempoChallenge(mpp);
      if (parsed) return parsed;
    }
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const accept = body?.accepts?.[0] ?? body?.payments?.[0] ?? body;
  const payTo = accept?.payTo ?? accept?.payToAddress ?? accept?.recipient;
  const maxAmount = accept?.maxAmountRequired ?? accept?.amount ?? accept?.price;
  if (!payTo || maxAmount === undefined) return null;
  const amount =
    typeof maxAmount === "string" && /^\d+$/.test(maxAmount)
      ? BigInt(maxAmount)
      : BigInt(Math.round(Number(maxAmount) * 10 ** PATHUSD_DECIMALS));
  return {
    payTo: payTo as string,
    amount,
    token: accept?.asset ?? accept?.token ?? defaultToken,
    decimals: PATHUSD_DECIMALS,
    proofHeader: (txHash: string) =>
      Buffer.from(
        JSON.stringify({
          scheme: "exact",
          txHash,
          from: storeAddress(),
          to: payTo,
          amount: "0x" + amount.toString(16),
          token: accept?.asset ?? accept?.token ?? defaultToken,
        }),
      ).toString("base64"),
  };
}

/** If the JSON response carries a generated image, save it and print a summary. */
async function maybeSaveImage(text: string): Promise<string | null> {
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const b64 = body?.image_base64 ?? body?.data?.image_base64;
  if (typeof b64 !== "string" || b64.length < 1000) return null;
  const id = (body?.id ?? body?.data?.id ?? "image").toString().replace(/[^\w-]/g, "");
  const mime = (body?.mime_type ?? body?.data?.mime_type ?? "image/png").toString();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const file = `image-${id}.${ext}`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, Buffer.from(b64, "base64"));
  const { width, height, time } = body;
  return `${file} (${mime}${width ? `, ${width}x${height}` : ""}${time?.total ? `, ${time.total}s` : ""})`;
}

export async function request(url: string, options: HttpRequestOptions): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    console.log("→ " + options.method + " " + url);
    for (const [k, v] of Object.entries(options.headers)) console.log("   " + k + ": " + v);
    if (options.body) console.log("   body: " + options.body);
    return;
  }

  let res = await fetch(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });

  // 401/403 → ThaiFi Agent Auth: sign the challenge with the agent access key
  // (identity proof, no payment) → retry once. The server verifies the key
  // against the AccountKeychain precompile.
  if (res.status === 401 || res.status === 403) {
    const agentChallenge = parseAgentChallenge(res.headers.get("www-authenticate") ?? "");
    if (agentChallenge) {
      console.log("401 — signing agent auth challenge …");
      const credential = await buildAgentAuthCredential(store, agentChallenge, {
        method: options.method,
        url,
        body: options.body,
      });
      res = await fetch(url, {
        method: options.method,
        headers: {
          ...options.headers,
          Authorization: "ThaiFiAgent " + b64uEncode(JSON.stringify(credential)),
        },
        body: options.body,
      });
    }
  }

  // 402 → pay on-chain (TIP-20 transfer from the agent's spend limit) → retry once.
  if (res.status === 402) {
    const challenge = await parseChallenge(res, CONFIG.pathUsd);
    if (!challenge) {
      console.error("402 Payment Required — could not parse the challenge.");
      console.error((await res.text()).slice(0, 400));
      process.exitCode = 1;
      return;
    }
    const usd = Number(challenge.amount) / 10 ** (challenge.decimals ?? PATHUSD_DECIMALS);
    if (options.maxSpend !== undefined && usd > options.maxSpend) {
      console.error(
        "Payment of $" + usd + " exceeds --max-spend $" + options.maxSpend + " — aborting.",
      );
      process.exitCode = 1;
      return;
    }
    const token = (challenge.token ?? CONFIG.pathUsd) as `0x${string}`;

    console.log("402 — paying $" + usd + " to " + challenge.payTo + " …");
    // Gas token: --fee-token to force one, otherwise auto-pick by balance
    // (pathUSD → THCFI → THCOC; the chain swaps it to pathUSD via FeeAMM).
    const baseClient = createAgentClient(store);
    let fee = PATHUSD;
    if (options.feeToken) {
      try {
        fee = resolveToken(options.feeToken);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
    } else {
      fee = await pickFeeToken(baseClient, store.userAddress as `0x${string}`);
    }
    const client =
      fee.address.toLowerCase() === PATHUSD.address.toLowerCase()
        ? baseClient
        : createAgentClient(store, fee.address);
    console.log("Gas:   " + fee.symbol);
    const hash = await client.token.transfer({
      to: challenge.payTo as `0x${string}`,
      amount: challenge.amount,
      token,
      ...(challenge.memo ? { memo: challenge.memo as `0x${string}` } : {}),
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      console.error("Payment transaction reverted: " + hash);
      process.exitCode = 1;
      return;
    }
    console.log("Paid. Tx: " + hash);

    res = await fetch(url, {
      method: options.method,
      headers: { ...options.headers, Authorization: challenge.proofHeader!(hash) },
      body: options.body,
    });
  }

  console.log("← HTTP " + res.status);
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("json")) {
    try {
      const saved = await maybeSaveImage(text);
      if (saved) {
        console.log("Saved image → " + saved);
        const body = JSON.parse(text);
        for (const k of ["status", "id", "width", "height", "mime_type", "font"]) {
          if (body[k] !== undefined) console.log("  " + k + ": " + body[k]);
        }
      } else {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      }
    } catch {
      console.log(text.slice(0, 4000));
    }
  } else {
    console.log(text.slice(0, 4000));
  }
  if (!res.ok) process.exitCode = 1;
}
