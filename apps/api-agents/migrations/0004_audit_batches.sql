-- Slice 3 — public CRE auditor POST /api/audit results.
-- One row per audit request; the dashboard and the SPA both query this
-- table to render the latest verdict for a keyId.

CREATE TABLE agent_audit_batches (
  id             TEXT    PRIMARY KEY,
  key_id         TEXT    NOT NULL,
  user_id        TEXT    NOT NULL,
  verdict        TEXT    NOT NULL CHECK (verdict IN ('PASS','WARN','FAIL')),
  checked_count  INTEGER NOT NULL,
  total_base     INTEGER NOT NULL DEFAULT 0,
  other_base     INTEGER NOT NULL DEFAULT 0,
  problems_json  TEXT    NOT NULL DEFAULT '[]',
  attestation_tx TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_audit_batches_key  ON agent_audit_batches(key_id,  created_at DESC);
CREATE INDEX idx_audit_batches_user ON agent_audit_batches(user_id, created_at DESC);