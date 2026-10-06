/** Deposit tab — sub-tabs: Receive (address QR) | Deposit (THB via PromptPay). */

import { useCallback, useEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { useWallet } from "../contexts/WalletContext";
import { TOKENS } from "../config/tokens";
import { api, type PaysoOrder } from "../lib/api";

const DEPOSIT_TOKENS = ["THCFI", "THCOC"] as const;
type DepositToken = (typeof DEPOSIT_TOKENS)[number];

const MIN_THB = 6; // PaySolutions floor
const MAX_THB = 10000;
const QUICK_AMOUNTS = [50, 100, 300, 500];
const POLL_MS = 4000;

type View = "receive" | "deposit";

export function Deposit() {
  const { storedWallet } = useWallet();
  const [view, setView] = useState<View>("receive");
  const [copied, setCopied] = useState(false);

  if (!storedWallet) return null;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(storedWallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="form-section">
      <h3>Deposit</h3>

      <div className="subtabs">
        <button
          className={`subtab${view === "receive" ? " active" : ""}`}
          onClick={() => setView("receive")}
        >
          Receive — รับ token จาก wallet อื่น
        </button>
        <button
          className={`subtab${view === "deposit" ? " active" : ""}`}
          onClick={() => setView("deposit")}
        >
          Deposit — เติมเงินบาท
        </button>
      </div>

      {view === "receive" ? (
        <ReceiveSection address={storedWallet.address} copied={copied} onCopy={copyAddress} />
      ) : (
        <DepositSection address={storedWallet.address} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receive — show address + QR for inbound on-chain transfers

function ReceiveSection({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
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
            {copied ? "✓" : "⧉"}
          </button>
        </div>
      </div>

      <div className="warning-banner" style={{ textAlign: "left" }}>
        🌉 <strong>Bridge USDC — coming soon.</strong> Deposits from BSC and
        other chains will be available here. For now, ThaiFi-side transfers only
        — sending assets from other chains cannot be recovered.
      </div>

      <p className="muted">
        Agents: this address is also shown by{" "}
        <code>thaifi fund</code> and <code>thaifi whoami</code>.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Deposit — PromptPay THB → THCFI/THCOC 1:1

function DepositSection({ address }: { address: string }) {
  const [token, setToken] = useState<DepositToken>("THCFI");
  const [amount, setAmount] = useState("100");
  const [order, setOrder] = useState<PaysoOrder | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const createOrder = async () => {
    setError(null);
    setCreating(true);
    stopPolling();
    try {
      const res = await api.paysoOrder(Number(amount), address, token);
      setOrder(res);
      setStatus("pending");
      setTxHash(null);
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await api.paysoOrderStatus(res.referenceNo);
          setStatus(s.status);
          setTxHash(s.txHash);
          if (s.status === "delivered" || s.status === "capped") stopPolling();
        } catch {
          // transient poll errors are fine — next tick retries
        }
      }, POLL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const resetOrder = () => {
    stopPolling();
    setOrder(null);
    setStatus("pending");
    setTxHash(null);
  };

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum >= MIN_THB && amountNum <= MAX_THB;
  const expiresSoon = order ? order.expiresAt - Date.now() : 0;

  return (
    <>
      <p className="deposit-note">
        เติมเงินบาทผ่าน <strong>PromptPay</strong> แล้วรับ token เข้า wallet
        ทันที อัตรา <strong>1 token = 1 บาท</strong> — token เป็นเครดิตใช้จ่าย
        ไม่ใช่การลงทุน และไม่รับแลกคืนเป็นเงินสด
      </p>

      {!order && (
        <>
          <div className="field">
            <label>เลือก token</label>
            <div className="token-chips">
              {DEPOSIT_TOKENS.map((sym) => {
                const t = TOKENS.find((x) => x.symbol === sym);
                const active = token === sym;
                return (
                  <button
                    key={sym}
                    className={`token-chip${active ? " active" : ""}`}
                    onClick={() => setToken(sym)}
                  >
                    <span className="token-chip-icon" style={{ background: t?.color }}>
                      {t?.badge ?? sym.slice(0, 2)}
                    </span>
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>
              จำนวนเงิน (บาท) — {MIN_THB}–{MAX_THB.toLocaleString()}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_THB}
              max={MAX_THB}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
            />
            <div className="token-chips" style={{ marginTop: "0.5rem" }}>
              {QUICK_AMOUNTS.map((a) => (
                <button key={a} className="token-chip" onClick={() => setAmount(String(a))}>
                  {a} ฿
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" disabled={!amountOk || creating} onClick={createOrder}>
            {creating ? "กำลังสร้าง QR…" : "สร้าง QR พร้อมเพย์"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </>
      )}

      {order && (
        <>
          <div className="qr-wrap" title="PromptPay QR">
            <img src={order.image} alt="PromptPay QR" width={220} height={220} style={{ borderRadius: 8 }} />
          </div>

          <div className="field">
            <label>
              สั่งจ่าย {order.total} บาท → รับ {token} 1 : 1
            </label>
            <div className="address-copy">
              <code className="truncate">Ref: {order.referenceNo}</code>
            </div>
          </div>

          {status === "pending" && (
            <p className="muted" style={{ textAlign: "center" }}>
              📷 สแกน QR ด้วยแอปธนาคาร แล้วรอสักครู่
              {expiresSoon > 0 && (
                <>
                  {" · QR หมดอายุในอีก "}
                  <strong>{Math.max(0, Math.floor(expiresSoon / 60000))} นาที</strong>
                </>
              )}
            </p>
          )}
          {(status === "paid" || status === "delivering") && (
            <p className="muted" style={{ textAlign: "center" }}>
              ✅ ยืนยันการจ่ายแล้ว — กำลังส่ง {token} เข้า wallet…
            </p>
          )}
          {status === "delivered" && (
            <div className="success-box">
              รับ <strong>{order.total} {token}</strong> แล้ว 🎉
              {txHash && (
                <>
                  {" "}
                  <a href={`https://exp.thaifi.com/tx/${txHash}`} target="_blank" rel="noopener">
                    ดูธุรกรรม
                  </a>
                </>
              )}
            </div>
          )}
          {status === "capped" && (
            <div className="warning-banner">
              ถึงขีดจำกัดเติมต่อวัน — ติดต่อทีมงานเพื่อดำเนินการต่อ
            </div>
          )}
          {status !== "delivered" && status !== "capped" && (
            <button className="btn-soft" onClick={resetOrder}>
              ← ยกเลิก / สร้างใหม่
            </button>
          )}
        </>
      )}
    </>
  );
}
