-- Faucet rate-limit claims: one 25-THCFI on-chain transfer per address / 24 h.
-- Balances are NEVER stored here — the chain is the source of truth.
CREATE TABLE IF NOT EXISTS faucet_claims (
  address TEXT PRIMARY KEY,
  last_claimed_at INTEGER NOT NULL,
  total_claimed INTEGER NOT NULL DEFAULT 0
);
