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
      // Optimistic local update; the next listAgents pull would too.
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
  if (agents === null) return <p className="muted">Loading…</p>;

  if (agents.length === 0) {
    return (
      <section className="empty">
        <h1>No agents yet</h1>
        <p>Deploy one from the CLI:</p>
        <pre><code>npx @leashed/wallet-cli-platform agent deploy noodle-shop</code></pre>
      </section>
    );
  }

  return (
    <section>
      <h1>Your leashed agents</h1>
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
              <span>limit: {a.limitAmount ?? "—"}</span>
              <span>period: {a.limitPeriod ?? "—"}s</span>
            </div>
            {a.status !== "revoked" && (
              <button
                className="revoke-btn"
                onClick={(ev) => onRevoke(a.keyId, ev)}
                disabled={revoking === a.keyId}
                aria-label={`revoke agent ${a.keyId}`}
              >
                {revoking === a.keyId ? "Revoking…" : "Revoke"}
              </button>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}