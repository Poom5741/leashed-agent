/** Public welcome/landing page (anon) — info + sign-in, modeled on wallet.tempo.xyz/welcome. */

import { useEffect, useState, type ReactNode } from "react";
import { useTheme, logoFor } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

interface ChainStats {
  latestBlock: number;
  txCount: number;
  supply: string;
  recent: {
    txHash: string;
    from: string;
    to: string;
    amount: string;
    tokenSymbol: string;
    tokenDecimals: number | null;
    time: string;
  }[];
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function FeatureCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="welcome-feature">
      <span className="welcome-feature-icon">{icon}</span>
      <div>
        <div className="welcome-feature-title">{title}</div>
        <div className="welcome-feature-sub">{children}</div>
      </div>
    </div>
  );
}

const accountKeyInitial = "T";

export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  const [theme] = useTheme();
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [copied, setCopied] = useState(false);

  const agentPrompt =
    "Read https://wallet.thaifi.com/SKILL.md and fund my ThaiFi Wallet";

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the text is selectable anyway
    }
  };

  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => r.json())
      .then((d: ChainStats & { error?: string }) => {
        if (!d.error) setStats(d);
      })
      .catch(() => undefined);
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, []);

  const supplyUsd = stats
    ? "$" +
      (Number(stats.supply) / 1e6).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })
    : "…";

  return (
    <div className="welcome">
      <header className="welcome-topbar">
        <img src={logoFor(theme)} alt="ThaiFi" className="side-logo" />
        <div className="welcome-topbar-right">
          <a className="welcome-toplink" href="/SKILL.md" target="_blank" rel="noreferrer">
            Docs
          </a>
          <ThemeToggle />
          <button className="btn-solid" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      </header>

      <main className="welcome-main">
        <div className="welcome-left">
          <h1 className="welcome-hero">
            Your wallet
            <br />
            for ThaiFi
          </h1>
          <p className="welcome-sub">
            A first-party wallet for ThaiFi balances, transfers, and everyday
            account control — built for people and AI agents.
          </p>

          <div className="welcome-features">
            <FeatureCard
              icon="↑"
              title="Send"
            >
              Move funds on ThaiFi.
            </FeatureCard>
            <FeatureCard
              icon="↓"
              title="Receive"
            >
              Share your wallet address.
            </FeatureCard>
            <FeatureCard
              icon="⌘"
              title="Agent keys"
            >
              Let AI agents spend within on-chain limits.
            </FeatureCard>
            <FeatureCard
              icon="☁"
              title="Cloud backup"
            >
              Restore on any device after sign-in.
            </FeatureCard>
          </div>

          <p className="welcome-footnote">
            Built for <strong>ThaiFi</strong>, with passkey sign-in and on-chain
            account controls in one place.
          </p>

          <div className="welcome-agent">
            <div className="welcome-agent-label">
              Agentic payments — your agent installs the wallet by typing:
            </div>
            <div className="welcome-agent-code">
              <code>{agentPrompt}</code>
              <button className="welcome-agent-copy" onClick={copyPrompt} title="Copy">
                {copied ? "✓" : "⧉"}
              </button>
            </div>
          </div>
        </div>

        <div className="welcome-right">
          <div className="welcome-preview">
            <div className="welcome-preview-head">
              <div>
                <div className="welcome-preview-label">ThaiFi chain — live</div>
                <div className="welcome-preview-balance">{supplyUsd}</div>
              </div>
              <div className="avatar">{accountKeyInitial}</div>
            </div>
            <div className="welcome-preview-actions">
              <span>Block #{stats ? stats.latestBlock.toLocaleString("en-US") : "…"}</span>
              <span>{stats ? stats.txCount.toLocaleString("en-US") + " txs" : "…"}</span>
            </div>
            <div className="welcome-feed-label">Recent transfers</div>
            {stats?.recent?.slice(0, 3).map((t) => (
              <div key={t.txHash + t.to} className="token-row static">
                <span className="row-icon">↑</span>
                <span className="row-main">
                  <span className="row-title">
                    {shorten(t.from)} → {shorten(t.to)}
                  </span>
                  <span className="row-sub">{t.tokenSymbol}</span>
                </span>
                <span className="row-side">
                  <span className="row-amount">
                    {t.tokenDecimals !== null
                      ? (Number(t.amount) / 10 ** t.tokenDecimals).toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })
                      : t.amount}
                  </span>
                </span>
              </div>
            ))}
            {!stats?.recent?.length && (
              <div className="token-row static">
                <span className="row-icon">≡</span>
                <span className="row-main">
                  <span className="row-title">Recent activity</span>
                </span>
              </div>
            )}
            <div className="welcome-preview-note">
              ⌘ Access controls ready — authorize agent keys with on-chain limits.
            </div>
          </div>
        </div>
      </main>

      <footer className="welcome-footer">
        <span>ThaiFi</span>
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
        <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a>
        <a href="https://exp.thaifi.com" target="_blank" rel="noreferrer">Explorer</a>
      </footer>
    </div>
  );
}
