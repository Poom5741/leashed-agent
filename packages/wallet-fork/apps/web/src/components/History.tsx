import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import { api, type HistoryItem } from "../lib/api";
import { thaifi } from "../config/chain";
import { TOKENS } from "../config/tokens";

interface HistoryProps {
  /** Render the card header (title + refresh). */
  showHeader?: boolean;
  /** Show only the first N items (preview mode). */
  limit?: number;
}

function formatAmount(item: HistoryItem): string {
  if (item.tokenDecimals === null) return item.amount;
  const value = BigInt(item.amount);
  const num = Number(value) / 10 ** item.tokenDecimals;
  return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatTime(raw: string): string {
  // TIDX timestamps are UTC without a zone suffix ("2026-09-18 10:26:17.000").
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T").replace(/\.\d+$/, "")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Token-transfer history, fetched from the Worker (TIDX indexer).
 * `<History />` — full list with header; `<History limit={5} />` — preview.
 */
export function History({ showHeader = false, limit }: HistoryProps) {
  const { storedWallet } = useWallet();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Client-side token filter (full history view only) — value is a token
  // address in lowercase or "all".
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!storedWallet) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.history(storedWallet.address);
      setItems(result.items);
    } catch (err) {
      // SPA-only deployments have no wallet API (history is an indexer
      // proxy) — explain instead of showing a raw 404.
      const msg = err instanceof Error ? err.message : "Could not load history.";
      setError(
        /404|Not Found|Failed to fetch/i.test(msg)
          ? "Live activity feed needs the wallet API (not part of this deployment). Balances on the Home tab are read directly from the chain."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [storedWallet]);

  useEffect(() => {
    load();
  }, [load]);

  if (!storedWallet) return null;

  const shown = limit
    ? (items ?? []).slice(0, limit)
    : (items ?? []).filter(
        (i) => filter === "all" || (i.token ?? "").toLowerCase() === filter,
      );

  return (
    <div>
      {showHeader && (
        <div className="history-header">
          <h3>Activity</h3>
          <button className="btn-text" onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      )}

      {showHeader && (
        <div className="history-filters">
          <button
            className={`filter-chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {TOKENS.map((t) => (
            <button
              key={t.address}
              className={`filter-chip ${filter === t.address.toLowerCase() ? "active" : ""}`}
              onClick={() => setFilter(t.address.toLowerCase())}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      )}

      {loading && items === null && <p className="history-empty">⏳ Loading transactions…</p>}
      {error && <p className="error-text">{error}</p>}
      {items && items.length === 0 && (
        <p className="history-empty">No token transfers yet — receive some tokens to get started.</p>
      )}
      {items && items.length > 0 && shown.length === 0 && (
        <p className="history-empty">No {filter === "all" ? "" : "token-filtered "}transfers in the latest 50.</p>
      )}

      {shown && shown.length > 0 && (
        <div className="history-list">
          {shown.map((item) => (
            <a
              key={`${item.txHash}-${item.direction}-${item.amount}`}
              className="history-row"
              href={`${thaifi.blockExplorers!.default.url}/tx/${item.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className={`row-icon ${item.direction}`}>{item.direction === "in" ? "↓" : "↑"}</span>
              <span className="row-main">
                <span className="row-title">
                  {item.direction === "in" ? "Received" : "Sent"} {item.tokenSymbol}
                </span>
                <span className="row-sub">
                  {item.direction === "in" ? "from" : "to"} {shorten(item.counterparty)}
                </span>
              </span>
              <span className="row-side">
                <span className={`row-amount ${item.direction}`}>
                  {item.direction === "in" ? "+" : "−"}
                  {formatAmount(item)}
                </span>
                <span className="row-time">{formatTime(item.time)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
