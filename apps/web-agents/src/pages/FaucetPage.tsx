import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api/client.js";

const ADDR_RE = /^addr_test1[02-9ac-hj-np-z]{53,}$/;

export function FaucetPage() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const valid = ADDR_RE.test(address.trim());

  const claim = async () => {
    setState("pending");
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/v1/faucet/cardano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState("done");
      setMessage(
        "1,000 tUSDM + 5 tADA granted — they arrive on Cardano preprod within a few minutes. Search your address on preprod.cardanoscan.io to verify.",
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "claim failed");
    }
  };

  return (
    <section className="card">
      <span className="fig-tag">FAUCET · REAL TOKENS</span>
      <h2 style={{ marginTop: 0 }}>Get test tokens — Cardano preprod</h2>
      <p className="muted" style={{ maxWidth: "64ch" }}>
        Judges and new users need funds to try the marketplace. Enter a Cardano
        <strong> preprod testnet</strong> address (<code>addr_test1…</code>) and
        we grant <strong>1,000 tUSDM</strong> (test stablecoin, 1:1 USD — the same
        asset the x402 marketplace quotes) plus <strong>5 tADA</strong> for
        fees. One claim per address per day. Real on-chain transfers on the
        Cardano preprod testnet — verify everything on{" "}
        <a
          href="https://preprod.cardanoscan.io"
          target="_blank"
          rel="noreferrer"
        >
          preprod.cardanoscan.io
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0 8px" }}>
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
          onClick={claim}
          disabled={!valid || state === "pending"}
          style={{ opacity: !valid || state === "pending" ? 0.5 : 1 }}
        >
          {state === "pending" ? "Claiming…" : "Claim 1,000 tUSDM"}
        </button>
      </div>
      {!valid && address.length > 0 && (
        <p className="muted" style={{ color: "var(--danger, #9C3B2C)" }}>
          Address must be a Cardano <strong>preprod testnet</strong> address
          starting with <code>addr_test1</code> — create one in Lace or Eternl
          (testnet mode), or paste one you already have.
        </p>
      )}
      {state === "done" && (
        <>
          <p style={{ color: "var(--success, #23663C)" }}>{message}</p>
          {/* Discoverability loop: after claiming, judges need to know where
              to actually USE the tokens. Point at the marketplace. */}
          <p style={{ marginTop: 12 }}>
            <Link
              to="/services"
              style={{
                color: "var(--blue)",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              → Now try the marketplace
            </Link>
            <span style={{ color: "var(--ink55)", marginLeft: 8 }}>
              (4 live services, in tokened tUSDM/USDM/THCFI)
            </span>
          </p>
        </>
      )}
      {state === "error" && (
        <p style={{ color: "var(--danger, #9C3B2C)" }}>{message}</p>
      )}
      <p className="muted" style={{ marginTop: 18, fontSize: 12.5 }}>
        Need a wallet?{" "}
        <a href="https://www.lace.io/" target="_blank" rel="noreferrer">
          Lace
        </a>{" "}
        or{" "}
        <a href="https://eternl.io/" target="_blank" rel="noreferrer">
          Eternl
        </a>{" "}
        both support preprod testnet mode. The claim is powered by Moneta's
        public CIP-99 testnet campaign — no registration, no mainnet funds.
      </p>
    </section>
  );
}
