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

// ---------- Slice 3 — agent_audit_batches ----------

export type AuditVerdict = "PASS" | "WARN" | "FAIL";

export interface AuditBatchRow {
  id: string;
  key_id: string;
  user_id: string;
  verdict: AuditVerdict;
  checked_count: number;
  total_base: number;
  other_base: number;
  problems_json: string;
  attestation_tx: string | null;
  created_at: number;
}

export interface NewAuditBatch {
  id: string;
  keyId: string;
  userId: string;
  verdict: AuditVerdict;
  checkedCount: number;
  totalBase: number;
  otherBase: number;
  problemsJson: string;
  attestationTx: string | null;
  createdAt: number;
}

export async function insertAuditBatch(db: D1Database, batch: NewAuditBatch): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_audit_batches
         (id, key_id, user_id, verdict, checked_count, total_base,
          other_base, problems_json, attestation_tx, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      batch.id,
      batch.keyId,
      batch.userId,
      batch.verdict,
      batch.checkedCount,
      batch.totalBase,
      batch.otherBase,
      batch.problemsJson,
      batch.attestationTx,
      batch.createdAt,
    )
    .run();
}

export async function latestAuditForKey(
  db: D1Database,
  userId: string,
  keyId: string,
): Promise<AuditBatchRow | null> {
  return await db
    .prepare(
      `SELECT id, key_id, user_id, verdict, checked_count, total_base,
              other_base, problems_json, attestation_tx, created_at
         FROM agent_audit_batches
         WHERE user_id = ? AND key_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
    )
    .bind(userId, keyId)
    .first<AuditBatchRow>();
}

// ---------- Slice 4 — services marketplace registry ----------

export interface ServiceRow {
  id: string;
  endpoint_url: string;
  rail: string;
  price_base: string;
  token: string;
  seller_address: string;
  signature: string;
  created_at: number;
}

export interface NewService {
  id: string;
  endpointUrl: string;
  rail: string;
  priceBase: string;
  token: string;
  sellerAddress: string;
  signature: string;
  createdAt: number;
}

export async function insertService(db: D1Database, svc: NewService): Promise<void> {
  await db
    .prepare(
      `INSERT INTO services
         (id, endpoint_url, rail, price_base, token, seller_address, signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      svc.id,
      svc.endpointUrl,
      svc.rail,
      svc.priceBase,
      svc.token,
      svc.sellerAddress,
      svc.signature,
      svc.createdAt,
    )
    .run();
}

export async function getServiceById(db: D1Database, id: string): Promise<ServiceRow | null> {
  return await db
    .prepare(
      `SELECT id, endpoint_url, rail, price_base, token, seller_address, signature, created_at
         FROM services
         WHERE id = ?`,
    )
    .bind(id)
    .first<ServiceRow>();
}

export interface ListServicesOpts {
  q?: string | null;
  limit?: number;
}

export async function listServices(
  db: D1Database,
  opts: ListServicesOpts = {},
): Promise<Pick<ServiceRow, "id" | "endpoint_url" | "rail" | "price_base" | "token">[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const q = (opts.q ?? "").trim();
  if (!q) {
    const { results } = await db
      .prepare(
        `SELECT id, endpoint_url, rail, price_base, token
           FROM services
           ORDER BY created_at DESC
           LIMIT ?`,
      )
      .bind(limit)
      .all<Pick<ServiceRow, "id" | "endpoint_url" | "rail" | "price_base" | "token">>();
    return results ?? [];
  }
  // Case-insensitive substring match against endpoint_url OR rail.
  const like = `%${q.toLowerCase()}%`;
  const { results } = await db
    .prepare(
      `SELECT id, endpoint_url, rail, price_base, token
         FROM services
         WHERE LOWER(endpoint_url) LIKE ? OR LOWER(rail) LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
    )
    .bind(like, like, limit)
    .all<Pick<ServiceRow, "id" | "endpoint_url" | "rail" | "price_base" | "token">>();
  return results ?? [];
}