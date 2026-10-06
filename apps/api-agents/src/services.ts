/**
 * Slice 4 — id generation for the marketplace registry.
 *
 * id = first 16 chars of keccak256(endpointUrl + "|" + sellerAddress).
 * 8 bytes / 64 bits is plenty of headroom for a hackathon-scale registry
 * (collision probability ≈ 2^-32 across 10^4 registrations).
 */

import { createHash } from "node:crypto";

export function makeServiceId(endpointUrl: string, sellerAddress: string): string {
  return createHash("sha256")
    .update(`${endpointUrl}|${sellerAddress}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}