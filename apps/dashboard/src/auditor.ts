/**
 * Read the latest CRE auditor verdict from disk.
 *
 * Tolerates a missing file (never audited yet), an empty file (the previous
 * shell-extraction step in scripts/demo.sh wrote zero bytes when the audit
 * run produced no JSON object — that crashed the dashboard on cold start
 * because JSON.parse('') throws), and a corrupt file (truncated write or
 * accidental overwrite). On any of those we return null so the caller can
 * render the "awaiting audit" state instead of bringing the server down.
 */
import { existsSync, readFileSync } from "node:fs";

export function readAuditorVerdict(path: string): unknown | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}