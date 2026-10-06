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
  if (agents === null) return <p className="loading-muted">loading register…</p>;

  const active = agents.filter((a) => a.status !== "revoked").length;

  return (
    <div className="page">
      <div className="page-body">
        <div className="kicker">FIG. 1 — Register of leashed agents</div>
        <h1>
          Leashed agents —{" "}
          <span style={{ color: "var(--blue)", borderBottom: "2px solid var(--blue)", paddingBottom: 2 }}>
            on the chain
          </span>
          .
        </h1>
        <p className="lede">
          Each card is an AI worker bound to a chain-enforced spending leash. Limits are set by a human,
          enforced by a chain, and revocable on the spot.
        </p>

        <div className="meta-bar">
          <div>
            <div className="k">guarantor</div>
            <div className="v">0x3369…4f4e</div>
          </div>
          <div>
            <div className="k">active / total</div>
            <div className="v">{active} / {agents.length}</div>
          </div>
          <div>
            <div className="k">chains</div>
            <div className="v">17 · preprod</div>
          </div>
          <div>
            <div className="k">statement date</div>
            <div className="v">06 Oct 26</div>
          </div>
        </div>

        {agents.length === 0 ? (
          <p className="muted">No agents registered yet. Deploy one from the CLI:</p>
        ) : (
          <div className="grid">
            {agents.map((a) => (
              <Link
                key={a.id}
                to={`/agents/${encodeURIComponent(a.keyId)}`}
                className={`card${a.status === "revoked" ? " revoked" : ""}`}
              >
                <div className="top">
                  <div className="name">{a.template}</div>
                  <span className={`stat ${a.status}`}>{a.status}</span>
                </div>
                <div className="keyId">{a.keyId} · p256</div>
                <div className="row"><span>limit</span><b>{(Number(a.limitAmount) / 1_000_000).toFixed(2)} THCFI</b></div>
                <div className="row"><span>period</span><b>{((a.limitPeriod ?? 0) / 86400).toFixed(0)} d</b></div>
                <div className="row">
                  <span>opened</span>
                  <b>{new Date(a.createdAt).toISOString().slice(0, 10)}</b>
                </div>
                <div className="row">
                  <span>rail</span>
                  <b>thaifi-mpp · cardano-x402</b>
                </div>
                <div className="foot">
                  {a.status === "revoked" ? (
                    <>
                      <span className="anno" style={{ color: "var(--red)" }}>lease terminated</span>
                      <span />
                    </>
                  ) : (
                    <>
                      <span className="anno">on-chain</span>
                      <button
                        className="revoke-btn"
                        onClick={(ev) => onRevoke(a.keyId, ev)}
                        disabled={revoking === a.keyId}
                        aria-label={`revoke agent ${a.keyId}`}
                      >
                        ✕ Revoke
                      </button>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="page-foot">
        <span>{agents.length} cards · {active} active</span>
        <span className="trust">trust layer · v2</span>
      </div>
    </div>
  );
}