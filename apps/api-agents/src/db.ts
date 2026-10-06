/**
 * D1 query helpers for the /agents collection.
 *
 * The schema is the upstream wallet's table (apps/api-agents/migrations/0002_agent_pairings.sql)
 * plus the slice-2 `template` column (0003). Slice 2 reuses this table as the
 * single source of truth for "what agents does this user have?" queries.
 */

export interface AgentRow {
  id: string;
  user_id: string | null;
  key_id: string;
  key_type: string;
  name: string;
  status: "pending" | "approved" | "rejected" | "claimed" | "expired" | "revoked";
  user_address: string | null;
  expiry: number | null;
  limit_amount: string | null;
  limit_period: number | null;
  template: string;
  created_at: number;
}

export interface NewAgent {
  id: string;
  userId: string;
  userAddress: string | null;
  keyId: string;
  template: string;
  leash: { limitAmount: string; limitPeriod: number; expiry: number };
}

export interface D1Prepared {
  bind: (...args: unknown[]) => D1Prepared;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number; last_row_id: number | null } }>;
}

export interface D1Database {
  prepare: (sql: string) => D1Prepared;
}

export async function insertAgent(db: D1Database, agent: NewAgent): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_pairings
         (id, user_id, code, key_id, key_type, name, status, user_address,
           expiry, limit_amount, limit_period, template, created_at)
       VALUES (?, ?, '', ?, 'p256', ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      agent.id,
      agent.userId,
      agent.keyId,
      "", // name (machine hostname — set later by CLI approve step)
      agent.userAddress,
      agent.leash.expiry,
      agent.leash.limitAmount,
      agent.leash.limitPeriod,
      agent.template,
      Date.now(),
    )
    .run();
}

export async function listAgentsByUser(db: D1Database, userId: string): Promise<AgentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, key_id, key_type, name, status, user_address,
              expiry, limit_amount, limit_period, template, created_at
         FROM agent_pairings
         WHERE user_id = ? AND status IN ('approved', 'pending', 'revoked')
         ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<AgentRow>();
  return results ?? [];
}

export async function getAgentByKeyId(
  db: D1Database,
  userId: string,
  keyId: string,
): Promise<AgentRow | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, key_id, key_type, name, status, user_address,
              expiry, limit_amount, limit_period, template, created_at
         FROM agent_pairings
         WHERE key_id = ? AND user_id = ?`,
    )
    .bind(keyId, userId)
    .first<AgentRow>();
  return row;
}

export async function revokeAgent(
  db: D1Database,
  userId: string,
  keyId: string,
): Promise<{ changed: boolean; status: AgentRow["status"] | null }> {
  const result = await db
    .prepare(
      `UPDATE agent_pairings
          SET status = 'revoked'
          WHERE key_id = ? AND user_id = ? AND status != 'revoked'`,
    )
    .bind(keyId, userId)
    .run();
  if (result.meta.changes > 0) {
    return { changed: true, status: "revoked" };
  }
  const current = await db
    .prepare(`SELECT status FROM agent_pairings WHERE key_id = ? AND user_id = ?`)
    .bind(keyId, userId)
    .first<{ status: AgentRow["status"] }>();
  return { changed: false, status: current?.status ?? null };
}