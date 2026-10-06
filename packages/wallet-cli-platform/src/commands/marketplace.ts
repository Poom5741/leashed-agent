import { loadStore } from "../store.js";
import type { HttpClient } from "./agent-deploy.js";

export interface RegisterPayload {
  endpointUrl: string;
  rail: string;
  priceBase: string;
  token: string;
  sellerAddress: string;
  nonce: string;
}

export interface MarketplaceRegisterOpts {
  endpointUrl: string;
  rail: string;
  price: number;
  token: string;
  storeDir: string;
  http: HttpClient;
  signer: (msg: Uint8Array) => Promise<Uint8Array>;
}

export interface MarketplaceLsOpts {
  storeDir: string;
  http: HttpClient;
  query?: string;
}

export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => canonicalize(v)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

export async function signRegisterPayload(
  payload: RegisterPayload,
  signer: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const msg = canonicalize(payload);
  const msgBytes = new TextEncoder().encode(msg);
  const len = msgBytes.byteLength.toString();
  const prefix = new TextEncoder().encode("\x19Ethereum signed message:\n" + len + msg);
  return signer(prefix);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return "0x" + hex;
}

export async function runMarketplaceRegister(
  opts: MarketplaceRegisterOpts,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { endpointUrl, rail, price, token, storeDir, http, signer } = opts;
  const store = loadStore(storeDir);
  if (!store.wallet) {
    return { exitCode: 1, stdout: "", stderr: "Not paired — run `thaifi login` first" };
  }

  const payload: RegisterPayload = {
    endpointUrl,
    rail,
    priceBase: Math.round(price * 1_000_000).toString(),
    token,
    sellerAddress: store.wallet.userAddress,
    nonce: Math.random().toString(16).slice(2, 10),
  };

  const sig = await signRegisterPayload(payload, signer);

  const res = await http.post("/v1/services", {
    payload,
    signature: bytesToHex(sig),
    sellerAddress: payload.sellerAddress,
  });

  if (res.status === 201) {
    const body = res.body as { id: string };
    return { exitCode: 0, stdout: body.id + "\n", stderr: "" };
  }

  return { exitCode: 1, stdout: "", stderr: `Registration failed: ${res.status}` };
}

interface ServiceEntry {
  id: string;
  endpointUrl: string;
  rail: string;
  priceBase: string;
  token: string;
}

interface ServicesBody {
  services: ServiceEntry[];
}

export async function runMarketplaceLs(
  opts: MarketplaceLsOpts,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { http, query } = opts;
  const url = query ? `/v1/services?q=${encodeURIComponent(query)}` : "/v1/services";
  const res = await http.get(url);

  if (res.status !== 200) {
    return { exitCode: 1, stdout: "", stderr: `Unexpected status: ${res.status}` };
  }

  let services: ServiceEntry[];
  try {
    if (
      !res.body ||
      typeof res.body !== "object" ||
      !("services" in res.body) ||
      !Array.isArray((res.body as ServicesBody).services)
    ) {
      throw new Error("Invalid services shape");
    }
    services = (res.body as ServicesBody).services;
  } catch {
    return { exitCode: 1, stdout: "", stderr: "Failed to parse JSON" };
  }

  const lines: string[] = ["ID".padEnd(20) + "ENDPOINT".padEnd(50) + "RAIL".padEnd(20) + "TOKEN"];

  for (const svc of services) {
    lines.push(
      [
        svc.id.padEnd(20),
        svc.endpointUrl.padEnd(50),
        svc.rail.padEnd(20),
        svc.token,
      ].join(""),
    );
  }

  return { exitCode: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
