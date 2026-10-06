/** `thaifi logout` — remove the local agent key (revoke on the web to cut on-chain access). */

import { loadStore, clearStore, storePath } from "../store.js";

export async function logout(): Promise<void> {
  const store = loadStore();
  if (!store) {
    console.log("No local key found.");
    return;
  }
  clearStore();
  console.log("✓ Removed local key " + store.keyId + " (" + storePath + ")");
  console.log(
    "Note: the key may still be authorized on-chain — revoke it at " +
      store.walletUrl +
      " → Authorized Apps.",
  );
}
