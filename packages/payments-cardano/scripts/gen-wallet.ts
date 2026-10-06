/** Generate a Cardano preprod wallet (24-word BIP-39 + bech32 address). */
import { generateMnemonic } from "@evolution-sdk/evolution/PrivateKey";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";

const mnemonic: string = generateMnemonic(256);
const { address } = addressFromSeed(mnemonic, { networkId: 0, addressType: "Base", accountIndex: 0 });
console.log("WORDS=" + mnemonic.split(" ").length);
console.log("ADDRESS=" + (typeof address === "string" ? address : (address as { toBech32?: () => string }).toBech32?.() ?? String(address)));
console.log(mnemonic);
