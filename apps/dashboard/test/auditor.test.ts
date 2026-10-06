import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAuditorVerdict } from "../src/auditor.js";

function tmpPath(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "leashed-auditor-test-"));
  return { dir, path: join(dir, name) };
}

test("missing file → null", () => {
  const { dir, path } = tmpPath("nope.json");
  try {
    assert.equal(readAuditorVerdict(path), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty file (zero bytes) → null — the original crash repro", () => {
  // scripts/demo.sh used to write 0 bytes when the audit grep missed,
  // then JSON.parse('') crashed the dashboard on next /api/state hit.
  const { dir, path } = tmpPath("empty.json");
  try {
    writeFileSync(path, "");
    assert.equal(readAuditorVerdict(path), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("whitespace-only file → null", () => {
  const { dir, path } = tmpPath("ws.json");
  try {
    writeFileSync(path, "   \n\t  \n");
    assert.equal(readAuditorVerdict(path), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt JSON → null (never throws)", () => {
  const { dir, path } = tmpPath("bad.json");
  try {
    writeFileSync(path, '{"verdict":"PASS","chekced":2,'); // truncated
    assert.equal(readAuditorVerdict(path), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("valid JSON → returned as parsed object", () => {
  const { dir, path } = tmpPath("ok.json");
  try {
    const verdict = { verdict: "PASS", checked: 4, at: "2026-10-06T13:46:05Z" };
    writeFileSync(path, JSON.stringify(verdict));
    assert.deepEqual(readAuditorVerdict(path), verdict);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("valid JSON with surrounding whitespace → trimmed before parse", () => {
  const { dir, path } = tmpPath("ws-ok.json");
  try {
    writeFileSync(path, "\n\n  {\"verdict\":\"PASS\"}  \n\n");
    assert.deepEqual(readAuditorVerdict(path), { verdict: "PASS" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});