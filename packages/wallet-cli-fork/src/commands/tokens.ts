/** `thaifi tokens` — list TIP-20 tokens supported by the CLI. */

import { TOKENS } from "../tokens.js";

export async function tokens(): Promise<void> {
  const width = Math.max(...TOKENS.map((t) => t.symbol.length));
  console.log("SYMBOL".padEnd(width) + "  DECIMALS  ADDRESS");
  for (const t of TOKENS) {
    console.log(
      t.symbol.padEnd(width) + "  " + String(t.decimals).padEnd(8) + "  " + t.address,
    );
  }
}
