/** Probe 3: NOWNodes endpoint reachable. Needs NOWNODES_API_KEY in .env. */
if (!process.env.NOWNODES_API_KEY) {
  console.log("NOT CONFIGURED — add NOWNODES_API_KEY to leashed-agent/.env (nownodes.io, free tier)");
  process.exit(2);
}
const url = `https://eth.nownodes.io`;
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "api-key": process.env.NOWNODES_API_KEY ?? "" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
});
if (!res.ok) throw new Error(`NOWNodes HTTP ${res.status}`);
const block = ((await res.json()) as { result?: string }).result;
console.log(`NOWNodes eth endpoint block: ${block}`);
if (!block) throw new Error("no block number returned");
console.log("PASS");
