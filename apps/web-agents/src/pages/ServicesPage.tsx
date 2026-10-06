import { useEffect, useState } from "react";
import { listServices, type ServiceEntry } from "../api/client.js";

export function ServicesPage() {
  const [q, setQ] = useState("");
  const [services, setServices] = useState<ServiceEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listServices(q || undefined)
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
  if (services === null) return <p className="loading-muted">Loading services…</p>;

  return (
    <>
      <section className="hero">
        <span className="eyebrow">MARKETPLACE</span>
        <h1>Discover services any ThaiFi wallet holder can pay for.</h1>
        <p>
          Public registry of seller services. Anyone with a ThaiFi wallet can register
          one with <code>npx @leashed/wallet-cli-platform marketplace register</code>.
          Agents discover via <code>GET /v1/services</code>.
        </p>
      </section>

      <div className="section-head">
        <h2>Registered services</h2>
        <span className="meta">{services.length} {services.length === 1 ? "service" : "services"}</span>
      </div>

      <div className="search-row">
        <input
          type="search"
          placeholder="filter by url or rail…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="filter services"
        />
      </div>

      {services.length === 0 ? (
        <section className="empty">
          <h1>{q.trim() ? "No matches." : "No services registered yet."}</h1>
          {!q.trim() && (
            <p>Register one from the CLI:</p>
          )}
          {!q.trim() && (
            <pre><code>npx @leashed/wallet-cli-platform marketplace register &lt;url&gt; --rail cardano-x402 --price 0.10 --token USDM</code></pre>
          )}
        </section>
      ) : (
        <table className="services-table">
          <thead>
            <tr><th>id</th><th>endpoint</th><th>rail</th><th>price (base)</th><th>token</th></tr>
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
    </>
  );
}