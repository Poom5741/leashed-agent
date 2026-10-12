import { test } from "node:test";
import assert from "node:assert/strict";
import type { FacilitatorClient } from "@x402/core/server";
import { createKeyPairSignerFromPrivateKeyBytes, getBase58Codec } from "@solana/kit";
import { randomBytes } from "node:crypto";
import { createReceiptSeller, SELLER_NETWORK } from "../src/receipt-seller.js";
import { isHexKey, isSolanaKeypairB64, SOLANA_DEVNET_CAIP2, TEMPO_TESTNET_CAIP2 } from "../src/chains.js";
import app from "../src/index.js";

const TEMPO_KEY = "0x" + "ab".repeat(32);

const solanaEnv: Record<string, string> = {};
{
  const seed = randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed);
  secretKey.set(getBase58Codec().encode(signer.address), 32);
  solanaEnv.SOLANA_SELLER_KEYPAIR = Buffer.from(secretKey).toString("base64");
  solanaEnv.SOLANA_SELLER_ADDRESS = signer.address;
}

function stubFacilitator(networks: string[]): FacilitatorClient {
  return {
    getSupported: async () => ({
      kinds: networks.map((network) => ({ x402Version: 2, scheme: "exact", network: network as `${string}:${string}` })),
      extensions: [],
      signers: {},
    }),
    verify: async () => ({ isValid: true }),
    settle: async () => ({ success: true, transaction: "b".repeat(64), network: networks[0]! as `${string}:${string}` }),
  };
}

const ALL_NETWORKS = [SELLER_NETWORK, SOLANA_DEVNET_CAIP2, TEMPO_TESTNET_CAIP2];
const receipt = { id: "mc-1", rail: "solana-x402", amountBase: "100000", status: "paid" };

function makeSeller(env: Record<string, string>, networks: string[] = ALL_NETWORKS) {
  const seller = createReceiptSeller(async () => stubFacilitator(networks));
  return seller.request("https://seller.example/verify-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(receipt),
  }, env);
}

function decodeRequired(res: Response) {
  assert.equal(res.status, 402);
  return JSON.parse(Buffer.from(res.headers.get("payment-required")!, "base64").toString()) as {
    accepts: Array<{ network: string; asset: string; payTo: string; amount: string }>;
  };
}

test("402 accepts one entry per configured network with correct assets", async () => {
  const res = await makeSeller({
    BLOCKFROST_API_KEY_PREPROD: "test",
    ...solanaEnv,
    TEMPO_SELLER_KEY: TEMPO_KEY,
  });
  const body = decodeRequired(res);
  const nets = body.accepts.map((a) => a.network);
  assert.deepEqual(nets.sort(), ALL_NETWORKS.slice().sort());
  const solana = body.accepts.find((a) => a.network === SOLANA_DEVNET_CAIP2)!;
  assert.equal(solana.asset, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // USDC devnet mint
  assert.equal(solana.amount, "100000");
  assert.equal(solana.payTo, solanaEnv.SOLANA_SELLER_ADDRESS); // derived from keypair
  const tempo = body.accepts.find((a) => a.network === TEMPO_TESTNET_CAIP2)!;
  assert.match(tempo.asset, /^0x[0-9a-fA-F]{40}$/);
  assert.match(tempo.payTo, /^0x[0-9a-fA-F]{40}$/);
  const cardano = body.accepts.find((a) => a.network === SELLER_NETWORK)!;
  assert.match(cardano.payTo, /^addr_test1/);
});

test("unconfigured networks are omitted from accepts", async () => {
  const res = await makeSeller({ BLOCKFROST_API_KEY_PREPROD: "test" }, [SELLER_NETWORK]);
  const body = decodeRequired(res);
  assert.deepEqual(body.accepts.map((a) => a.network), [SELLER_NETWORK]);
});

test("no configured network returns 503 and hides the route", async () => {
  const res = await makeSeller({}, []);
  assert.equal(res.status, 503);
});

test("seller/health lists every network with configured flag", async () => {
  const seller = createReceiptSeller(async () => stubFacilitator([]));
  const res = await seller.request("https://seller.example/seller/health", {}, {
    DB: {} as never,
    ...solanaEnv,
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean; networks: Array<{ network: string; configured: boolean }> };
  assert.equal(body.ok, true);
  const byNet = new Map(body.networks.map((n) => [n.network, n.configured]));
  assert.equal(byNet.get(SELLER_NETWORK), false);
  assert.equal(byNet.get(SOLANA_DEVNET_CAIP2), true);
  assert.equal(byNet.get(TEMPO_TESTNET_CAIP2), false);
});

test("GET /api/chains exposes multi-chain discovery", async () => {
  const res = await app.request("/api/chains", {}, {
    DB: {} as never,
    ...solanaEnv,
    TEMPO_SELLER_KEY: TEMPO_KEY,
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { chains: Array<{ network: string; family: string; configured: boolean }> };
  const byNet = new Map(body.chains.map((c) => [c.network, c]));
  assert.equal(byNet.get(SOLANA_DEVNET_CAIP2)!.family, "svm");
  assert.equal(byNet.get(SOLANA_DEVNET_CAIP2)!.configured, true);
  assert.equal(byNet.get(TEMPO_TESTNET_CAIP2)!.family, "evm");
  assert.equal(byNet.get(TEMPO_TESTNET_CAIP2)!.configured, true);
  assert.equal(byNet.get(SELLER_NETWORK)!.configured, false);
});

test("PYUSD assets appear only when their env addresses are set", async () => {
  const { paymentNetworks } = await import("../src/chains.js");
  const base = { SOLANA_SELLER_KEYPAIR: solanaEnv.SOLANA_SELLER_KEYPAIR, TEMPO_SELLER_KEY: TEMPO_KEY };
  assert.deepEqual(paymentNetworks(base).map((n) => n.assets), [[], [], []]);
  const withPyusd = paymentNetworks({ ...base, SOLANA_PYUSD_MINT: "PYUSD111111111111111111111111111111111111111", PYUSD_ADDRESS: "0x" + "22".repeat(20) });
  assert.deepEqual(withPyusd.find((n) => n.family === "svm")!.assets, ["PYUSD"]);
  assert.deepEqual(withPyusd.find((n) => n.family === "evm")!.assets, ["PYUSD"]);
});

test("accepts carries a PYUSD entry on Tempo when PYUSD_ADDRESS is set", async () => {
  const res = await makeSeller({ TEMPO_SELLER_KEY: TEMPO_KEY, PYUSD_ADDRESS: "0x" + "33".repeat(20), TEMPO_SELLER_ADDRESS: "0x" + "44".repeat(20) }, [TEMPO_TESTNET_CAIP2]);
  const body = decodeRequired(res);
  const tempoEntries = body.accepts.filter((a) => a.network === TEMPO_TESTNET_CAIP2);
  assert.equal(tempoEntries.length, 2); // USDC + PYUSD
  assert.match(tempoEntries[1]!.asset, /^0x33/);
});

test("key format validators reject garbage without throwing", () => {
  assert.equal(isHexKey("0x1234"), false);
  assert.equal(isHexKey(undefined), false);
  assert.equal(isSolanaKeypairB64("not-base64!!!"), false);
  assert.equal(isSolanaKeypairB64(Buffer.alloc(32).toString("base64")), false);
  assert.equal(isSolanaKeypairB64(solanaEnv.SOLANA_SELLER_KEYPAIR), true);
  assert.equal(isHexKey(TEMPO_KEY), true);
});
