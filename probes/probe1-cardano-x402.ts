/**
 * Probe 1: Cardano x402 first payment (≤3h budget).
 * Needs: BLOCKFROST_API_KEY_PREPROD in .env, tADA + tUSDM faucet funds.
 * Full flow: seller route returns 402 w/ cardano:preprod tUSDM quote →
 * x402 client pays → facilitator broadcasts → retry 200.
 * Stub until deps+keys arrive — marks NOT CONFIGURED (exit 2).
 */
if (!process.env.BLOCKFROST_API_KEY_PREPROD) {
  console.log("NOT CONFIGURED — add BLOCKFROST_API_KEY_PREPROD to leashed-agent/.env");
  console.log("  1. blockfrost.io → preprod project key");
  console.log("  2. tADA: docs.cardano.org/cardano-testnets/tools/faucet");
  console.log("  3. tUSDM: tusdm.moneta.global");
  console.log("  then: pnpm add @x402/cardano @x402/fetch (or per template) and re-run");
  process.exit(2);
}
throw new Error("implement the 402→pay→retry flow here once deps are installed (see discovery brief §13 Cardano section)");
