-- Slice 2 — add template column to agent_pairings.
-- The new /agents collection is just a view over rows where
-- status in ('approved', 'revoked'). Existing rows are backfilled to 'legacy'.

ALTER TABLE agent_pairings ADD COLUMN template TEXT NOT NULL DEFAULT 'legacy';

-- status column is TEXT (no enum constraint), so 'revoked' is allowed
-- without DDL. The existing check (if any) is application-level.
-- No new index needed — idx_pairings_user (user_id, status) already
-- supports "list this user's agents" efficiently.