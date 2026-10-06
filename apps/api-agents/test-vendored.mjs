import { readFileSync } from "node:fs";
globalThis.__LEASHED_CSL_WASM__ = new WebAssembly.Module(readFileSync("./src/vendor/lucid/csl.wasm"));
globalThis.__LEASHED_CMS_WASM__ = new WebAssembly.Module(readFileSync("./src/vendor/lucid/cms.wasm"));
// silence the original lazy-init (URL fetch) — our globals short-circuit it
const { instantiate: cslI } = await import("./src/vendor/lucid/csl.generated.js");
const { instantiate: cmsI } = await import("./src/vendor/lucid/cms.generated.js");
await Promise.all([cslI(), cmsI()]);
const { Lucid, Blockfrost } = await import("./src/vendor/lucid/web-mod.js");
const { DEFAULT_PARAMS } = await import("./src/vendor/lucid/default-params.js");
const env = {};
for (const line of readFileSync("/Users/poom-work/token2049/leashed-agent/.env","utf8").split("\n")) {
  const l = line.trim();
  if (l.includes("=") && !l.startsWith("#")) { const i = l.indexOf("="); env[l.slice(0,i)] = l.slice(i+1).replace(/^\"|\"$/g,""); }
}
const bf = new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", env.BLOCKFROST_API_KEY_PREPROD);
const provider = new Proxy(bf, { get(t, p) {
  if (p === "getProtocolParameters") return async () => DEFAULT_PARAMS;
  const v = Reflect.get(t, p);
  return typeof v === "function" ? v.bind(t) : v;
}});
const TUSDM_UNIT = "e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c90014df10745553444d";
const lucid = await Lucid.new(provider, "Preprod");
lucid.selectWalletFromSeed(env.CARDANO_CLIENT_MNEMONIC);
const tx = await lucid.newTx()
  .payToAddress("addr_test1qq4vw7u0zalt8g6v8efykt4ue9f6l0pq3mh76888u7tuk0dx7nwy7wlh8hlnwe6k72n9c32hxnd9fvxhcq03e9c8rgps9drz06", { lovelace: 1500000n, [TUSDM_UNIT]: 1000000n })
  .complete();
const signed = await tx.sign().complete();
console.log("TX HASH:", await signed.submit());
