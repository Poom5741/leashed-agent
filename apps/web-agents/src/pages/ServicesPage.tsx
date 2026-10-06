import { useEffect, useState } from "react";
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

  if (err) return <p className="error">Failed to load services: {err}</p>;
  if (services === null) return <p className="loading-muted">loading register…</p>;

  return (
    <div className="page">
      <div className="page-body">
        <div className="kicker">FIG. 3 — Public service register</div>
        <h1>
          Registered services —{" "}
          <span style={{ color: "var(--blue)", borderBottom: "2px solid var(--blue)", paddingBottom: 2 }}>
            public ledger
          </span>
          .
        </h1>
        <p className="lede">
          Anyone with a ThaiFi wallet can register. Anyone can browse. Signatures stored verbatim,
          never returned.
        </p>

        <div className="meta-bar">
          <div>
            <div className="k">total</div>
            <div className="v">{services.length} services</div>
          </div>
          <div>
            <div className="k">filter</div>
            <div className="v">{q || "none"}</div>
          </div>
          <div>
            <div className="k">signers</div>
            <div className="v">0x5266…4eE6</div>
          </div>
          <div>
            <div className="k">sort</div>
            <div className="v">newest first</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <input
            type="search"
            placeholder="filter by url or rail…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="filter services"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 13,
              padding: "8px 10px",
              border: "1.5px solid var(--blue)",
              background: "var(--paper)",
              color: "var(--ink)",
              minWidth: 280,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <span className="anno">{services.length} match{services.length === 1 ? "" : "es"}</span>
        </div>

        {services.length === 0 ? (
          <p className="muted">
            {q.trim() ? "No matches." : "No services registered yet."}
          </p>
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
      </div>
      <div className="page-foot">
        <span>register: npx @leashed/wallet-cli-platform marketplace register</span>
        <span className="trust">{services.length} of {services.length} · sorted by created_at DESC</span>
      </div>
    </div>
  );
}