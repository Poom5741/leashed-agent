/**
 * leashed-agent seller — our own x402 service on Cardano preprod.
 *
 * Sells receipt verification: agents (any rail) pay 0.10 tUSDM per call to
 * have a leashed Receipt validated (schema + policy verdict) by an
 * independent service. Core functionality for the oversight story — the
 * Cardano rail carries real product value, not a bolt-on.
 */
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactCardanoScheme as ExactCardanoServer } from "@x402/cardano/exact/server";
import { ExactCardanoScheme as ExactCardanoFacilitator } from "@x402/cardano/exact/facilitator";
import {
  toFacilitatorCardanoSigner,
  getDefaultAsset,
} from "@x402/cardano";
import * as Evolution from "@evolution-sdk/evolution";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";

const PORT = Number(process.env.SELLER_PORT ?? 4020);
const NETWORK = "cardano:preprod" as const;
const PRICE_BASE = "100000"; // 0.10 tUSDM (6 decimals)

const mnemonic = process.env.CARDANO_SELLER_MNEMONIC;
if (!mnemonic) throw new Error("CARDANO_SELLER_MNEMONIC missing");
const blockfrostKey = process.env.BLOCKFROST_API_KEY_PREPROD;
if (!blockfrostKey) throw new Error("BLOCKFROST_API_KEY_PREPROD missing");

const cardanoAddr = addressFromSeed(mnemonic, { networkId: 0, addressType: "Base", accountIndex: 0 }).address;
const sellerAddress = (Evolution.Address as unknown as { toBech32: (a: unknown) => string }).toBech32(cardanoAddr);
const usdm = getDefaultAsset(NETWORK, "USDM")!;

const provider = {
  blockfrost: {
    baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
    projectId: blockfrostKey,
  },
};

// In-process facilitator: verifies the client's signed tx and broadcasts it.
// Provider-only (no mnemonic): it never holds funds.
const facilitatorSigner = toFacilitatorCardanoSigner({ network: NETWORK, provider });
const coreFacilitator = new x402Facilitator().register(NETWORK, new ExactCardanoFacilitator(facilitatorSigner));

// x402Facilitator's getSupported() is sync; the resource server expects the
// async FacilitatorClient shape — adapt it.
const facilitatorClient = {
  verify: coreFacilitator.verify.bind(coreFacilitator),
  settle: coreFacilitator.settle.bind(coreFacilitator),
  getSupported: async () => coreFacilitator.getSupported() as never,
};

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactCardanoServer(),
);

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      "POST /verify-receipt": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            price: { amount: PRICE_BASE, asset: usdm.asset },
            payTo: sellerAddress,
            maxTimeoutSeconds: 180,
          },
        ],
      },
    },
    resourceServer,
  ),
);

// The paid product: verify a receipt.
app.post("/verify-receipt", (req, res) => {
  const r = req.body as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof r?.id !== "string" || !r.id) problems.push("id missing");
  if (r?.rail !== "thaifi-mpp" && r?.rail !== "cardano-x402") problems.push("unknown rail");
  if (typeof r?.amountBase !== "string" || !/^\d+$/.test(r.amountBase ?? "")) problems.push("amountBase not integer string");
  if (r?.status !== "paid") problems.push("receipt not paid");
  if (problems.length === 0) {
    res.json({
      valid: true,
      checkedFields: ["id", "rail", "amountBase", "status"],
      verifier: "leashed-seller@cardano-preprod",
    });
  } else {
    res.status(422).json({ valid: false, problems, verifier: "leashed-seller@cardano-preprod" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, seller: sellerAddress, price: `${Number(PRICE_BASE) / 1e6} tUSDM` }));

app.listen(PORT, () => console.log(`leashed-seller on :${PORT} — ${sellerAddress} — 0.10 tUSDM/verify`));
