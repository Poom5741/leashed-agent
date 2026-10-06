/**
 * Agents tab — read-only mirror of the Leashed Agent marketplace. Pulls the
 * platform's `/v1/services` list so judges can see what AI agent services
 * this wallet can transact with. Clicking a service opens its endpoint in
 * a new tab (judges don't sign x402 receipts from the wallet SPA itself —
 * that's what the platform SPA does).
 */

import { useEffect, useState } from "react";

const PLATFORM_API = "https://leashed-api-agents.poom-a1d.workers.dev";

interface Service {
  id: string;
  endpointUrl: string;
  rail: string;
  priceBase: string;
  token: string;
}

interface ServicesPayload {
  services: Service[];
}

function fmtPrice(priceBase: string, token: string): string {
  // priceBase is in base units (USDM = 6 decimals, THCFI = 6 decimals).
  const n = Number(priceBase);
  if (!Number.isFinite(n)) return `${priceBase} ${token}`;
  const human = n / 1_000_000;
  return `${human.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${token}`;
}

export function AgentsTab() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${PLATFORM_API}/v1/services`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ServicesPayload) => {
        if (!cancelled) setServices(d.services);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="form-section">
      <h3>Agent Marketplace</h3>

      <p className="deposit-note">
        AI agent services this wallet can transact with — paid on-chain with
        the Leashed Agent Platform. Live from the platform API.
      </p>

      {services === null && !error && (
        <p className="muted">Loading services…</p>
      )}

      {error && (
        <div className="warning-banner" style={{ textAlign: "left" }}>
          Could not reach the Leashed Agent API: <code>{error}</code>
        </div>
      )}

      {services && services.length === 0 && (
        <div className="empty-state">
          <p>No services registered yet.</p>
        </div>
      )}

      {services && services.length > 0 && (
        <>
          <div className="agent-list">
            {services.map((s) => (
              <a
                key={s.id}
                href={s.endpointUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="agent-row"
                title={`Open ${s.endpointUrl}`}
              >
                <span className="row-icon rail-badge" data-rail={s.rail}>
                  {s.rail === "cardano-x402" ? "x402" : s.rail === "thaifi-mpp" ? "MPP" : "·"}
                </span>
                <span className="row-main">
                  <span className="row-title">{fmtPrice(s.priceBase, s.token)}</span>
                  <span className="row-sub">{s.endpointUrl}</span>
                </span>
                <span className="row-id">{s.id.slice(0, 8)}</span>
              </a>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 12 }}>
            Source:{" "}
            <a href={`${PLATFORM_API}/v1/services`} target="_blank" rel="noopener noreferrer">
              {PLATFORM_API}/v1/services
            </a>
            . Open the platform SPA at{" "}
            <a href="https://leashed-agent-platform.pages.dev/services" target="_blank" rel="noopener noreferrer">
              leashed-agent-platform.pages.dev/services
            </a>{" "}
            to register a new service or sign receipts.
          </p>
        </>
      )}
    </div>
  );
}