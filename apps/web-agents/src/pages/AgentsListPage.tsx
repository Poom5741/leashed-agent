import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAgents, revokeAgent, type Agent } from "../api/client.js";

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

  if (err) return <p className="error">Failed to load agents: {err}</p>;
  if (agents === null) return <p className="loading-muted">Loading your leashed agents…</p>;

  return (
    <>
      <section className="hero">
        <span className="eyebrow">TRUST LAYER · v2</span>
        <h1>One leash, every payment, independently checked.</h1>
        <p>
          Each agent here runs on a chain-enforced leash — a per-token spending cap your wallet
          sets and revokes. Every payment becomes a receipt. A Chainlink CRE workflow
          re-reads the ledger and attests the verdict on-chain.
        </p>
        <div className="trust-pills">
          <span className="pill">Leash · on-chain enforcement</span>
          <span className="pill">Receipts · explorer-linked</span>
          <span className="pill">Audit · CRE + Sepolia</span>
          <span className="pill">Funding · PromptPay</span>
        </div>
      </section>

      {agents.length === 0 ? (
        <section className="empty">
          <h1>No agents yet</h1>
          <p>Deploy one from the CLI to see it appear here.</p>
          <pre><code>npx @leashed/wallet-cli-platform agent deploy noodle-shop</code></pre>
        </section>
      ) : (
        <>
          <div className="section-head">
            <h2>Your leashed agents</h2>
            <span className="meta">{agents.length} active</span>
          </div>
          <div className="card-grid">
            {agents.map((a) => (
              <Link key={a.id} to={`/agents/${encodeURIComponent(a.keyId)}`} className="card">
                <div className="card-row">
                  <span className="template">{a.template}</span>
                  <span className={`status status-${a.status}`}>
                    {a.status}
                    {a.status === "revoked" && <span className="revoked-tag"> [revoked]</span>}
                  </span>
                </div>
                <code className="keyId">{a.keyId}</code>
                <div className="card-meta">
                  <span>limit {a.limitAmount ?? "—"}</span>
                  <span>period {a.limitPeriod ?? "—"}s</span>
                </div>
                {a.status !== "revoked" && (
                  <div className="card-actions">
                    <button
                      className="revoke-btn"
                      onClick={(ev) => onRevoke(a.keyId, ev)}
                      disabled={revoking === a.keyId}
                      aria-label={`revoke agent ${a.keyId}`}
                    >
                      {revoking === a.keyId ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}