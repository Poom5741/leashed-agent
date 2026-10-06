/** Live M2 evidence: pay the seller 0.10 tUSDM on cardano:preprod to verify a receipt. */
import { readFileSync } from "node:fs";
import { createCardanoPayer } from "../src/client.js";

const env = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1];
const SELLER = process.env.SELLER_URL ?? "http://localhost:4020";

const payer = createCardanoPayer({
  mnemonic: get("CARDANO_CLIENT_MNEMONIC")!,
  provider: { blockfrost: { baseUrl: "https://cardano-preprod.blockfrost.io/api/v0", projectId: get("BLOCKFROST_API_KEY_PREPROD")! } },
});

// The receipt we made on the ThaiFi rail — now verified via the Cardano rail.
const receipt = JSON.parse(readFileSync("/tmp/leashed-test-ledger.json", "utf8"))[0];

console.log("unpaid probe (expect 402):");
const probe = await fetch(`${SELLER}/verify-receipt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(receipt),
});
console.log("  HTTP", probe.status);

console.log("paying 0.10 tUSDM …");
const paid = await payer.payFetch(`${SELLER}/verify-receipt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(receipt),
});
console.log("  HTTP", paid.response.status);
console.log("  settlement:", JSON.stringify(paid.settlement));
console.log("  body:", paid.body.slice(0, 300));
if (paid.settlement?.transaction) {
  const r = payer.toReceipt({ url: SELLER, serviceId: "verify-receipt", purpose: "verify poster receipt", amountBase: "100000", txHash: paid.settlement.transaction });
  console.log("  receipt:", JSON.stringify(r, null, 1));
}
