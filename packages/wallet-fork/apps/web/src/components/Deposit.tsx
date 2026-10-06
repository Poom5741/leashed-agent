/** Deposit tab — Receive (address QR). The PromptPay THB top-up flow from the
 * upstream ThaiFi wallet is removed in this fork: judges have no Thai bank
 * account, and token top-ups run through the platform's x402/MPP rails. */

import { useState } from "react";
import { renderSVG } from "uqr";
import { useWallet } from "../contexts/WalletContext";
import { TOKENS } from "../config/tokens";
import { Ico } from "./icons";

export function Deposit() {
  const { storedWallet } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!storedWallet) return null;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(storedWallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="form-section">
      <h3>Receive</h3>
      <ReceiveSection address={storedWallet.address} copied={copied} onCopy={copyAddress} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receive — show address + QR for inbound on-chain transfers

const FAUCET_API = "https://leashed-api-agents.poom-a1d.workers.dev";

function ReceiveSection({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const [faucetState, setFaucetState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [faucetTx, setFaucetTx] = useState<string | null>(null);

  const claimFaucet = async () => {
    setFaucetState("pending");
    setFaucetMsg(null);
    setFaucetTx(null);
    try {
      const res = await fetch(`${FAUCET_API}/api/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, token: "THCFI" }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; txHash?: string; amount?: number; token?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFaucetTx(data.txHash ?? null);
      setFaucetMsg(`${data.amount} ${data.token} minted to your wallet`);
      setFaucetState("done");
    } catch (err) {
      setFaucetMsg(err instanceof Error ? err.message : "faucet request failed");
      setFaucetState("error");
    }
  };

  return (
    <>
      <p className="deposit-note">
        Receive <strong>pathUSD</strong>, <strong>THCFI</strong> or{" "}
        <strong>THCOC</strong> (or any ThaiFi TIP-20 token) by sending to your
        wallet address below — from another ThaiFi wallet, or from the ThaiFi
        Wallet CLI.
      </p>

      <div className="deposit-tokens">
        {TOKENS.map((t) => (
          <div key={t.address} className="deposit-token-row" title={t.address}>
            <span className="row-icon token-badge" style={{ background: t.color }}>
              {t.badge}
            </span>
            <span className="row-main">
              <span className="row-title">{t.symbol}</span>
              <span className="row-sub">{t.name}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="qr-wrap" title="Wallet address QR code">
        <span className="qr" dangerouslySetInnerHTML={{ __html: renderSVG(address) }} />
      </div>

      <div className="field">
        <label>Your Wallet Address</label>
        <div className="address-copy">
          <code className="truncate">{address}</code>
          <button className="btn-icon" title="Copy address" onClick={onCopy}>
            {copied ? <Ico name="check" size={14} /> : <Ico name="copy" size={14} />}
          </button>
        </div>
      </div>

      <div className="warning-banner" style={{ textAlign: "left" }}>
        <Ico name="shield" size={14} /> <strong>Bridge USDC — coming soon.</strong> Deposits from BSC and
        other chains will be available here. For now, ThaiFi-side transfers only
        — sending assets from other chains cannot be recovered.
      </div>

      <p className="muted">
        Agents: this address is also shown by{" "}
        <code>thaifi fund</code> and <code>thaifi whoami</code>.
      </p>

      <div className="faucet-box">
        <div className="faucet-head">
          <span className="label">Faucet — real on-chain tokens</span>
          <button
            className="btn-soft"
            onClick={claimFaucet}
            disabled={faucetState === "pending"}
          >
            {faucetState === "pending" ? "Minting…" : "Get 25 THCFI"}
          </button>
        </div>
        {faucetState === "done" && (
          <p className="muted">
            {faucetMsg}
            {faucetTx && (
              <>
                {" · "}
                <a href={`https://exp.thaifi.com/tx/${faucetTx}`} target="_blank" rel="noreferrer">
                  view transaction
                </a>
              </>
            )}
          </p>
        )}
        {faucetState === "error" && <p className="error-text">{faucetMsg}</p>}
        <p className="muted" style={{ marginTop: 6 }}>
          Mints 25 THCFI (ThaiFi stable token, 1 = 1 THB) on-chain to this
          address — use it for agent payments on the marketplace. One claim per
          wallet per day.
        </p>
      </div>
    </>
  );
}

