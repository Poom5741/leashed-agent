/** Probe 4: ThaiFi rails reachable — MPP catalog + stats + RPC. Exit 0 = pass. */
const base = "https://mpp.thaifi.com";
const rpc = "https://rpc.thaifi.com";

const catalog = await fetch(`${base}/services`, { headers: { Accept: "application/json" } });
if (!catalog.ok) throw new Error(`MPP catalog HTTP ${catalog.status}`);
const { services } = (await catalog.json()) as { services: { id: string; price?: string }[] };
const llm = services.find((s) => s.id === "qwen3.8");
if (!llm) throw new Error("qwen3.8 LLM service missing from catalog");

const stats = await fetch(`${base}/stats`);
if (!stats.ok) throw new Error(`MPP stats HTTP ${stats.status}`);
const recent = ((await stats.json()) as { recent?: unknown[] }).recent ?? [];

const block = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
});
const blockNum = ((await block.json()) as { result?: string }).result;

console.log(`catalog: ${services.length} services (llm ${llm.price}), recent payments: ${recent.length}, chain 17 block: ${blockNum}`);
if (!blockNum) throw new Error("RPC did not return block number");
console.log("PASS");
