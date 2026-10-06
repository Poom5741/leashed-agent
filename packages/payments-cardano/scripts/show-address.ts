/** Derive the preprod bech32 address from CARDANO_CLIENT_MNEMONIC in ../../.env */
import { readFileSync } from "node:fs";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";
import * as E from "@evolution-sdk/evolution";

const env = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
const mnemonic = env.match(/^CARDANO_CLIENT_MNEMONIC=(.+)$/m)?.[1]?.trim();
if (!mnemonic) throw new Error("CARDANO_CLIENT_MNEMONIC missing in leashed-agent/.env");
const { address } = addressFromSeed(mnemonic, { networkId: 0, addressType: "Base", accountIndex: 0 });
const bech32 = (E.Address as unknown as { toBech32: (a: unknown) => string }).toBech32(address);
console.log(bech32);
