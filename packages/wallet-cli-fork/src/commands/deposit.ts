/** `thaifi deposit` — PromptPay QR top-up (1 THB = 1 token).
 *
 * Creates a QR order on wallet.thaifi.com and waits until the tokens are
 * minted. Auth is ThaiFi Agent Auth (no API key): the backend verifies
 * on-chain (AccountKeychain precompile) that this agent's access key belongs
 * to a wallet and credits THAT wallet — the CLI never sends a recipient.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import png from "pngjs";
import * as jsqrModule from "jsqr";
import qrcodeTerminal from "qrcode-terminal";
import { loadStore, storePath, type Store } from "../store.js";
import { CONFIG } from "../config.js";
import {
  b64uEncode,
  buildAgentAuthCredential,
  parseAgentChallenge,
} from "../agentAuth.js";
import { openBrowser } from "./fund.js";

const ORDER_PATH = "/api/agent/deposit/qr";
const MIN_THB = 6;
const MAX_THB = 10000;
/** Orders expire after 15 min, but a late payment still delivers — keep
 *  watching that long past expiry. */
const LATE_GRACE_MS = 15 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["delivered", "cancelled", "capped", "qr_error"]);

const { PNG } = png;
// NodeNext misbinds jsqr's CJS `export default` to the whole module namespace
// when importing from ESM; at runtime the namespace's `.default` IS the
// function (verified) — pick it with an explicit cast.
const jsQR = jsqrModule.default as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => import("jsqr").QRCode | null;

interface OrderResponse {
  referenceNo: string;
  total: string;
  orderNo?: string | number | null;
  image: string;
  expiresAt: number;
  error?: string;
  detail?: unknown;
}

interface OrderStatusResponse {
  referenceNo: string;
  status: string;
  total: string;
  token?: string | null;
  orderNo?: string | null;
  paidAt?: number | null;
  expiresAt?: number | null;
  txHash?: string | null;
  image?: string | null;
  error?: string;
}

const STATUS_HINTS: Record<string, string> = {
  pending: "scan the QR to pay",
  paid: "payment received — minting",
  delivering: "minting tokens",
  delivered: "tokens are in the wallet",
  cancelled: "order was cancelled",
  capped: "over the daily cap — needs operator review",
  qr_error: "QR creation failed",
};

// ---------------------------------------------------------------- HTTP + TAA

/** fetch with automatic ThaiFi Agent Auth: on a 401/403 challenge, sign with
 *  the agent access key (identity proof, no payment) and retry once. The
 *  server verifies the key against the AccountKeychain precompile. */
async function agentFetch(
  store: Store,
  url: string,
  init: { method: string; body?: string },
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res = await fetch(url, { method: init.method, headers, body: init.body });
  if (res.status === 401 || res.status === 403) {
    const challenge = parseAgentChallenge(res.headers.get("www-authenticate") ?? "");
    if (challenge) {
      const credential = await buildAgentAuthCredential(store, challenge, {
        method: init.method,
        url,
        body: init.body,
      });
      res = await fetch(url, {
        method: init.method,
        headers: {
          ...headers,
          Authorization: "ThaiFiAgent " + b64uEncode(JSON.stringify(credential)),
        },
        body: init.body,
      });
    }
  }
  return res;
}

// ------------------------------------------------------------------ QR output

/** Decode the payso QR PNG and re-render it as terminal blocks so a human
 *  watching the session can scan straight off the screen. Best-effort. */
function renderTerminalQr(dataUrl: string): void {
  try {
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const img = PNG.sync.read(Buffer.from(b64, "base64"));
    const decoded = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
    if (!decoded?.data) return;
    console.log("");
    qrcodeTerminal.generate(decoded.data, { small: true });
    console.log("");
  } catch {
    // terminal rendering is a convenience — the saved PNG always works
  }
}

/** Save the QR image to ~/.thaifi/qr-<referenceNo>.<ext> (chmod 600) so the
 *  agent has a durable path to show the user. Returns the path or null. */
