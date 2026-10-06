-- ThaiFi Wallet — users, OTP codes, encrypted key backups.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,          -- 'line' | 'email'
  provider_id TEXT NOT NULL,       -- LINE sub / lowercase email
  email TEXT,
  display_name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL,     -- epoch ms
  UNIQUE (provider, provider_id)
);
CREATE INDEX idx_users_email ON users (email);

CREATE TABLE otp_tokens (
  email TEXT PRIMARY KEY,          -- lowercase
  code_hash TEXT NOT NULL,         -- sha256 hex of the 6-digit code
  expires_at INTEGER NOT NULL,     -- epoch ms
  attempts INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,  -- requests in current window
  window_start INTEGER NOT NULL,             -- epoch ms (1h rate-limit window)
  created_at INTEGER NOT NULL
);

-- Encrypted wallet backups (BackupFile JSON v2 — ciphertext only, we never
-- see plaintext keys; restore requires the user's passkey or recovery password).
CREATE TABLE backups (
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,           -- lowercase wallet address
  backup TEXT NOT NULL,            -- BackupFile JSON (≤128KB)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, address)
);
