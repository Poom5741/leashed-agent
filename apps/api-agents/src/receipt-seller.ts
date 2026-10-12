/**
 * Multi-chain x402 seller (slice 5): Cardano preprod + Solana devnet + Tempo
 * Moderato testnet. The Worker never holds buyer keys; the facilitator signs
 * only settlement transactions from its own configured seller key material.
 *
 * Networks are additive: one x402Facilitator + one x402ResourceServer, with a
 * scheme registered per configured CAIP-2 network. See docs/slice5-multichain-spec.md.
 */
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactCardanoScheme as CardanoServer } from "@x402/cardano/exact/server";
import { ExactCardanoScheme as CardanoFacilitator } from "@x402/cardano/exact/facilitator";
import { getDefaultAsset as getDefaultCardanoAsset, toFacilitatorCardanoSigner } from "@x402/cardano";
import { ExactSvmScheme as SvmServer } from "@x402/svm/exact/server";
import { ExactSvmScheme as SvmFacilitator } from "@x402/svm/exact/facilitator";
import { getDefaultAsset as getDefaultSvmAsset, toFacilitatorSvmSigner, SOLANA_DEVNET_CAIP2 as SOLANA_DEVNET } from "@x402/svm";
import { ExactEvmScheme as EvmServer } from "@x402/evm/exact/server";
import { ExactEvmScheme as EvmFacilitator } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { createWalletClient, defineChain, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { D1Database } from "./db.js";
import { D1SettlementStore } from "./seller-settlement-store.js";
import {
  paymentNetworks,
  isSolanaKeypairB64,
  isHexKey,
  DEFAULT_TEMPO_USDC,
  DEFAULT_TEMPO_RPC,
  TEMPO_TESTNET_CAIP2,
  type SellerEnv,
} from "./chains.js";

export { SOLANA_DEVNET_CAIP2, TEMPO_TESTNET_CAIP2, paymentNetworks } from "./chains.js";

export const SELLER_NETWORK = "cardano:preprod";
export const SELLER_PRICE_BASE = "100000";
export const DEFAULT_SELLER_ADDRESS = "addr_test1qpp9lasgrs65nnxftsd209zre9ygqe3peweujljkt04hxe49ngjh2lm9snn4xp6h5hwj866wc7umsyn2rcg960735z2quxf8pp";
const VERIFIER = "leashed-seller";

export interface SellerBindings extends SellerEnv {
  DB: D1Database;
}

interface AcceptEntry {
  scheme: "exact";
  network: `${string}:${string}`;
  price: { amount: string; asset: string };
  payTo: string;
  maxTimeoutSeconds: number;
}

const TEMPO_CHAIN = defineChain({
  id: 42431,
  name: "Tempo Moderato",
  nativeCurrency: { name: "Tempo USD", symbol: "USD", decimals: 6 },
  rpcUrls: { default: { http: [DEFAULT_TEMPO_RPC] } },
});

/**
 * Facilitator signer for Tempo. toFacilitatorEvmSigner needs the full
 * FacilitatorEvmSigner surface (readContract, verifyTypedData,
 * waitForTransactionReceipt, getCode), so the wallet client is extended with
 * public actions on the same chain.
 */
function createTempoWalletClient(account: ReturnType<typeof privateKeyToAccount>, env: SellerEnv) {
  const transport = http(env.TEMPO_RPC_URL ?? DEFAULT_TEMPO_RPC);
  return createWalletClient({ account, chain: TEMPO_CHAIN, transport }).extend(publicActions);
}

/** Registers every network whose seller key material is present in env. */
async function createFacilitator(env: SellerBindings): Promise<FacilitatorClient> {
  const facilitator = new x402Facilitator();

  if (env.BLOCKFROST_API_KEY_PREPROD) {
    const signer = toFacilitatorCardanoSigner({
      network: SELLER_NETWORK,
      // Seller's mnemonic — used by the facilitator to derive its own bech32 and
      // for settlement transactions when areFeesSponsored is off. Without this
      // bind, verify/settle throws exact_cardano_facilitator_chain_lookup_failed.
      mnemonic: env.CARDANO_SELLER_MNEMONIC,
      provider: { blockfrost: {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: env.BLOCKFROST_API_KEY_PREPROD,
      } },
    });
    facilitator.register(
      SELLER_NETWORK,
      new CardanoFacilitator(signer, { settlementStore: new D1SettlementStore(env.DB) }),
    );
  }

  if (isSolanaKeypairB64(env.SOLANA_SELLER_KEYPAIR)) {
    const bytes = Uint8Array.from(atob(env.SOLANA_SELLER_KEYPAIR), (c) => c.charCodeAt(0));
    const keypair = await createKeyPairSignerFromBytes(bytes);
    facilitator.register(SOLANA_DEVNET, new SvmFacilitator(toFacilitatorSvmSigner(keypair)));
  }

  if (isHexKey(env.TEMPO_SELLER_KEY)) {
    const account = privateKeyToAccount(env.TEMPO_SELLER_KEY);
    const client = createTempoWalletClient(account, env);
    // viem's verifyTypedData param union is structurally wider than the
    // FacilitatorEvmSigner call shape; runtime-compatible at this boundary.
    const signer = toFacilitatorEvmSigner(
      client as unknown as Parameters<typeof toFacilitatorEvmSigner>[0],
    );
    facilitator.register(TEMPO_TESTNET_CAIP2, new EvmFacilitator(signer));
  }

  return {
    verify: facilitator.verify.bind(facilitator),
    settle: facilitator.settle.bind(facilitator),
    getSupported: async () =>
      facilitator.getSupported() as unknown as Awaited<ReturnType<FacilitatorClient["getSupported"]>>,
  };
}

/** Factory permits deterministic payment failure/success tests without spending funds. */
export function createReceiptSeller(facilitatorFactory: (env: SellerBindings) => Promise<FacilitatorClient> = createFacilitator) {
  const seller = new Hono<{ Bindings: SellerBindings }>();

  seller.get("/seller/health", (c) => {
    const networks = paymentNetworks(c.env);
    const anyConfigured = networks.some((n) => n.configured);
    return c.json({
      ok: anyConfigured,
      networks: networks.map(({ network, label, configured, payTo }) => ({ network, label, configured, payTo })),
    }, anyConfigured ? 200 : 503);
  });

  seller.post("/verify-receipt", async (c, next) => {
    const env = c.env;
    if (!env.BLOCKFROST_API_KEY_PREPROD && !isSolanaKeypairB64(env.SOLANA_SELLER_KEYPAIR) && !isHexKey(env.TEMPO_SELLER_KEY)) {
      return c.json({ error: "seller payment provider is not configured" }, 503);
    }
    // Initialize within the request: Cloudflare bindings are unavailable at module scope.
    const facilitator = await facilitatorFactory(env);
    const resourceServer = new x402ResourceServer(facilitator);

    const accepts: AcceptEntry[] = [];
    if (env.BLOCKFROST_API_KEY_PREPROD) {
      resourceServer.register(SELLER_NETWORK, new CardanoServer());
      accepts.push({
        scheme: "exact",
        network: SELLER_NETWORK,
        price: { amount: SELLER_PRICE_BASE, asset: getDefaultCardanoAsset(SELLER_NETWORK, "USDM").asset },
        payTo: env.CARDANO_SELLER_ADDRESS ?? DEFAULT_SELLER_ADDRESS,
        maxTimeoutSeconds: 180,
      });
    }
    if (isSolanaKeypairB64(env.SOLANA_SELLER_KEYPAIR)) {
      resourceServer.register(SOLANA_DEVNET, new SvmServer());
      // Derive the seller address from the keypair when no explicit override.
      const bytes = Uint8Array.from(atob(env.SOLANA_SELLER_KEYPAIR), (c) => c.charCodeAt(0));
      const sellerAddress = env.SOLANA_SELLER_ADDRESS ?? (await createKeyPairSignerFromBytes(bytes)).address;
      accepts.push({
        scheme: "exact",
        network: SOLANA_DEVNET,
        price: { amount: SELLER_PRICE_BASE, asset: getDefaultSvmAsset(SOLANA_DEVNET, "USDC").asset },
        payTo: sellerAddress,
        maxTimeoutSeconds: 180,
      });
      // PYUSD on Solana: mint supplied via env (no PayPal-issued devnet mint exists).
      if (env.SOLANA_PYUSD_MINT) {
        accepts.push({
          scheme: "exact",
          network: SOLANA_DEVNET,
          price: { amount: SELLER_PRICE_BASE, asset: env.SOLANA_PYUSD_MINT },
          payTo: sellerAddress,
          maxTimeoutSeconds: 180,
        });
      }
    }
    if (isHexKey(env.TEMPO_SELLER_KEY)) {
      resourceServer.register(TEMPO_TESTNET_CAIP2, new EvmServer());
      const tempoPayTo = env.TEMPO_SELLER_ADDRESS ?? privateKeyToAccount(env.TEMPO_SELLER_KEY).address;
      accepts.push({
        scheme: "exact",
        network: TEMPO_TESTNET_CAIP2,
        price: { amount: SELLER_PRICE_BASE, asset: (env.TEMPO_USDC_ADDRESS ?? DEFAULT_TEMPO_USDC) as `0x${string}` },
        payTo: tempoPayTo,
        maxTimeoutSeconds: 180,
      });
      // PYUSD on Tempo: TIP-20 address supplied via env until officially published.
      if (env.PYUSD_ADDRESS) {
        accepts.push({
          scheme: "exact",
          network: TEMPO_TESTNET_CAIP2,
          price: { amount: SELLER_PRICE_BASE, asset: env.PYUSD_ADDRESS as `0x${string}` },
          payTo: tempoPayTo,
          maxTimeoutSeconds: 180,
        });
      }
    }

    return paymentMiddleware({
      "POST /verify-receipt": {
        accepts,
        description: "Validate receipt fields (id, rail, amountBase, status)",
        mimeType: "application/json",
      },
    }, resourceServer)(c, next);
  }, async (c) => {
    let body: unknown;
    try { body = await c.req.json(); }
    catch { return c.json({ valid: false, problems: ["invalid JSON"], verifier: VERIFIER }, 400); }
    const r = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown> : {};
    const problems: string[] = [];
    if (typeof r.id !== "string" || !r.id) problems.push("id missing");
    if (r.rail !== "thaifi-mpp" && r.rail !== "cardano-x402" && r.rail !== "solana-x402" && r.rail !== "tempo-x402") problems.push("unknown rail");
    if (typeof r.amountBase !== "string" || !/^\d+$/.test(r.amountBase)) problems.push("amountBase not integer string");
    if (r.status !== "paid") problems.push("receipt not paid");
    return problems.length
      ? c.json({ valid: false, problems, verifier: VERIFIER }, 422)
      : c.json({ valid: true, checkedFields: ["id", "rail", "amountBase", "status"], verifier: VERIFIER });
  });
  return seller;
}

export default createReceiptSeller();
