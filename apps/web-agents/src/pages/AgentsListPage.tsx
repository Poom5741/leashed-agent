import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAgents, revokeAgent, type Agent } from "../api/client.js";

// Tiny inline SVG glyphs for the status pills
const GlyphCheck = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M 1.5 5 L 4 7.5 L 8.5 2.5" />
  </svg>
);
const GlyphCross = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M 2 2 L 8 8 M 8 2 L 2 8" />
  </svg>
);
const GlyphDot = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <circle cx="5" cy="5" r="1.5" />
  </svg>
);

const statusGlyph = (s: Agent["status"]) => {
  if (s === "approved") return <GlyphCheck />;
  if (s === "revoked") return <GlyphCross />;
  return <GlyphDot />;
};

export function AgentsListPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  async function onRevoke(keyId: string, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    setRevoking(keyId);
    try {
      await revokeAgent(keyId);
      setAgents((prev) =>
        prev ? prev.map((a) => (a.keyId === keyId ? { ...a, status: "revoked" } : a)) : prev
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(null);
    }
  }

  if (err)
    return (
      <p className="error">
        {/Unexpected token|Failed to fetch|404|405/i.test(String(err))
          ? "Could not reach the agents API — it may be down. Retry shortly."
          : `Failed to load agents: ${err}`}
      </p>
    );
  if (agents === null) return <p className="loading-muted">loading register…</p>;

  const active = agents.filter((a) => a.status !== "revoked").length;

  return (
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />LIVE REGISTER</span>
        <span>Trust layer · leash + receipts + audit + funding</span>
        <span className="right">06 Oct · v2.1</span>
      </div>

      {agents.length === 0 ? (
        <div className="empty">
          <svg width="120" height="80" viewBox="0 0 120 80">
            {/* Hand-drawn draft of an empty register sheet */}
            <rect x="10" y="10" width="100" height="60" fill="none" stroke="#1F4E79" strokeWidth="1.5" />
            <line x1="10" y1="22" x2="110" y2="22" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="10" y1="34" x2="110" y2="34" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="10" y1="46" x2="110" y2="46" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="10" y1="58" x2="110" y2="58" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="40" y1="10" x2="40" y2="70" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="78" y1="10" x2="78" y2="70" stroke="#1F4E79" strokeWidth="0.5" />
            <text x="60" y="78" fontFamily="Roboto Mono, monospace" fontSize="7" fill="#1F4E79" textAnchor="middle">— N I L —</text>
          </svg>
          <h1>No agents yet.</h1>
          <p>Deploy one from the CLI to see it appear here.</p>
          <pre><code>npx @leashed/wallet-cli-platform agent deploy noodle-shop</code></pre>
          <div className="hint">↓  fig. 0 · empty register</div>
        </div>
      ) : (
        <>
          <div className="fig-label">FIG. 1 · Register of leashed agents</div>
          <hr className="section-rule" />
          <div className="section-head">
            <h2>Your leashed agents</h2>
            <span className="meta">
              <span className="live-dot" />{active} active / {agents.length}
            </span>
          </div>

          <div className="grid">
            {agents.map((a) => (
              <Link
                key={a.id}
                to={`/agents/${encodeURIComponent(a.keyId)}`}
                className={`card${a.status === "revoked" ? " revoked" : ""}`}
              >
                <div className="top">
                  <div className="name">{a.template}</div>
                  <span className={`stat status-${a.status}`}>
                    {statusGlyph(a.status)}
                    {a.status}
                    {a.status === "revoked" && <span className="revoked-tag"> [revoked]</span>}
                  </span>
                </div>
                <code className="keyId">{a.keyId} · p256</code>
                <div className="row">
                  <span>limit</span>
                  <b>{(Number(a.limitAmount) / 1_000_000).toFixed(2)} THCFI</b>
                </div>
                <div className="row">
                  <span>period</span>
                  <b>{((a.limitPeriod ?? 0) / 86_400).toFixed(0)} d</b>
                </div>
                <div className="row">
                  <span>opened</span>
                  <b>{new Date(a.createdAt).toISOString().slice(0, 10)}</b>
                </div>
                <div className="row">
                  <span>rail</span>
                  <b>thaifi-mpp · cardano-x402</b>
                </div>
                {a.status !== "revoked" && (
                  <div className="card-actions">
                    <button
                      className="revoke-btn"
                      onClick={(ev) => onRevoke(a.keyId, ev)}
                      disabled={revoking === a.keyId}
                      aria-label={`revoke agent ${a.keyId}`}
                    >
                      {revoking === a.keyId ? "Revoking…" : "✕ Revoke"}
                    </button>
                  </div>
                )}
              </Link>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 18, textAlign: "right" }}>
            <span className="anno">on-chain</span>
          </p>
        </>
      )}
    </>
  );
}