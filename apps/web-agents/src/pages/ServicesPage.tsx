import { useEffect, useState } from "react";
import { listServices, type ServiceEntry } from "../api/client.js";

export function ServicesPage() {
  const [q, setQ] = useState("");
  const [services, setServices] = useState<ServiceEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Debounce-less: re-fetch on every keystroke. The D1 query is indexed
  // and the row count is small (<500 in any reasonable dev session).
  useEffect(() => {
    let cancelled = false;
    listServices(q.trim() || undefined)
      .then((rows) => {
        if (!cancelled) setServices(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  if (err) return <p className="error">Failed to load services: {err}</p>;
  if (services === null) return <p className="muted">Loading…</p>;

  return (
    <section>
      <h1>Marketplace services</h1>
      <p className="muted">Public registry of seller services registered by ThaiFi wallet holders.</p>
      <div className="search-row">
        <input
          type="search"
          placeholder="filter by url or rail…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="filter services"
        />
        <span className="muted">{services.length} {services.length === 1 ? "service" : "services"}</span>
      </div>

      {services.length === 0 ? (
        <p className="muted">
          {q.trim() ? "No matches." : "No services registered yet. Register one from the CLI:"}
          {!q.trim() && <code> npx @leashed/wallet-cli-platform marketplace register &lt;url&gt; --rail cardano-x402 --price 0.10 --token USDM</code>}
        </p>
      ) : (
        <table className="receipts">
          <thead>
            <tr><th>id</th><th>endpoint</th><th>rail</th><th>price</th><th>token</th></tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td><code>{s.id.slice(0, 8)}…</code></td>
                <td><a href={s.endpointUrl} target="_blank" rel="noreferrer">{s.endpointUrl}</a></td>
                <td><code>{s.rail}</code></td>
                <td><code>{s.priceBase}</code></td>
                <td><code>{s.token}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}