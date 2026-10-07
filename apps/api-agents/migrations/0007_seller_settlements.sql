CREATE TABLE seller_settlements (
  tx_hash TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in-flight', 'submitted', 'rejected'))
);
