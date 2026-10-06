-- Agent CLI pairings (ThaiFi Wallet CLI ↔ web wallet).
-- D1 only tracks the pairing session + metadata; the authorization itself
-- lives on-chain (AccountKeychain precompile, TIP-1011).

CREATE TABLE agent_pairings (
  id TEXT PRIMARY KEY,             -- pairing id (uuid, unguessable)
  user_id TEXT,                    -- set on approve
  code TEXT NOT NULL,              -- 6-digit human code
  key_id TEXT NOT NULL,            -- agent key address (= access key id)
  key_type TEXT NOT NULL DEFAULT 'p256',
  name TEXT NOT NULL,              -- machine hostname
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|claimed|expired
  user_address TEXT,               -- wallet address of the approving user
  expiry INTEGER,                  -- access key expiry (epoch seconds)
  limit_amount TEXT,               -- spending limit, raw units (decimal string)
  limit_period INTEGER,            -- period in seconds
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_pairings_user ON agent_pairings (user_id, status);
CREATE INDEX idx_pairings_key ON agent_pairings (key_id, status);
