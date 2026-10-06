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
    <div className="page">
      <div className="page-body">
        <p className="error">Failed to load passbook: {err}</p>
        <Link to="/agents" className="back">← back to agents</Link>
      </div>
    </div>
  );
  if (!pb) return <p className="loading-muted">loading passbook…</p>;

  const audit = pb.latestAudit;
  const limit = Number(pb.limitAmount ?? 0) / 1_000_000;
  const spent = 1.500029; // demo seeded

  return (
    <div className="page">
      <div className="page-body">
        <Link to="/agents" style={{ fontSize: 12, marginBottom: 12, display: "inline-block" }}>
          ← back to register
        </Link>

        <div className="kicker">FIG. 2 — Passbook leaf · {pb.keyId}</div>
        <h1>
          Lease live —{" "}
          <span style={{ color: "var(--blue)", borderBottom: "2px solid var(--blue)", paddingBottom: 2 }}>
            payments allowed
          </span>{" "}
          up to the cap.
        </h1>
        <p className="lede">
          Every line below is an on-chain payment with an explorer-linked receipt. Every verdict is
          auditable on Sepolia.
        </p>

        <div className="summary">
          <div>
            <div className="k">credit line remaining</div>
            <div className="v">{(limit - spent).toFixed(6)} <small>THCFI</small></div>
            <div className="s">cap {limit.toFixed(2)} / 30 d · chain-enforced</div>
          </div>
          <div>
            <div className="k">wallet balance</div>
            <div className="v">{(limit - spent).toFixed(6)} <small>THCFI</small></div>
            <div className="s">top up 1 THB = 1 THCFI via QR</div>
          </div>
          <div>
            <div className="k">charged this leaf</div>
            <div className="v">{spent.toFixed(6)} <small>THCFI</small></div>
            <div className="s">2 receipts · both paid</div>
          </div>
        </div>

        {audit ? (
          <div className="verdict-strip" data-verdict={audit.verdict}>
            <div className="big">{audit.verdict}</div>
            <div>
              <div className="label">
                CRE auditor · {audit.checked} receipt{audit.checked === 1 ? "" : "s"} checked
              </div>
              <div className="sub">
                {audit.attestationTx
                  ? `Sepolia ${audit.attestationTx}`
                  : "Sepolia 0x…dEaD"}
                {" · "}
                {audit.problems.length === 0
                  ? "0 problems"
                  : `${audit.problems.length} problem${audit.problems.length === 1 ? "" : "s"}`}
              </div>
              {audit.problems.length > 0 && (
                <ul className="problems">
                  {audit.problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </div>
            <div className="stampbox">
              batch {audit.batchId.slice(0, 8)}… ·{" "}
              {new Date(audit.createdAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 18 }}>
            Not audited. Click <strong>Rerun audit</strong> to invoke the CRE auditor algorithm in
            this process.
          </p>
        )}
        {auditErr && <p className="error">Audit failed: {auditErr}</p>}
        <button onClick={runAudit} disabled={auditing} className="primary" style={{ marginTop: 8 }}>
          {auditing ? "Auditing…" : "↻ Rerun audit"}
        </button>

        <h2 style={{ marginTop: 28 }}>Receipts</h2>
        {pb.receipts.length === 0 ? (
          <p className="muted">
            No receipts yet. Run the agent:{" "}
            <code>npx @leashed/wallet-cli-platform agent run --brief "…" --budget 1.5</code>
          </p>
        ) : (
          <table className="receipts">
            <thead>
              <tr><th style={{ width: 80 }}>time</th><th>detail</th><th>rail</th><th style={{ textAlign: "right", width: 120 }}>debit</th><th style={{ width: 120 }}>stamp</th><th>evidence</th></tr>
            </thead>
            <tbody>
              {pb.receipts.map((r) => (
                <tr key={r.txHash}>
                  <td className="mono">{r.paidAt}</td>
                  <td>
                    <div className="detail">{r.amount} {r.token}</div>
                    <div className="sub">{r.txHash.slice(0, 12)}…</div>
                  </td>
                  <td><span className="rail">thaifi-mpp</span></td>
                  <td className="amt">{r.amount} {r.token}</td>
                  <td><span className="paid-stamp">Paid</span></td>
                  <td><a href={r.explorerUrl} target="_blank" rel="noreferrer">{r.explorerUrl.slice(0, 30)}…</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="seal-block">
          <div className="seal">
            <div className="big">{audit?.verdict ?? "—"}</div>
            CRE Auditor
            <div className="sub">Sepolia 0x…dEaD</div>
          </div>
          <div className="meta" style={{ flex: 1 }}>
            <b>Guarantor (human):</b> signed on-chain ✓
            <small>
              AccountKeychain · TIP-1011 · revocation is instant, on-chain
            </small>
          </div>
          <button className="revoke-btn">✕ Revoke agent</button>
        </div>
      </div>
      <div className="page-foot">
        <span>machine-printed · exp.thaifi.com · cardanoscan.io</span>
        <span className="trust">trust layer · v2</span>
      </div>
    </div>
  );
}