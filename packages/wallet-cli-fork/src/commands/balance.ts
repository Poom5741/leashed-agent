/** `thaifi balance [--token <symbol|address>]` — TIP-20 balances of the paired account. */

import { loadStore } from "../store.js";
import { createAgentClient } from "../chain.js";
import { TOKENS, resolveToken, type TokenInfo } from "../tokens.js";

const BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const SYMBOL_ABI = [
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export async function balance(options: { token?: string } = {}): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }

  let tokens: readonly TokenInfo[];
  if (options.token) {
    try {
      tokens = [resolveToken(options.token)];
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
  } else {
    tokens = TOKENS;
  }

  const client = createAgentClient(store);
  const userAddress = store.userAddress as `0x${string}`;

  const rows = await Promise.all(
    tokens.map(async (t) => {
      const raw = await client.readContract({
        address: t.address,
        abi: BALANCE_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      });
      // Registry tokens already know their symbol; custom ones read it from the chain.
      const symbol = t.symbol === "TOKEN"
        ? await client
            .readContract({ address: t.address, abi: SYMBOL_ABI, functionName: "symbol" })
            .catch(() => "TOKEN")
        : t.symbol;
      const value = Number(raw) / 10 ** t.decimals;
      return { symbol, value, token: t };
    }),
  );

  const width = Math.max(...rows.map((r) => r.symbol.length));
  for (const r of rows) {
    console.log(
      r.symbol.padEnd(width) + "  " + r.value.toLocaleString("en-US", { maximumFractionDigits: r.token.decimals }),
    );
  }
  console.log("(" + store.userAddress + ")");
}
