/** Platform top-up (slice 5c) — send testnet stablecoin on Solana devnet or
 * Tempo Moderato to the platform's x402 seller addresses. Users source their
 * own testnet tokens (faucet links provided); this page only needs to show
 * where to send them and prove receipt via public RPC balance reads. */

import { useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { Ico } from "./icons";

const PLATFORM_API = "https://leashed-api-agents.poom-a1d.workers.dev";
const SOLANA_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_RPC = "https://api.devnet.solana.com";
const TEMPO_RPC = "https://rpc.moderato.tempo.xyz";

interface RailInfo {
  network: string;
  label: string;
  payTo: string | null;
  assets?: string[];
}

interface Rails {
  solana: RailInfo | null;
  tempo: RailInfo | null;
}

function usePlatformRails(): Rails | null {
  const [rails, setRails] = useState<Rails | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${PLATFORM_API}/api/chains`)
      .then((r) => r.json() as Promise<{ chains: RailInfo[] }>)
      .then((body) => {
        if (cancelled) return;
        const byNet = new Map(body.chains.map((n) => [n.network, n]));
        setRails({
          solana: byNet.get("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") ?? null,
          tempo: byNet.get("eip155:42431") ?? null,
        });
      })
      .catch(() => { if (!cancelled) setRails({ solana: null, tempo: null }); });
    return () => { cancelled = true; };
  }, []);
  return rails;
}

async function solanaUsdcBalance(owner: string): Promise<string> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
      params: [owner, { mint: SOLANA_USDC_MINT }, { encoding: "jsonParsed" }],
    }),
  });
  const data = (await res.json()) as {
    result?: { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmountString: string } } } } } }> };
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  const amounts = (data.result?.value ?? []).map(
    (a) => Number(a.account.data.parsed.info.tokenAmount.uiAmountString ?? 0),
  );
  return amounts.reduce((a, b) => a + b, 0).toFixed(2);
}

async function tempoNativeBalance(address: string): Promise<string> {
  const res = await fetch(TEMPO_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });
  const data = (await res.json()) as { result?: string; error?: { message: string } };
  if (data.error || !data.result) throw new Error(data.error?.message ?? "RPC unavailable");
  // Tempo denominates gas/native in 6 decimals (USD).
  return (parseInt(data.result, 16) / 1e6).toFixed(2);
}

function TopupRail({ rail, kind, explorerHint }: {
  rail: RailInfo | null;
  kind: "solana" | "tempo";
  explorerHint: string;
}) {
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState<{ state: "idle" | "pending" | "done" | "error"; msg: string | null }>({ state: "idle", msg: null });

  if (!rail?.payTo) {
    return (
      <div className="deposit-token-row" title="platform rail offline">
        <span className="row-icon token-badge" style={{ background: "#6b7280" }}>{kind === "solana" ? "◎" : "◆"}</span>
        <span className="row-main">
          <span className="row-title">{rail?.label ?? (kind === "solana" ? "Solana Devnet" : "Tempo Moderato")}</span>
          <span className="row-sub">deposit address unavailable — platform rail offline</span>
        </span>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(rail.payTo!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const verify = async () => {
    setCheck({ state: "pending", msg: null });
    try {
      const bal = kind === "solana"
        ? await solanaUsdcBalance(rail.payTo!)
        : await tempoNativeBalance(rail.payTo!);
      setCheck({ state: "done", msg: `Platform ${kind === "solana" ? "USDC" : "native"} balance: ${bal}` });
    } catch (err) {
      setCheck({ state: "error", msg: err instanceof Error ? err.message : "balance check failed" });
    }
  };

  return (
    <div className="topup-rail">
      <div className="deposit-token-row" title={rail.payTo}>
        <span className="row-icon token-badge" style={{ background: kind === "solana" ? "#9945ff" : "#1f9d63" }}>
          {kind === "solana" ? "◎" : "◆"}
        </span>
        <span className="row-main">
          <span className="row-title">{rail.label}</span>
          <span className="row-sub">USDC testnet · top up to the platform x402 seller</span>
        </span>
        <button className="btn-icon" title="Copy platform deposit address" onClick={copy}>
          {copied ? <Ico name="check" size={14} /> : <Ico name="copy" size={14} />}
        </button>
      </div>
      <code className="truncate topup-address">{rail.payTo}</code>
      <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
        Get testnet tokens yourself:{" "}
        {kind === "solana" ? (
          <>
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">SOL faucet</a> ·{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle USDC devnet faucet</a>
          </>
        ) : (
          <a href="https://docs.tempo.xyz" target="_blank" rel="noreferrer">Tempo docs · Moderato testnet access</a>
        )}
        {" · "}{explorerHint}
      </p>
      {rail.assets?.includes("PYUSD") && (
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
          <strong>PYUSD also accepted</strong> on this rail — same deposit
          address. Source testnet PYUSD yourself:
          {" "}<a href="https://www.paypal.com/pyusd" target="_blank" rel="noreferrer">paypal.com/pyusd</a>
        </p>
      )}
      <div style={{ marginTop: 6 }}>
        <button className="btn-soft" onClick={verify} disabled={check.state === "pending"}>
          {check.state === "pending" ? "Checking chain…" : "Check platform receipt"}
        </button>
        {check.state === "done" && <p className="muted">{check.msg}</p>}
        {check.state === "error" && <p className="error-text">{check.msg}</p>}
      </div>
    </div>
  );
}

export function PlatformTopup() {
  const rails = usePlatformRails();
  return (
    <div className="form-section">
      <h3>Top up platform — stablecoin testnets</h3>
      <p className="deposit-note">
        Source testnet stablecoins on your own (faucet links below), then send
        them to the platform's deposit address. These addresses are the same
        x402 seller wallets that settle agent marketplace payments.
      </p>
      {!rails ? (
        <p className="muted">loading platform rails…</p>
      ) : (
        <>
          <TopupRail rail={rails.solana} kind="solana" explorerHint="explorer: solscan.io/?cluster=devnet" />
          <TopupRail rail={rails.tempo} kind="tempo" explorerHint="RPC: rpc.moderato.tempo.xyz" />
        </>
      )}
    </div>
  );
}

/** Address QR helper reused from the receive section (kept for parity). */
export function AddressQr({ address }: { address: string }) {
  return <span className="qr" dangerouslySetInnerHTML={{ __html: renderSVG(address) }} />;
}