function saveQrImage(dataUrl: string, referenceNo: string): string | null {
  try {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/s.exec(dataUrl);
    if (!m) return null;
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const dir = dirname(storePath);
    const file = join(dir, `qr-${referenceNo}.${ext}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(m[2], "base64"), { mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------- polling

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll the order until a terminal status (or the late-payment grace runs
 *  out). Prints STATUS=/TX= lines — machine-parsable like `PAIR_URL=`. */
async function watchOrder(
  store: Store,
  orderUrl: string,
  order: { referenceNo: string; expiresAt?: number | null },
  options: { json?: boolean },
): Promise<void> {
  const statusUrl = `${orderUrl}/${order.referenceNo}`;
  const deadline = (order.expiresAt || Date.now()) + LATE_GRACE_MS;
  let last = "";
  while (Date.now() < deadline) {
    const res = await agentFetch(store, statusUrl, { method: "GET" });
    const data = (await res.json().catch(() => null)) as OrderStatusResponse | null;
    if (res.ok && data?.status && data.status !== last) {
      last = data.status;
      if (options.json) {
        const { image, ...rest } = data;
        console.log(JSON.stringify(rest, null, 2));
      } else {
        const hint = STATUS_HINTS[data.status];
        console.log(`STATUS=${data.status}${hint ? `  (${hint})` : ""}`);
      }
      if (data.status === "delivered" && data.txHash && !options.json) {
        console.log(`TX=${data.txHash}`);
        console.log(`Explorer: https://exp.thaifi.com/tx/${data.txHash}`);
      }
      if (TERMINAL_STATUSES.has(data.status)) {
        if (data.status !== "delivered") process.exitCode = 1;
        return;
      }
    }
    await sleep(CONFIG.pollIntervalMs);
  }
  console.error("Timed out waiting for payment. Payment after expiry still delivers — resume later with:");
  console.error(`  thaifi deposit --ref ${order.referenceNo}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------- command

export interface DepositOptions {
  amount?: string;
  token?: string;
  ref?: string;
  open?: boolean;
  json?: boolean;
}

export async function deposit(options: DepositOptions = {}): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }

  // CONFIG (env THAIFI_WALLET_URL > default) — same precedence as `login`,
  // NOT store.walletUrl: a stale value would silently hit the wrong host.
  const base = (process.env.THAIFI_WALLET_URL || CONFIG.walletUrl).replace(/\/+$/, "");
  const orderUrl = base + ORDER_PATH;

  // --ref: watch an existing order (e.g. after a restart) instead of creating one.
  if (options.ref) {
    const res = await agentFetch(store, `${orderUrl}/${options.ref.trim()}`, { method: "GET" });
    const data = (await res.json().catch(() => null)) as OrderStatusResponse | null;
    if (!res.ok || !data?.referenceNo) {
      console.error(`${res.status}: ${data?.error ?? res.statusText}`);
      process.exitCode = 1;
      return;
    }
    if (!options.json) {
      console.log(`REFERENCE=${data.referenceNo}`);
      console.log(`AMOUNT=${data.total} THB -> ${data.token ?? "?"}`);
    }
    await watchOrder(store, orderUrl, data, options);
    return;
  }

  const token = (options.token ?? "THCFI").toUpperCase();
  if (token !== "THCFI" && token !== "THCOC") {
    console.error("--token must be THCFI or THCOC");
    process.exitCode = 1;
    return;
  }
  const amount = Number(options.amount);
  if (!options.amount || !Number.isFinite(amount) || amount < MIN_THB || amount > MAX_THB) {
    console.error(`--amount must be ${MIN_THB}-${MAX_THB} THB`);
    process.exitCode = 1;
    return;
  }

  const body = JSON.stringify({ amount, token });
  const res = await agentFetch(store, orderUrl, { method: "POST", body });
  const data = (await res.json().catch(() => null)) as OrderResponse | null;
  if (!res.ok || !data?.referenceNo) {
    console.error(`${res.status}: ${data?.error ?? res.statusText}`);
    if (data?.detail && typeof data.detail === "object") {
      console.error(JSON.stringify(data.detail).slice(0, 400));
    }
    process.exitCode = 1;
    return;
  }

  const file = data.image ? saveQrImage(data.image, data.referenceNo) : null;
  if (options.json) {
    const { image, ...rest } = data;
    console.log(JSON.stringify({ ...rest, qrFile: file }, null, 2));
  } else {
    console.log(`PromptPay deposit — ${data.total} THB -> ${token} (1 THB = 1 token)`);
    console.log(`Credited wallet: ${store.userAddress}`);
    if (data.image) renderTerminalQr(data.image);
    if (file) console.log(`QR_FILE=${file}`);
    console.log(`REFERENCE=${data.referenceNo}`);
    console.log(`AMOUNT=${data.total} THB -> ${token}`);
    console.log(`RESUME=thaifi deposit --ref ${data.referenceNo}`);
    console.log("");
    console.log("Scan the QR with any banking app — polling until the tokens are minted");
    console.log("(Ctrl-C to stop; resume with the RESUME command above).");
  }
  if (file && options.open !== false) {
    await openBrowser("file://" + file);
  }

  await watchOrder(store, orderUrl, data, options);
}
