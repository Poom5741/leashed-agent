import type { CardanoSettlementClaim, CardanoSettlementClaimResult, CardanoSettlementStore } from "@x402/cardano";
import type { D1Database } from "./db.js";

/** Atomic shared claims prevent Worker replicas from broadcasting the same transaction twice. */
export class D1SettlementStore implements CardanoSettlementStore {
  constructor(private readonly db: D1Database) {}

  async claimSettlement(claim: CardanoSettlementClaim): Promise<CardanoSettlementClaimResult> {
    // This seller supports only ordinary address-to-address transfers, not Masumi quotes.
    if (claim.termsDigest) return "terms-conflict";
    const result = await this.db.prepare(
      "INSERT INTO seller_settlements (tx_hash, owner_token, status) VALUES (?, ?, 'in-flight') ON CONFLICT(tx_hash) DO NOTHING",
    ).bind(claim.txHash, claim.ownerToken).run();
    if (result.meta.changes === 1) return "fresh";
    const row = await this.db.prepare("SELECT status FROM seller_settlements WHERE tx_hash = ?")
      .bind(claim.txHash).first<{ status: "in-flight" | "submitted" | "rejected" }>();
    // A concurrent release can remove the row between INSERT and SELECT. Fail closed;
    // a later request may acquire a fresh claim.
    return row?.status ?? "in-flight";
  }

  async markSubmitted(txHash: string, ownerToken: string): Promise<void> {
    await this.mark(txHash, ownerToken, "submitted");
  }
  async markRejected(txHash: string, ownerToken: string): Promise<void> {
    await this.mark(txHash, ownerToken, "rejected");
  }
  private async mark(txHash: string, ownerToken: string, status: string): Promise<void> {
    await this.db.prepare("UPDATE seller_settlements SET status = ? WHERE tx_hash = ? AND owner_token = ? AND status = 'in-flight'")
      .bind(status, txHash, ownerToken).run();
  }
  async releaseClaim(txHash: string, ownerToken: string): Promise<void> {
    await this.db.prepare("DELETE FROM seller_settlements WHERE tx_hash = ? AND owner_token = ? AND status = 'in-flight'")
      .bind(txHash, ownerToken).run();
  }
}
