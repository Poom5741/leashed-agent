/** Cardano-preprod x402 seller. The Worker never holds wallet signing keys. */
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactCardanoScheme as CardanoServer } from "@x402/cardano/exact/server";
import { ExactCardanoScheme as CardanoFacilitator } from "@x402/cardano/exact/facilitator";
import { getDefaultAsset, toFacilitatorCardanoSigner } from "@x402/cardano";
import type { D1Database } from "./db.js";
import { D1SettlementStore } from "./seller-settlement-store.js";

export const SELLER_NETWORK = "cardano:preprod";
export const SELLER_PRICE_BASE = "100000";
export const DEFAULT_SELLER_ADDRESS = "addr_test1qpp9lasgrs65nnxftsd209zre9ygqe3peweujljkt04hxe49ngjh2lm9snn4xp6h5hwj866wc7umsyn2rcg960735z2quxf8pp";
const VERIFIER = "leashed-seller@cardano-preprod";

export interface SellerBindings {
  DB: D1Database;
  CARDANO_SELLER_ADDRESS?: string;
  CARDANO_SELLER_MNEMONIC?: string;
  BLOCKFROST_API_KEY_PREPROD?: string;
}

function createFacilitator(env: SellerBindings): FacilitatorClient {
  const signer = toFacilitatorCardanoSigner({
    network: SELLER_NETWORK,
    // Seller's mnemonic — used by the facilitator to derive its own bech32 and
    // for settlement transactions when areFeesSponsored is off. Without this
    // bind, verify/settle throws exact_cardano_facilitator_chain_lookup_failed.
    mnemonic: env.CARDANO_SELLER_MNEMONIC,
    provider: { blockfrost: {
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: env.BLOCKFROST_API_KEY_PREPROD!,
    } },
  });
  const facilitator = new x402Facilitator().register(
    SELLER_NETWORK,
    new CardanoFacilitator(signer, { settlementStore: new D1SettlementStore(env.DB) }),
  );
  return {
    verify: facilitator.verify.bind(facilitator),
    settle: facilitator.settle.bind(facilitator),
    getSupported: async () => {
      const supported = facilitator.getSupported();
      // The core facilitator types network as string; this instance registers only preprod.
      return { ...supported, kinds: supported.kinds.map((kind) => ({ ...kind, network: SELLER_NETWORK })) };
    },
  };
}

/** Factory permits deterministic payment failure/success tests without spending funds. */
export function createReceiptSeller(facilitatorFactory = createFacilitator) {
  const seller = new Hono<{ Bindings: SellerBindings }>();

  seller.get("/seller/health", (c) => c.json({
    ok: Boolean(c.env.BLOCKFROST_API_KEY_PREPROD),
    seller: c.env.CARDANO_SELLER_ADDRESS ?? DEFAULT_SELLER_ADDRESS,
    network: SELLER_NETWORK,
    price: "0.1 tUSDM",
  }, c.env.BLOCKFROST_API_KEY_PREPROD ? 200 : 503));

  seller.post("/verify-receipt", async (c, next) => {
    if (!c.env.BLOCKFROST_API_KEY_PREPROD) {
      return c.json({ error: "seller payment provider is not configured" }, 503);
    }
    // Initialize within the request: Cloudflare bindings are unavailable at module scope.
    const resourceServer = new x402ResourceServer(facilitatorFactory(c.env))
      .register(SELLER_NETWORK, new CardanoServer());
    return paymentMiddleware({
      "POST /verify-receipt": {
        accepts: [{
          scheme: "exact",
          network: SELLER_NETWORK,
          price: { amount: SELLER_PRICE_BASE, asset: getDefaultAsset(SELLER_NETWORK, "USDM").asset },
          payTo: c.env.CARDANO_SELLER_ADDRESS ?? DEFAULT_SELLER_ADDRESS,
          maxTimeoutSeconds: 180,
        }],
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
    if (r.rail !== "thaifi-mpp" && r.rail !== "cardano-x402") problems.push("unknown rail");
    if (typeof r.amountBase !== "string" || !/^\d+$/.test(r.amountBase)) problems.push("amountBase not integer string");
    if (r.status !== "paid") problems.push("receipt not paid");
    return problems.length
      ? c.json({ valid: false, problems, verifier: VERIFIER }, 422)
      : c.json({ valid: true, checkedFields: ["id", "rail", "amountBase", "status"], verifier: VERIFIER });
  });
  return seller;
}

export default createReceiptSeller();
