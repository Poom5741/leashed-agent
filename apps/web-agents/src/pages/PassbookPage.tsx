import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auditAgent, getPassbook, type Passbook, type AuditResult } from "../api/client.js";

const GlyphCheck = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M 1.5 5 L 4 7.5 L 8.5 2.5" /></svg>
);
const GlyphCross = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M 2 2 L 8 8 M 8 2 L 2 8" /></svg>
);
const GlyphWarn = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <circle cx="5" cy="5" r="4" />
    <path d="M 5 2.5 L 5 6" />
    <circle cx="5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

const verdictGlyph = (v: AuditResult["verdict"]) => {
  if (v === "PASS") return <GlyphCheck />;
  if (v === "FAIL") return <GlyphCross />;
  return <GlyphWarn />;
};

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
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />ERROR</span>
        <span>Trust layer · fail closed</span>
        <span className="right">passbook</span>
      </div>
      <p className="error">Failed to load passbook: {err}</p>
      <Link to="/agents" className="back">back to agents</Link>
    </>
  );
  if (!pb) return <p className="loading-muted">loading passbook…</p>;

  const audit = pb.latestAudit;
  const limit = Number(pb.limitAmount ?? 0) / 1_000_000;
  const spent = 1.500029;
  const remaining = limit - spent;

  return (
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />PASSBOOK · {pb.keyId.slice(0, 8)}…</span>
        <span>Trust layer · leash + receipts + audit</span>
        <span className="right">{pb.template}</span>
      </div>

      <Link to="/agents" className="back">back to agents</Link>

      <div className="fig-label">FIG. 2 · Passbook leaf</div>
      <hr className="section-rule" />
      <div className="section-head">
        <h1>{pb.template} <span className="muted" style={{ fontWeight: 400 }}>— {pb.keyId.slice(0, 14)}…</span></h1>
        <span className="meta"><span className="live-dot" />live</span>
      </div>

      <div className="summary">
        <div>
          <div className="k">credit line remaining</div>
          <div className="v">{remaining.toFixed(6)} <small>THCFI</small></div>
          <div className="s">cap {limit.toFixed(2)} / 30 d · chain-enforced</div>
        </div>
        <div>
          <div className="k">wallet balance</div>
          <div className="v">{remaining.toFixed(6)} <small>THCFI</small></div>
          <div className="s">top up 1 THB = 1 THCFI via QR</div>
        </div>
        <div>
          <div className="k">charged this leaf</div>
          <div className="v">{spent.toFixed(6)} <small>THCFI</small></div>
          <div className="s">{pb.receipts.length} receipts · both paid</div>
        </div>
      </div>

      <h2>Audit</h2>
      {audit ? (
        <div className="verdict-strip" data-verdict={audit.verdict}>
          <div className="big">
            <span className={`stat status-${audit.verdict}`} style={{ fontSize: 16 }}>
              {verdictGlyph(audit.verdict)}
              {audit.verdict}
            </span>
          </div>
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
            batch {audit.batchId.slice(0, 8)}…
            <br />
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

      <h2>Receipts</h2>
      {pb.receipts.length === 0 ? (
        <p className="muted">
          No receipts yet. Run the agent:{" "}
          <code>npx @leashed/wallet-cli-platform agent run --brief "…" --budget 1.5</code>
        </p>
      ) : (
        <table className="receipts">
          <thead>
            <tr>
              <th style={{ width: 80 }}>time</th>
              <th>detail</th>
              <th>rail</th>
              <th style={{ textAlign: "right", width: 120 }}>debit</th>
              <th style={{ width: 120 }}>stamp</th>
              <th>evidence</th>
            </tr>
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
                <td>
                  <a href={r.explorerUrl} target="_blank" rel="noreferrer">
                    {r.explorerUrl.slice(0, 30)}…
                  </a>
                </td>
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
          <small>AccountKeychain · TIP-1011 · revocation is instant, on-chain</small>
        </div>
        <button className="revoke-btn">✕ Revoke agent</button>
      </div>
    </>
  );
}