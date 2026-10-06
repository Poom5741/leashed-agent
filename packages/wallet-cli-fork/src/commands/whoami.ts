/** `thaifi whoami` — account, agent key, balances and remaining spend limits. */

import { loadStore } from "../store.js";
import { createAgentClient, tokenBalance, remainingLimit } from "../chain.js";
import { TOKENS, PATHUSD } from "../tokens.js";

const fmt = (raw: bigint, decimals = 6): string =>
  (Number(raw) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: decimals });

export async function whoami(): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }
  const client = createAgentClient(store);
  const userAddress = store.userAddress as `0x${string}`;
  const keyId = store.keyId as `0x${string}`;

  const [balances, remaining] = await Promise.all([
    Promise.all(
      TOKENS.map((t) =>
        tokenBalance(client, t.address, userAddress)
          .then((raw) => [t.symbol, raw] as const)
          .catch(() => [t.symbol, null] as const),
      ),
    ),
    Promise.all(
      TOKENS.map((t) =>
        remainingLimit(client, userAddress, keyId, t.address)
          .then((raw) => [t.symbol, raw] as const)
          .catch(() => [t.symbol, null] as const),
      ),
    ),
  ]);

  console.log("Account:     " + userAddress);
  console.log("Agent key:   " + keyId);
  const width = Math.max(...TOKENS.map((t) => t.symbol.length));
  for (const [symbol, raw] of balances) {
    const prefix = symbol === PATHUSD.symbol ? "$" : "";
    console.log(
      (symbol + ":").padEnd(width + 1) + " " + (raw === null ? "(read failed)" : prefix + fmt(raw)),
    );
  }

  if (remaining.every(([, raw]) => raw === null)) {
    console.log("Limit left:  (unavailable — key may have been revoked)");
  } else {
    const parts = remaining
      .filter(([, raw]) => raw !== null)
      .map(([symbol, raw]) => `${symbol} ${fmt(raw as bigint)}`)
      .join(", ");
    console.log(
      "Limit left:  " + parts + " (pathUSD cap " + Number(store.limitAmount ?? 0) / 10 ** 6 + ")",
    );
  }
  console.log(
    "Key expires: " + (store.keyExpiry ? new Date(store.keyExpiry * 1000).toISOString() : "never"),
  );
  console.log("Wallet:      " + store.walletUrl);
}
