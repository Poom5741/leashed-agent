/**
 * Quick wallet gen — generates a real preprod testnet bech32 address +
 * a 24-word BIP-39 mnemonic, using the BIP-39 English wordlist and a
 * fresh 256-bit entropy. The mnemonic is recoverable in any Cardano
 * wallet (Lace/Eternl in preprod mode).
 */
import { Lucid } from "lucid-cardano";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const WORDS = readFileSync("/tmp/bip39-english.txt", "utf8").trim().split("\n");

// BIP-39 mnemonic from raw entropy (256 bits → 24 words).
function entropyToMnemonic(entropy) {
  if (entropy.length !== 32) throw new Error("need 32 bytes");
  // checksum = SHA256(entropy)[0:8 bits]
  const hash = createHash("sha256").update(entropy).digest();
  const bits = [...entropy].map(b => b.toString(2).padStart(8, "0")).join("") +
               hash[0].toString(2).padStart(8, "0").slice(0, 8);
  // 24 × 11 bits
  const out = [];
  for (let i = 0; i < 24; i++) {
    out.push(WORDS[parseInt(bits.slice(i * 11, (i + 1) * 11), 2)]);
  }
  return out.join(" ");
}

const entropy = randomBytes(32);
const mnemonic = entropyToMnemonic(entropy);

const luc = await Lucid.new(undefined, "Preprod");
luc.selectWalletFromSeed(mnemonic);
const addr = await luc.wallet.address();

console.log("MNEMONIC=" + mnemonic);
console.log("ADDRESS=" + addr);

writeFileSync("/tmp/test-wallet.json", JSON.stringify({
  address: addr,
  mnemonic,
  entropyHex: entropy.toString("hex"),
  generated_at: new Date().toISOString(),
}, null, 2));
console.log("Saved to /tmp/test-wallet.json");