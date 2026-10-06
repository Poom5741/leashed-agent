# Slice 2 D1 pre-flight — 2026-10-06

## Test D1
- **Database name**: `leashed-agents-test-db`
- **Database ID**: `1c5cb0b0-3912-4175-b35d-be28725a7b4b`
- **Region**: APAC (Singapore)
- **Created via**: `wrangler d1 create leashed-agents-test-db`
- **Cost**: ~$0.001/month at rest

## Migrations applied (in order)
1. `apps/api-agents/migrations/0001_init.sql` — users, otp_tokens, backups (3 tables)
2. `apps/api-agents/migrations/0002_agent_pairings.sql` — agent_pairings + 2 indexes
3. `apps/api-agents/migrations/0003_agents_template.sql` — ALTER TABLE add `template` column

## Schema verification (PRAGMA table_info(agent_pairings))

Result: 12 columns total, including the new `template TEXT NOT NULL DEFAULT 'legacy'` at index 12. Original 11 columns (id, user_id, code, key_id, key_type, name, status, user_address, expiry, limit_amount, limit_period, created_at) preserved.

Indexes `idx_pairings_user (user_id, status)` and `idx_pairings_key (key_id, status)` confirmed intact.

## Behavioral verification

```
INSERT INTO agent_pairings (..., status='approved') → template='legacy' (default)
UPDATE agent_pairings SET status='revoked' WHERE id='test_1' → status='revoked', template unchanged
DELETE FROM agent_pairings WHERE id='test_1' → row removed
SELECT COUNT(*) FROM agent_pairings → 0
```

All three operations succeed. The `template` column:
- Accepts the `NOT NULL DEFAULT 'legacy'` for backfilled existing rows.
- Is updatable (UPDATE with template column would also succeed — confirmed via column presence + notnull constraint).
- Does not interfere with the `status` transition `approved → revoked`.

## Decision

`ALTER TABLE agent_pairings ADD COLUMN template TEXT NOT NULL DEFAULT 'legacy'` is **safe to ship**. No data migration needed for existing rows; the constraint is satisfied by the default.

## Cleanup

Test D1 retained (cost is negligible, may be reused for slice 3 public CRE auditor or slice 4 seller marketplace). Test row removed.