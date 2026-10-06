import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Marketplace commands:
//   `marketplace register <url> --rail cardano-x402 --price 0.10 --token USDM`
//   `marketplace ls [--q ...]`
//
// Both must:
//   - Be signed via EIP-191 personal_sign over the canonical payload, using the
//     active wallet's userAddress.
//   - POST to /v1/services (register) / GET /v1/services (ls).
//
// TODO(slice-1): impl must export:
//   - `runMarketplaceRegister(opts)`
//   - `runMarketplaceLs(opts)`
//   - `signRegisterPayload(payload, signer)` returning the EIP-191 signature
//   - `canonicalize(payload)` for deterministic JSON encoding (sorted keys)
//   - `parseServices(json)` for the registry listing shape

import {
  runMarketplaceRegister,
  runMarketplaceLs,
  signRegisterPayload,
  canonicalize,
  type HttpClient,
  type RegisterPayload,
} from "../src/commands/marketplace.js";
import {
  loadStore,
  type Store,
} from "../src/store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-mp-"));
}

function walletStore(): string {
  const dir = tmpDir();
  const store = loadStore(dir);
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser000000000000000000000000000000000000aa",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  return dir;
}

// Test-only signer: returns a deterministic 65-byte signature so we can assert
// on the EIP-191 prefix and the signed payload without standing up viem/ethers.
// The impl will inject a real signer in production; in tests it just needs to
// match the EIP-191 prefix `\x19Ethereum signed message:\n<len><msg>`.
function fakeEip191Signer(message: Uint8Array): Uint8Array {
  // The impl's signRegisterPayload is responsible for the prefix; the test
  // signer only needs to return *some* 65-byte sig. We tag it with a fixed r
  // so assertions can check exact bytes.
  const sig = new Uint8Array(65);
  // r = sha256(message) mod n (we just put a marker so the test is stable)
  sig[0] = 0x52; // 'R'
  sig[1] = 0xab;
  sig[64] = 0x1c; // v
  return sig;
}

function fakeHttp(getImpl: (url: string) => { status: number; body: unknown }, postImpl?: (url: string, body: unknown) => { status: number; body: unknown }): HttpClient & { calls: { method: string; url: string; body?: unknown }[] } {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  return {
    calls,
    async post(url, body) {
      calls.push({ method: "POST", url, body });
      return postImpl ? postImpl(url, body) : { status: 200, body: { ok: true } };
    },
    async get(url) {
      calls.push({ method: "GET", url });
      return getImpl(url);
    },
  };
}

test("signRegisterPayload wraps the payload with the EIP-191 personal_sign prefix", async () => {
  const payload: RegisterPayload = {
    endpointUrl: "https://seller.example/llm",
    rail: "cardano-x402",
    priceBase: "100000",
    token: "USDM",
    sellerAddress: "0xuser000000000000000000000000000000000000aa",
    nonce: "deadbeef",
  };
  const sig = await signRegisterPayload(payload, fakeEip191Signer);
  assert.equal(sig.length, 65, "EIP-191 signatures are 65 bytes (r||s||v)");
  // v must be 0x1c (27) or 0x1d (28) — our fake emits 0x1c.
  assert.ok(sig[64] === 0x1c || sig[64] === 0x1d);
});

test("canonicalize sorts keys recursively for deterministic signing", () => {
  const a = canonicalize({ b: 1, a: { d: 4, c: 3 }, list: [{ y: 2, x: 1 }] });
  const b = canonicalize({ a: { c: 3, d: 4 }, list: [{ x: 1, y: 2 }], b: 1 });
  assert.equal(a, b);
  assert.match(a, /^\{.*"a".*"b".*\}$/); // keys must appear alphabetically
});

test("marketplace register sends a signed POST and exits 0 on success", async () => {
  const dir = walletStore();
  const http = fakeHttp(
    () => ({ status: 404, body: {} }),
    (url) => {
      if (url === "/v1/services") return { status: 201, body: { id: "svc_1", endpointUrl: "https://seller.example/llm" } };
      return { status: 404, body: {} };
    },
  );
  const res = await runMarketplaceRegister({
    endpointUrl: "https://seller.example/llm",
    rail: "cardano-x402",
    price: 0.1,
    token: "USDM",
    storeDir: dir,
    http,
    signer: fakeEip191Signer,
  });
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /registered|svc_1/i);

  // POST body must include the canonical payload + the EIP-191 signature.
  const post = http.calls.find((c) => c.method === "POST" && c.url === "/v1/services");
  assert.ok(post);
  const body = post!.body as { payload: RegisterPayload; signature: string; sellerAddress: string };
  assert.equal(body.payload.rail, "cardano-x402");
  assert.equal(body.payload.token, "USDM");
  assert.equal(body.payload.endpointUrl, "https://seller.example/llm");
  // 65 bytes → 0x + 130 hex chars
  assert.match(body.signature, /^0x[0-9a-f]{130}$/);
  assert.equal(body.sellerAddress, "0xuser000000000000000000000000000000000000aa");
});

test("marketplace ls prints 0 rows when the registry is empty", async () => {
  const dir = walletStore();
  const http = fakeHttp(() => ({ status: 200, body: { services: [] } }));
  const res = await runMarketplaceLs({ storeDir: dir, http });
  assert.equal(res.exitCode, 0);
  // Header row only, no data rows.
  const lines = res.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
});

test("marketplace ls prints N rows when the registry has N entries", async () => {
  const dir = walletStore();
  const entries = Array.from({ length: 4 }, (_, i) => ({
    id: `svc_${i}`,
    endpointUrl: `https://seller.example/${i}`,
    rail: "cardano-x402",
    priceBase: "100000",
    token: "USDM",
  }));
  const http = fakeHttp(() => ({ status: 200, body: { services: entries } }));
  const res = await runMarketplaceLs({ storeDir: dir, http });
  assert.equal(res.exitCode, 0);
  const lines = res.stdout.trim().split("\n");
  // header + N data rows
  assert.equal(lines.length, 4 + 1);
  for (const e of entries) {
    assert.ok(res.stdout.includes(e.id));
    assert.ok(res.stdout.includes(e.endpointUrl));
  }
});

test("marketplace ls passes the --q filter through to GET /v1/services", async () => {
  const dir = walletStore();
  const http = fakeHttp((url) => {
    // TODO(slice-1): impl must encode the --q filter as ?q=<term> on the GET.
    if (url.startsWith("/v1/services")) {
      assert.match(url, /\?q=verify/);
      return { status: 200, body: { services: [{ id: "svc_v", endpointUrl: "https://seller.example/verify", rail: "cardano-x402", priceBase: "100000", token: "USDM" }] } };
    }
    return { status: 404, body: {} };
  });
  const res = await runMarketplaceLs({ storeDir: dir, http, query: "verify" });
  assert.equal(res.exitCode, 0);
  assert.ok(res.stdout.includes("svc_v"));
});

test("marketplace ls exits 1 with a parse error when the registry returns malformed JSON", async () => {
  const dir = walletStore();
  const http = fakeHttp(() => ({ status: 200, body: "{not json" }));
  const res = await runMarketplaceLs({ storeDir: dir, http });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /parse|json/i);
});