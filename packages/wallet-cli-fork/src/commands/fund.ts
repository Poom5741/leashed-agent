/** `thaifi fund` — show the deposit address and open the web Deposit page. */

import { loadStore } from "../store.js";

export async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

export async function fund(options: { browser?: boolean } = {}): Promise<void> {
  const store = loadStore();
  if (!store?.userAddress) {
    console.error("Not paired. Run `thaifi login` first.");
    process.exitCode = 1;
    return;
  }

  console.log("Deposit address (your wallet):");
  console.log("  " + store.userAddress);
  console.log("");
  console.log("Send pathUSD, THCFI or THCOC (or any ThaiFi TIP-20 token) to this");
  console.log("address from any ThaiFi wallet. Keep some pathUSD — gas is paid in it.");
  console.log("");
  console.log("Deposit page: " + store.walletUrl + "/deposit");
  console.log("(Bridge USDC from other chains — coming soon)");

  if (options.browser !== false) {
    await openBrowser(store.walletUrl + "/deposit");
  }
}
