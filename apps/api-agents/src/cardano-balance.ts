/**
 * Cardano preprod balance proxy — public read-only endpoint that calls
 * Blockfrost preprod with the BLOCKFROST_API_KEY_PREPROD secret. The
 * wallet SPA hits this proxy instead of Blockfrost directly so the API
 * key never ships in the browser bundle.
 *
 * tUSDM on Cardano preprod. Same policy + asset name the faucet proxies
 * (Moneta's CIP-99 grant). One claim = 1_000_000_000 atomic = 10 tUSDM.
 */
import { Hono } from "hono";
import type { Bindings } from "./index.js";

const TUSDM_POLICY = "e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c9";
const TUSDM_ASSET = "0014df10745553444d";
const BLOCKFROST_PREPROD = "https://cardano-preprod.blockfrost.io/api/v0";

const app = new Hono<{ Bindings: Bindings & { BLOCKFROST_PROJECT_ID?: string } }>();

app.get("/v1/cardano/balance/:address", async (c) => {
  const address = c.req.param("address");
  if (!/^addr_test1[02-9ac-hj-np-z]{53,}$/.test(address)) {
    return c.json({ ok: false, error: "invalid Cardano preprod address" }, 400);
  }
  const apiKey = c.env.BLOCKFROST_PROJECT_ID;
  if (!apiKey) {
    return c.json({ ok: false, error: "Blockfrost key not configured" }, 503);
  }
  const headers = { project_id: apiKey };

  // Run the two Blockfrost calls in parallel. Blockfrost preprod path:
  //   GET /addresses/{addr}             → amount array (lovelace + tokens)
  //   GET /addresses/{addr}/total       → received/sent sums + tx_count
  const [addrRes, totalRes] = await Promise.all([
    fetch(`${BLOCKFROST_PREPROD}/addresses/${address}`, { headers }),
    fetch(`${BLOCKFROST_PREPROD}/addresses/${address}/total`, { headers }),
  ]);

  let lovelace = 0;
  let txCount = 0;
  let assetCount = 0;
  let tusdmAmount = 0;

  if (addrRes.status === 404) {
    // Address has never received a tx — Blockfrost returns 404 for these.
  } else if (!addrRes.ok) {
    return c.json({ ok: false, error: `blockfrost addr ${addrRes.status}` }, 502);
  } else {
    const data = (await addrRes.json()) as {
      amount?: Array<{ unit: string; quantity: string }>;
    };
    const amounts = data.amount ?? [];
    assetCount = amounts.length;
    for (const a of amounts) {
      if (a.unit === "lovelace") lovelace = Number(a.quantity);
      if (a.unit === TUSDM_POLICY + TUSDM_ASSET) tusdmAmount = Number(a.quantity);
    }
  }

  if (totalRes.ok) {
    const totals = (await totalRes.json()) as { tx_count?: number };
    txCount = totals.tx_count ?? 0;
  }

  return c.json({
    ok: true,
    address,
    network: "preprod",
    lovelace: Math.max(lovelace, 0),
    txCount,
    assetCount,
    tokens: tusdmAmount > 0
      ? [{ policy: TUSDM_POLICY, asset: TUSDM_ASSET, symbol: "tUSDM", amount: tusdmAmount }]
      : [],
  });
});

export default app;