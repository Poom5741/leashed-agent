import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAgents, type Agent } from "../api/client.js";

export function AgentsListPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

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
          </Link>
        ))}
      </div>
    </section>
  );
}