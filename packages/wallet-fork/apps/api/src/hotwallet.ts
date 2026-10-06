import { createPublicClient, createWalletClient, defineChain, http, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Context } from "hono";
import type { Env } from "./env";

type Ctx = Context<{ Bindings: Env; Variables: { userId: string } }>;

// Hot wallet payout leg: mints THCFI/THCOC 1 THB = 1 token to a user's wallet
// once PaySolutions confirms the baht actually arrived. The hot key holds ONLY
// ISSUER_ROLE on the two tokens (never admin/pauser/burner) — if it leaks the
// attacker can mint until the 3M supply cap, which the Ledger (DEFAULT_ADMIN)
// can lower further (setSupplyCap) or counter with pause + burnFrom + revoke.

// System TIP-20 tokens (deployed via native factory 2026-09-24, enable fee
// payment via FeeAMM). Verified on chain 17 (symbol/decimals) 2026-09-24.
// Old factory tokens (0xfe76…6994 / 0xde2c…f489) deprecated — test-only.
const DEPOSIT_TOKENS = {
  THCFI: "0x20c000000000000000000000c82102FFe7064362",
  THCOC: "0x20C0000000000000000000007c24a0c628e8A940",
} as const;

export type DepositToken = keyof typeof DEPOSIT_TOKENS;

export function isDepositToken(t: string): t is DepositToken {
  return t === "THCFI" || t === "THCOC";
}

const MINT_ABI = [
  {
    name: "mintWithMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

function thaiFiChain(rpcUrl: string) {
  return defineChain({
    id: 17,
    name: "ThaiFi",
    nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 6 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "ThaiFi Explorer", url: "https://exp.thaifi.com" } },
  });
}

/**
 * Mint `total` THB worth of the order's token to the order's address.
 * Returns the tx hash. Throws on any failure — the caller reverts the order
 * to 'paid' so the gateway's callback retry re-triggers delivery.
 */
export async function mintOrder(c: Ctx, referenceNo: string): Promise<string> {
  const raw = c.env.PAYSO_HOT_KEY;
  if (!raw) throw new Error("hot wallet key not configured");
  const key = typeof raw === "string" ? raw : await raw.get();
  if (!key) throw new Error("hot wallet key empty");

  const order = await c.env.DB.prepare(
    "SELECT address, total, token FROM payso_orders WHERE reference_no = ?",
  )
    .bind(referenceNo)
    .first<{ address: string; total: string; token: string }>();
  if (!order) throw new Error("order vanished");
  if (!isDepositToken(order.token)) throw new Error(`bad token ${order.token}`);

  const account = privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`));
  const chain = thaiFiChain(c.env.THAIFI_RPC_URL || "https://rpc.thaifi.com");
  const walletClient = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) });
  const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });

  const amountRaw = parseUnits(order.total, 6); // 6 decimals: 1 THB = 1_000_000
  const memo = toHex(BigInt(referenceNo), { size: 32 }); // referenceNo is numeric ≤12 digits

  const hash = await walletClient.writeContract({
    address: DEPOSIT_TOKENS[order.token],
    abi: MINT_ABI,
    functionName: "mintWithMemo",
    args: [order.address as `0x${string}`, amountRaw, memo],
    chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`mint tx ${hash} reverted`);
  return hash;
}

/** Delivered THB total for an address in the last 24h (daily cap check). */
export async function deliveredThbLast24h(c: Ctx, address: string): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const row = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(CAST(total AS REAL)), 0) AS sum FROM payso_orders WHERE address = ? AND status = 'delivered' AND created_at > ?",
  )
    .bind(address, since)
    .first<{ sum: number }>();
  return row?.sum ?? 0;
}
