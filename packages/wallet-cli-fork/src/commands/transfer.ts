/** `thaifi transfer <to> <amount> [--token <symbol|address>]` — TIP-20 transfer signed by the agent access key. */

import { parseUnits } from "viem";
import { loadStore } from "../store.js";
import { createAgentClient, pickFeeToken } from "../chain.js";
import { PATHUSD, resolveToken } from "../tokens.js";

export async function transfer(
  to: string,
  amount: string,
  options: { token?: string; feeToken?: string } = {},
): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    console.error("Invalid recipient address: " + to);
    process.exitCode = 1;
    return;
  }

  let token;
  try {
    token = resolveToken(options.token ?? PATHUSD.symbol);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const userAddress = store.userAddress as `0x${string}`;
  const baseClient = createAgentClient(store);

  // Gas token: --fee-token to force one, otherwise auto-pick by balance
  // (pathUSD → THCFI → THCOC; the chain swaps it to pathUSD via FeeAMM).
  let fee = PATHUSD;
  if (options.feeToken) {
    try {
      fee = resolveToken(options.feeToken);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
  } else {
    fee = await pickFeeToken(baseClient, userAddress);
  }
  const client =
    fee.address.toLowerCase() === PATHUSD.address.toLowerCase()
      ? baseClient
      : createAgentClient(store, fee.address);

  const rawAmount = parseUnits(amount, token.decimals);

  console.log("Gas:    " + fee.symbol);
  console.log("Token:  " + token.symbol + " (" + token.address + ")");
  console.log("To:     " + to);
  console.log("Amount: " + amount + " (raw " + rawAmount + ")");

  // Signed locally by the agent access key; the on-chain spending limit is
  // enforced by the AccountKeychain precompile (SpendingLimitExceeded on overflow).
  const hash = await client.token.transfer({
    to: to as `0x${string}`,
    amount: rawAmount,
    token: token.address,
  });
  console.log("Tx:     " + hash);
  console.log("Waiting for receipt…");

  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log(
    receipt.status === "success"
      ? "✓ Transferred " + amount + " " + token.symbol + " (gas " + receipt.gasUsed + ")"
      : "✗ Transaction reverted (status " + receipt.status + ")",
  );
  if (receipt.status !== "success") process.exitCode = 1;
}
