// TIDX (Tempo chain indexer) query client — ThaiFi instance.
// GET {TIDX_URL}/query?chainId=17&engine=clickhouse&sql=...

import type { Env } from "./env";

export interface TidxResult {
  ok: boolean;
  columns: string[];
  rows: unknown[][];
  error?: string;
}

export async function tidxQuery(env: Env, sql: string): Promise<TidxResult> {
  const url = new URL("/query", env.TIDX_URL);
  url.searchParams.set("chainId", env.THAIFI_CHAIN_ID);
  url.searchParams.set("sql", sql);
  url.searchParams.set("engine", "clickhouse");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TIDX query failed: ${res.status}`);
  return (await res.json()) as TidxResult;
}
