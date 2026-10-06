import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auditAgent, getPassbook, type Passbook, type AuditResult } from "../api/client.js";

export function PassbookPage() {
  const { keyId } = useParams();
  const [pb, setPb] = useState<Passbook | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditErr, setAuditErr] = useState<string | null>(null);

  useEffect(() => {
    if (!keyId) return;
    getPassbook(keyId)
      .then(setPb)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [keyId]);

  async function runAudit() {
    if (!keyId) return;
    setAuditing(true);
    setAuditErr(null);
    try {
      const result: AuditResult = await auditAgent(keyId);
      setPb((prev) => (prev ? { ...prev, latestAudit: result } : prev));
    } catch (e: unknown) {
      setAuditErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditing(false);
    }
  }

  if (err) return (
    <section>
      <p className="error">Failed to load passbook: {err}</p>
      <Link to="/agents" className="back">← back to agents</Link>
    </section>
  );
  if (!pb) return <p className="loading-muted">Loading passbook…</p>;

  const audit = pb.latestAudit;
  return (
    <>
      <Link to="/agents" className="back">← back to agents</Link>

      <div className="section-head">
        <h1>{pb.template}</h1>
        <span className="meta">keyId <code>{pb.keyId}</code></span>
      </div>

      <section className="hero" style={{ padding: "var(--s-6) var(--s-6)" }}>
        <span className="eyebrow">PASSBOOK · LEASH STATE</span>
        <h1 style={{ fontSize: "22px" }}>
          {pb.leaseState === "revoked"
            ? "Lease revoked — no further payments allowed."
            : "Lease live — payments allowed up to the cap."}
        </h1>
        <p>
          This passbook shows the agent's leash, its receipts, and the latest CRE auditor verdict.
          Every payment is on-chain, every verdict is auditable.
        </p>
      </section>

      <div className="meta-grid">
        <div>
          <span className="label">status</span>
          <span className={`status status-${pb.status}`}>{pb.status}</span>
        </div>
        <div>
          <span className="label">leaseState</span>
          <span className={`status status-${pb.leaseState}`}>{pb.leaseState}</span>
        </div>
        <div>
          <span className="label">spending cap</span>
          <code style={{ fontSize: "14px" }}>{pb.limitAmount ?? "—"} {pb.limitPeriod ? `THCFI / ${pb.limitPeriod}s` : ""}</code>
        </div>
        <div>
          <span className="label">created</span>
          <code style={{ fontSize: "12.5px" }}>{new Date(pb.createdAt).toISOString().slice(0, 19)}Z</code>
        </div>
      </div>

      <h2>Audit</h2>
      {audit ? (
        <div className="audit-card" data-verdict={audit.verdict}>
          <div className="audit-row">
            <span className={`status status-${audit.verdict}`}>{audit.verdict}</span>
            <span className="audit-headline">
              {audit.verdict === "WARN"
                ? "No receipts yet — nothing to check, nothing to fail."
                : audit.verdict === "PASS"
                  ? `Checked ${audit.checked} receipt${audit.checked === 1 ? "" : "s"} — clean ledger.`
                  : `Checked ${audit.checked} receipt${audit.checked === 1 ? "" : "s"} — flagged ${audit.problems.length} issue${audit.problems.length === 1 ? "" : "s"}.`}
            </span>
          </div>
          {audit.problems.length > 0 && (
            <ul className="problems">
              {audit.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <div className="audit-meta">
            batch {audit.batchId.slice(0, 8)}… ·{" "}
            {audit.attestationTx === null
              ? "in-process (Hono); CRE cron attests Sepolia"
              : `CRE attestation ${audit.attestationTx}`}
            {" · "}
            {new Date(audit.createdAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <p className="muted">
          Not audited. Click <strong>Rerun audit</strong> to invoke the CRE auditor algorithm in
          this process.
        </p>
      )}
      {auditErr && <p className="error">Audit failed: {auditErr}</p>}
      <button onClick={runAudit} disabled={auditing} className="primary">
        {auditing ? "Auditing…" : "Rerun audit"}
      </button>

      <h2>Receipts</h2>
      {pb.receipts.length === 0 ? (
        <p className="muted">
          No receipts yet. Run the agent:{" "}
          <code>npx @leashed/wallet-cli-platform agent run --brief "…" --budget 1.5</code>
        </p>
      ) : (
        <table className="receipts">
          <thead>
            <tr><th>txHash</th><th>amount</th><th>token</th><th>explorer</th><th>paid at</th></tr>
          </thead>
          <tbody>
            {pb.receipts.map((r) => (
              <tr key={r.txHash}>
                <td><code>{r.txHash.slice(0, 10)}…</code></td>
                <td>{r.amount}</td>
                <td>{r.token}</td>
                <td><a href={r.explorerUrl} target="_blank" rel="noreferrer">view ↗</a></td>
                <td>{r.paidAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}