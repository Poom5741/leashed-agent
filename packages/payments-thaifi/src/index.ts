/**
 * ThaiFi MPP rail adapter — drives the public `thaifi` CLI (npm: thaifi-wallet-cli)
 * as a child process. The CLI handles pairing, on-chain spend limits, and the
 * 402 → on-chain payment → retry flow; this adapter parses its output into
 * rail-agnostic Receipts for the policy engine and dashboard.
 */
import { spawn } from "node:child_process";
import type { Receipt } from "@leashed/receipts";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Runner = (args: string[]) => Promise<ExecResult>;

export function defaultRunner(env: NodeJS.ProcessEnv = process.env): Runner {
  const bin = env.THAIFI_BIN ?? "npx";
  const base = env.THAIFI_BIN ? [] : ["-y", "thaifi-wallet-cli"];
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(bin, [...base, ...args], { env });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
}

export interface PaidCall {
  /** HTTP status of the final (post-payment) response. */
  httpStatus: number;
  /** The final response body text (JSON when the service speaks JSON). */
  body: string;
  receipt: Receipt | null;
}

const RE_PAID = /^Paid\. Tx: (0x[0-9a-fA-F]{64})$/m;
const RE_PAYING = /^402 — paying \$([\d.]+) to (0x[0-9a-fA-F]{40})/m;
const RE_HTTP = /^← HTTP (\d+)$/m;

export function expolorerTxUrl(txHash: string): string {
  return `https://exp.thaifi.com/tx/${txHash}`;
}

/** Last top-level JSON object printed by the CLI (pretty-printed after `← HTTP`). */
export function lastJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** USD cap for the automatic payment (mirrors the CLI's --max-spend). */
  maxSpend?: number;
}

export interface ThaifiClient {
  dryRun(url: string, options?: RequestOptions): Promise<string>;
  request(url: string, options?: RequestOptions, meta?: { purpose?: string }): Promise<PaidCall>;
}

export function createThaifiClient(opts: { runner?: Runner; now?: () => Date } = {}): ThaifiClient {
  const run = opts.runner ?? defaultRunner();
  const now = opts.now ?? (() => new Date());
  const passthrough = (options: RequestOptions = {}): string[] => {
    // NOTE: `-H/--header` is variadic in the CLI — the URL must come FIRST or
    // it gets swallowed as another header. `--json` takes a value (body
    // shorthand), so never pass it bare.
    const args = ["request", "-X", options.method ?? "GET"];
    for (const [k, v] of Object.entries(options.headers ?? {})) args.push("-H", `${k}: ${v}`);
    if (options.body !== undefined) args.push("-d", options.body);
    if (options.maxSpend !== undefined) args.push("--max-spend", String(options.maxSpend));
    return args;
  };

  return {
    async dryRun(url, options = {}) {
      const { stdout } = await run([...passthrough(options), "--dry-run", url]);
      return stdout;
    },

    async request(url, options = {}, meta = {}) {
      const { code, stdout, stderr } = await run([...passthrough(options), url]);
      const httpMatch = RE_HTTP.exec(stdout);
      const txMatch = RE_PAID.exec(stdout);
      const payingMatch = RE_PAYING.exec(stdout);
      const httpStatus = httpMatch ? Number(httpMatch[1]) : (code === 0 ? 200 : 0);
      let receipt: Receipt | null = null;
      if (txMatch?.[1] && payingMatch?.[2]) {
        const display = Number(payingMatch[1]);
        const txHash = txMatch[1];
        receipt = {
          id: `${txHash.slice(0, 10)}-${now().getTime()}`,
          rail: "thaifi-mpp",
          serviceId: meta.purpose ?? new URL(url).hostname,
          purpose: meta.purpose ?? url,
          token: { symbol: "THCFI", decimals: 6 },
          amountBase: BigInt(Math.round(display * 1e6)).toString(),
          amountDisplay: `${display} THCFI`,
          payTo: payingMatch[2],
          status: "paid",
          txHash,
          txUrl: expolorerTxUrl(txHash),
          createdAt: now().toISOString(),
        };
      }
      return { httpStatus, body: stdout + (stderr ? `\n[stderr] ${stderr}` : ""), receipt };
    },
  };
}
