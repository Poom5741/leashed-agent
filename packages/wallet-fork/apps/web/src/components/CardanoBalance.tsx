/**
 * Cardano preprod balance checker — paste any addr_test1 address and see
 * the tUSDM + tADA balance via the platform's Worker proxy. The proxy
 * uses the BLOCKFROST_PROJECT_ID secret so the SPA bundle never holds a key.
 *
 * Used on /wallet/ landing (above CreateWallet / UnlockWallet / Dashboard)
 * so judges can verify the just-funded faucet grant without committing
 * to create a wallet on this device.
 */
import { useState, useEffect } from "react";
import { Ico } from "./icons";

// The platform Worker is on the SPA's CORS allowlist (leashed-pages DEFAULT +
// mintworker origin), so a relative path works because the SPA serves from
// /wallet/ under the Pages origin — but it's safer to use the absolute API
// origin so the SPA build env var is the source of truth.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://leashed-api-agents.poom-a1d.workers.dev";

type Balance = {
  ok: boolean;
  address: string;
  network: string;
  lovelace: number;
  txCount: number;
  assetCount: number;
  tokens: Array<{ symbol: string; amount: number }>;
};

export function CardanoBalance() {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Prefill from ?address=… so the faucet page can deep-link here with a
  // verified preprod address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("address");
    if (q) setAddress(q);
  }, []);

  const valid = /^addr_test1[02-9ac-hj-np-z]{53,}$/.test(address.trim());

  const lookup = async () => {
    setState("loading");
    setMessage(null);
    setBalance(null);
    try {
      const r = await fetch(`${API_BASE}/v1/cardano/balance/${encodeURIComponent(address.trim())}`);
      const data = (await r.json()) as Balance & { error?: string };
      if (!r.ok || !data.ok) {
        setState("error");
        setMessage(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setBalance(data);
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "lookup failed");
    }
  };

  const ada = balance ? balance.lovelace / 1_000_000 : 0;
  const tUsdm = balance?.tokens.find((t) => t.symbol === "tUSDM")?.amount ?? 0;

  return (
    <section className="card balance-check" style={{ marginTop: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Ico name="globe" />
        <strong style={{ fontSize: 14 }}>Cardano preprod balance checker</strong>
        <span style={{ color: "var(--ink55)", fontSize: 12, marginLeft: 6 }}>(no wallet required)</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Paste any <code>addr_test1…</code> to see tUSDM (Cardano preprod stablecoin) and tADA on-chain.
        Powered by Blockfrost preprod + the platform faucet grant pipeline.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="addr_test1…"
          spellCheck={false}
          style={{
            flex: "1 1 380px",
            background: "var(--card-2, #E9EBEC)",
            border: "1.5px solid var(--blue, #1F4E79)",
            color: "var(--ink, #17222E)",
            fontFamily: "var(--mono, monospace)",
            fontSize: 13,
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <button
          className="btn-primary"
          onClick={lookup}
          disabled={!valid || state === "loading"}
          style={{ opacity: !valid || state === "loading" ? 0.5 : 1 }}
        >
          {state === "loading" ? "Checking…" : "Check balance"}
        </button>
      </div>
      {state === "done" && balance && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, alignItems: "baseline" }}>
          <span>
            <strong>{ada.toFixed(6)}</strong> <small>tADA</small>
          </span>
          <span style={{ color: tUsdm > 0 ? "var(--success, #23663C)" : "var(--ink55)" }}>
            <strong>{(tUsdm / 1_000_000).toFixed(6)}</strong> <small>tUSDM</small>
            {tUsdm === 0 && <span style={{ marginLeft: 6 }}>— no faucet grant yet</span>}
          </span>
          <span style={{ color: "var(--ink55)" }}>
            <strong>{balance.txCount}</strong> <small>tx</small>
          </span>
          <span style={{ color: "var(--ink55)" }}>
            <strong>{balance.assetCount}</strong> <small>distinct tokens</small>
          </span>
        </div>
      )}
      {state === "error" && (
        <p style={{ color: "var(--danger, #9C3B2C)", fontSize: 13, margin: 0 }}>{message}</p>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
        Don't have an address yet?{" "}
        <a href="/faucet" style={{ color: "var(--blue)" }}>
          Claim 1,000 tUSDM + 5 tADA free →
        </a>
      </p>
    </section>
  );
}