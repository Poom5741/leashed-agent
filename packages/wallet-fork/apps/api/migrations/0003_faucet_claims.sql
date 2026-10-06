-- Faucet claims: one mint per address per 24 h (judges / new users).
CREATE TABLE IF NOT EXISTS faucet_claims (
  address TEXT PRIMARY KEY,
  last_claimed_at INTEGER NOT NULL,
  total_claimed INTEGER NOT NULL DEFAULT 0
);
