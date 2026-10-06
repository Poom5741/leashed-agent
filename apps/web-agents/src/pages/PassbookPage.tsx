import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPassbook, type Passbook } from "../api/client.js";

export function PassbookPage() {
  const { keyId } = useParams();
  const [pb, setPb] = useState<Passbook | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!keyId) return;
    getPassbook(keyId)
      .then(setPb)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [keyId]);

  if (err) return (
    <section>
      <p className="error">Failed to load passbook: {err}</p>
      <Link to="/agents">← back to agents</Link>
    </section>
  );
  if (!pb) return <p className="muted">Loading…</p>;

  return (
    <section>
      <Link to="/agents" className="back">← back to agents</Link>
      <h1>{pb.template}</h1>
      <div className="meta-grid">
        <div><span className="label">keyId</span><code>{pb.keyId}</code></div>
        <div><span className="label">status</span><span className={`status status-${pb.status}`}>{pb.status}</span></div>
        <div><span className="label">leaseState</span><span className={`status status-${pb.leaseState}`}>{pb.leaseState}</span></div>
        <div><span className="label">limit</span><code>{pb.limitAmount ?? "—"} / {pb.limitPeriod ?? "—"}s</code></div>
      </div>

      <h2>Receipts</h2>
      {pb.receipts.length === 0 ? (
        <p className="muted">No receipts yet. Run the agent: <code>npx @leashed/wallet-cli-platform agent run --brief "…" --budget 1.5</code></p>
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
    </section>
  );
}