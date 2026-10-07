import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listServices, type ServiceEntry } from "../api/client.js";

export function ServicesPage() {
  const [q, setQ] = useState("");
  const [services, setServices] = useState<ServiceEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listServices(q || undefined)
      .then((rows) => { if (!cancelled) setServices(rows); })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [q]);

  if (err) return (
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />ERROR</span>
        <span>Trust layer · fail closed</span>
        <span className="right">marketplace</span>
      </div>
      <p className="error">Failed to load services: {err}</p>
    </>
  );
  if (services === null) return <p className="loading-muted">loading register…</p>;

  return (
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />MARKETPLACE</span>
        <span>Public service register · anyone with a ThaiFi wallet can register</span>
        <span className="right">{services.length} live</span>
      </div>

      {/* Faucet discoverability: judges who land here need tUSDM to actually
          call these x402 services. Top-of-list link to /faucet. */}
      <p className="muted" style={{ marginTop: 14, marginBottom: 8, fontSize: 13 }}>
        <span style={{ marginRight: 8, color: "var(--ink55)" }}>↓</span>
        Need tUSDM to call these? Claim <strong>10 tUSDM + 5 tADA</strong> free on
        {" "}<Link to="/faucet" style={{ color: "var(--blue)", textDecoration: "underline" }}>the Cardano preprod faucet</Link>
        {" "}(one claim per address per day).
      </p>

      {services.length === 0 && !q.trim() ? (
        <div className="empty">
          <svg width="120" height="80" viewBox="0 0 120 80">
            <rect x="14" y="14" width="92" height="52" fill="none" stroke="#1F4E79" strokeWidth="1.5" />
            <line x1="22" y1="26" x2="98" y2="26" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="22" y1="40" x2="98" y2="40" stroke="#1F4E79" strokeWidth="0.5" />
            <line x1="22" y1="54" x2="98" y2="54" stroke="#1F4E79" strokeWidth="0.5" />
            <text x="60" y="78" fontFamily="Roboto Mono, monospace" fontSize="7" fill="#1F4E79" textAnchor="middle">— N I L —</text>
          </svg>
          <h1>No services registered yet.</h1>
          <p>Register one from the CLI:</p>
          <pre><code>npx @leashed/wallet-cli-platform marketplace register &lt;url&gt; --rail cardano-x402 --price 0.10 --token USDM</code></pre>
          <div className="hint">↓  fig. 3 · empty register</div>
        </div>
      ) : (
        <>
          <div className="fig-label">FIG. 3 · Public service register</div>
          <hr className="section-rule" />
          <div className="section-head">
            <h2>Registered services</h2>
            <span className="meta">
              <span className="live-dot" />
              {services.length} {services.length === 1 ? "service" : "services"}
              {q.trim() ? ` · filter "${q}"` : ""}
            </span>
          </div>

          <div className="search-row">
            <input
              type="search"
              placeholder="filter by url or rail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="filter services"
            />
            <span className="anno">matches: {services.length}</span>
          </div>

          {services.length === 0 ? (
            <p className="muted">No matches.</p>
          ) : (
            <div className="services-register">
              {services.map((s) => (
                <div className="service-row" key={s.id}>
                  <div className="id">{s.id.slice(0, 8)}…</div>
                  <div className="url">
                    <a href={s.endpointUrl} target="_blank" rel="noreferrer">{s.endpointUrl}</a>
                    <div className="desc">
                      {s.rail === "thaifi-mpp" ? "ThaiFi MPP endpoint" : "Cardano x402 endpoint"}
                    </div>
                  </div>
                  <div><span className="rail">{s.rail}</span></div>
                  <div className="mono">{(Number(s.priceBase) / 1_000_000).toFixed(2)}</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{s.token}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}