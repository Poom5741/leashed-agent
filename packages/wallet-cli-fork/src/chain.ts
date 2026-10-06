/** ThaiFi chain client (viem/tempo) for the agent access key. */

import { http, defineChain, type Chain as ViemChain } from "viem";
import { createClient, tempoActions, type Client } from "viem/tempo";
import { Actions, Account, Addresses, Abis, Chain as TempoChains } from "viem/tempo";
import { CONFIG } from "./config.js";
import type { Store } from "./store.js";
import { PATHUSD, TOKENS, type TokenInfo } from "./tokens.js";

/** ThaiFi chain 17 — clone of the tempo chain definition (formatters/serializers) with our ids. */
export const thaiFi = defineChain({
  ...(TempoChains.mainnet as unknown as ViemChain),
  id: CONFIG.chainId,
  name: "ThaiFi",
  network: "thaifi",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 6 },
  rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
  blockExplorers: {
    default: { name: "ThaiFi Explorer", url: "https://exp.thaifi.com" },
  },
});

/** The account keychain precompile (access keys, TIP-1011). */
export const accountKeychain = Addresses.accountKeychain;

export function createAgentClient(store: Store, feeToken?: `0x${string}`) {
  if (!store.userAddress) throw new Error("Not paired yet — run `thaifi login` first.");
  const account = Account.fromP256(store.privateKey as `0x${string}`, {
    access: store.userAddress as `0x${string}`,
  });
  return createClient({
    account,
    chain: thaiFi,
    feeToken: feeToken ?? (CONFIG.pathUsd as `0x${string}`),
    transport: http(store.rpcUrl),
  }).extend(tempoActions());
}

/** Min balance that makes a token usable as gas (~0.01; gas ≈ 0.003/tx). */
const GAS_MIN_UNITS = 10_000n;

/**
 * Pick the gas token by balance: pathUSD → THCFI → THCOC. The chain swaps the
 * chosen token to the validator's pathUSD through the protocol FeeAMM.
 */
export async function pickFeeToken(
  client: AgentClient,
  userAddress: `0x${string}`,
): Promise<TokenInfo> {
  for (const t of TOKENS) {
    const bal = await tokenBalance(client, t.address, userAddress).catch(() => 0n);
    if (bal >= GAS_MIN_UNITS) return t;
  }
  return PATHUSD;
}

export type AgentClient = ReturnType<typeof createAgentClient>;

export async function tokenBalance(
  client: AgentClient,
  token: `0x${string}`,
  address: `0x${string}`,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [address],
  });
}

/** Remaining spend allowance of the agent key (raw units of `token`). */
export async function remainingLimit(
  client: AgentClient,
  userAddress: `0x${string}`,
  keyId: `0x${string}`,
  token: `0x${string}` = CONFIG.pathUsd,
): Promise<bigint | null> {
  const res = await client.accessKey.getRemainingLimit({
    account: userAddress,
    accessKey: keyId,
    token,
  });
  return res.remaining;
}

export { Actions };
