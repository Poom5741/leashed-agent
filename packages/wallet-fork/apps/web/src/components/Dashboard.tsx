import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import { getBalanceToken } from "dacc-js";
import { thaifi } from "../config/chain";
import { TOKENS, PATHUSD } from "../config/tokens";
import { ExportPasswordModal } from "./ExportPasswordModal";
import { SendToken } from "./SendToken";
import { WriteContract } from "./WriteContract";
import { SignMessage } from "./SignMessage";
import { History } from "./History";
import { AuthorizedApps } from "./AuthorizedApps";
import { AgentsTab } from "./AgentsTab";
import { Deposit } from "./Deposit";
import { UnlockWallet } from "./UnlockWallet";
import { downloadBackupFile } from "../lib/backup";
import { useTheme, logoFor } from "../lib/theme";
import { Ico } from "./icons";

type Tab =
  | "home"
  | "history"
  | "apps"
  | "agents"
  | "deposit"
  | "send"
  | "write-contract"
  | "sign-message";

/** Old ?tab= values that now land on the unified Send screen. */
const TAB_ALIASES: Record<string, Tab> = {
  "send-pathusd": "send",
  "send-token": "send",
};

/** Rev-B sheet annotation per tab (docs/design-sketches/wallet-pages). */
const FIG_FOR: Record<Tab, string> = {
  home: "SHEET 03 / HOME · FIG. 3 — PASSBOOK",
  agents: "SHEET 04 / AGENTS · FIG. 4 — MARKETPLACE",
  history: "SHEET 05 / ACTIVITY · FIG. 5 — LEDGER TAPE",
  apps: "SHEET 09 / APPS · FIG. 9 — LEASH HOLDERS",
  deposit: "SHEET 07 / RECEIVE · FIG. 7 — INTAKE",
  send: "SHEET 06 / SEND · FIG. 6 — DISBURSEMENT",
  "write-contract": "SHEET 06B / CONTRACT",
  "sign-message": "SHEET 08 / SIGN · FIG. 8 — ATTESTATION",
};

/* Minimal line icons (lucide-style paths) */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const Icons = {
  home: (
    <Icon>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Icon>
  ),
  activity: (
    <Icon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  ),
  send: (
    <Icon>
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </Icon>
  ),
  token: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.9-2.5.9-2.5 1.9 1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
    </Icon>
  ),
  contract: (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Icon>
  ),
  sign: (
    <Icon>
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </Icon>
  ),
  copy: (
    <Icon>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  ),
  external: (
    <Icon>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14L21 3" />
    </Icon>
  ),
  backup: (
    <Icon>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </Icon>
  ),
  upload: (
    <Icon>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </Icon>
  ),
  logout: (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Icon>
  ),
  receive: (
    <Icon>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Icon>
  ),
  shield: (
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  ),
  key: (
    <Icon>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M11 12l9-9" />
      <path d="M17 6l3 3" />
      <path d="M14 9l2 2" />
    </Icon>
  ),
  bot: (
    <Icon>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4" />
      <path d="M9 16h.01M15 16h.01" />
      <path d="M2 14h2M20 14h2" />
    </Icon>
  ),
  sun: (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  moon: (
    <Icon>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </Icon>
  ),
  refresh: (
    <Icon>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Icon>
  ),
  chevLeft: (
    <Icon>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  ),
};

const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: Icons.home },
  { id: "agents", label: "Agents", icon: Icons.bot },
  { id: "history", label: "Activity", icon: Icons.activity },
  { id: "apps", label: "Authorized Apps", icon: Icons.shield },
  { id: "deposit", label: "Receive", icon: Icons.receive },
  { id: "send", label: "Send", icon: Icons.send },
  { id: "write-contract", label: "Contract", icon: Icons.contract },
  { id: "sign-message", label: "Sign", icon: Icons.sign },
];

const isTab = (value: string | null): value is Tab =>
  NAV.some((n) => n.id === value);

function fmtUsd(value: string | null, maxFrac = 2): string {
  if (value === null) return "—";
  const n = Number(String(value).replace(/,/g, ""));
  if (Number.isNaN(n)) return value;
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

/** "1,234.5 THCFI" style amount (balanceFormatted has no thousands separators). */
function fmtToken(value: string | undefined, symbol: string): string {
  if (value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value + " " + symbol;
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + symbol;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Dashboard() {
  const { storedWallet, exportBackup, cloudSyncedAt, needsBackup, syncToCloud, dismissBackupPrompt } =
    useWallet();
  const { user } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState<Tab>(() => {
    // Trailing slash normalized: Pages 308s /wallet/deposit -> /wallet/deposit/
    const path = window.location.pathname.replace(/\/+$/, "");
    // /wallet/deposit (production) or /deposit (local dev) — derive the base.
    const base = path.startsWith('/wallet') ? '/wallet' : '';
    if (path === `${base}/deposit`) return "deposit";
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (isTab(fromUrl)) return fromUrl;
    return (fromUrl && TAB_ALIASES[fromUrl]) || "home";
  });
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Token preselected for the Send screen (from a Balances row click).
  const [sendToken, setSendToken] = useState<string>(PATHUSD.address);

  const refreshBalance = useCallback(async () => {
    if (!storedWallet) return;
    setBalanceLoading(true);
    try {
      const results = await Promise.all(
        TOKENS.map((t) =>
          getBalanceToken({
            address: storedWallet.address as `0x${string}`,
            tokenAddress: t.address as `0x${string}`,
            network: thaifi,
          })
            .then((r) => [t.address.toLowerCase(), r.balanceFormatted] as const)
            .catch(() => null),
        ),
      );
      setBalances(Object.fromEntries(results.filter((r) => r !== null)));
    } finally {
      setBalanceLoading(false);
    }
  }, [storedWallet]);

  useEffect(() => {
    if (storedWallet) {
      refreshBalance();
    }
  }, [storedWallet, refreshBalance]);

  // After a send, refresh immediately and again a couple of times — the RPC
  // node may still report the pre-tx balance for a moment right after the receipt.
  const handleSent = useCallback(() => {
    void refreshBalance();
    window.setTimeout(() => void refreshBalance(), 3_000);
    window.setTimeout(() => void refreshBalance(), 8_000);
  }, [refreshBalance]);

  const handleExport = async (recoveryPassword: string) => {
    if (!storedWallet) return;
    try {
      setExporting(true);
      const json = await exportBackup(recoveryPassword);
      downloadBackupFile(json, storedWallet);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
      setShowExportModal(false);
    }
  };

  const handleCloudSync = async (recoveryPassword: string) => {
    try {
      setSyncing(true);
      await syncToCloud(recoveryPassword);
    } catch (err) {
      console.error("Cloud sync error:", err);
      alert(err instanceof Error ? err.message : "Cloud sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const copyAddress = async () => {
    if (!storedWallet) return;
    await navigator.clipboard.writeText(storedWallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /** Account menu — rendered in the desktop sidebar and the mobile dropdown. */
  const menuButtons = (onAfter?: () => void) => (
    <div className="side-menu">
      <button className="side-menu-item" onClick={() => { copyAddress(); onAfter?.(); }}>
        <span className="side-label">{Icons.copy} Copy address</span>
        <span className="side-sub">{copied ? "Copied" : shorten(storedWallet.address)}</span>
      </button>
      <a
        className="side-menu-item"
        href={`${thaifi.blockExplorers!.default.url}/address/${storedWallet.address}`}
        target="_blank"
        rel="noreferrer"
        onClick={onAfter}
      >
        <span className="side-label">{Icons.external} View on explorer</span>
      </a>
      <button className="side-menu-item" onClick={toggleTheme}>
        <span className="side-label">
          {theme === "dark" ? Icons.sun : Icons.moon} {theme === "dark" ? "Light mode" : "Dark mode"}
        </span>
      </button>
      <button
        className="side-menu-item"
        onClick={() => { setShowExportModal(true); onAfter?.(); }}
        disabled={exporting}
      >
        <span className="side-label">{Icons.backup} Backup file</span>
      </button>
      <button
        className="side-menu-item"
        onClick={() => { setShowRecover(true); setTab("home"); onAfter?.(); }}
      >
        <span className="side-label">{Icons.upload} Recover / Import</span>
      </button>
    </div>
  );

  if (!storedWallet) return null;

  const accountName = user?.displayName ?? user?.email ?? "Signed in";
  const accountInitial = accountName.charAt(0).toUpperCase();

  const closeMenu = () => setMenuOpen(false);

  const openSend = (tokenAddress?: string) => {
    if (tokenAddress) setSendToken(tokenAddress);
    setTab("send");
    setShowRecover(false);
  };

  const pathUsdBalance = balances[PATHUSD.address.toLowerCase()] ?? null;

  return (
    <div className="shell">
      <span className="crosshair crosshair-bl" aria-hidden />
      <span className="crosshair crosshair-br" aria-hidden />
      {/* Mobile top bar — Tempo-style: logo (→ Home) + avatar (opens the account menu) */}
      <div className="topbar">
        <button
          className="topbar-logo-btn"
          onClick={() => {
            setTab("home");
            setShowRecover(false);
            closeMenu();
          }}
          aria-label="Go to Home"
        >
          <img src={logoFor(theme)} alt="ThaiFi" className="side-logo" />
        </button>
        <button className="avatar avatar-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          {accountInitial}
        </button>
      </div>

      <aside className="sidebar">
        <div className="wallet-chip">
          <div className="chip-avatar">{Icons.key}</div>
          <div className="chip-main">
            <div className="chip-addr">{shorten(storedWallet.address)}</div>
            <div className="chip-net">ThaiFi · chain {thaifi.id}</div>
          </div>
        </div>
        <div className={`guard-pill ${storedWallet.guard === "pin" ? "pin" : ""}`}>
          {Icons.shield} {storedWallet.guard === "pin" ? "PIN guard" : "Passkey guard"}
        </div>

        <div className="sec-label">Wallet</div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`side-btn ${tab === n.id && !showRecover ? "active" : ""}`}
              onClick={() => {
                setTab(n.id);
                setShowRecover(false);
              }}
            >
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="sec-label">Actions</div>
          {menuButtons()}

          <div className="account-chip">
            <div className="avatar">{accountInitial}</div>
            <span>{accountName}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="sheet-head">
          <span>Trust Layer · Leashed Wallet</span>
          <span className="fig-note">{showRecover ? "SHEET 02 / UNLOCK · FIG. 2 — KEY UNSEAL" : FIG_FOR[tab]}</span>
        </div>
        {showRecover ? (
          <UnlockWallet onBack={() => setShowRecover(false)} />
        ) : (
          <>
            {tab !== "home" && (
              <button className="back-btn" onClick={() => setTab("home")}>
                <Ico name="chevLeft" size={14} /> Home
              </button>
            )}
            {tab === "home" && (
              <>
                <span className="balance-label">Total balance</span>
                <h1 className="balance-big">{fmtUsd(pathUsdBalance)}</h1>
                <div className="actions-row">
                  <button className="btn-solid" onClick={() => openSend()}>
                    {Icons.send} Send
                  </button>
                  <button className="btn-soft" onClick={copyAddress}>
                    {Icons.copy} Copy address
                  </button>
                  <button className="btn-soft" onClick={refreshBalance} disabled={balanceLoading}>
                    <Ico name="refresh" size={14} /> Refresh
                  </button>
                </div>

                <section className="card">
                  <div className="card-header">
                    <h3>Balances</h3>
                  </div>
                  {TOKENS.map((t) => (
                    <button
                      key={t.address}
                      className="token-row"
                      onClick={() => openSend(t.address)}
                      title={`Send ${t.symbol}`}
                    >
                      <span className="row-icon token-badge" style={{ background: t.color }}>
                        {t.badge}
                      </span>
                      <span className="row-main">
                        <span className="row-title">{t.symbol}</span>
                        <span className="row-sub">{t.sub}</span>
                      </span>
                      <span className="row-side">
                        <span className="row-amount">
                          {t === PATHUSD
                            ? fmtUsd(balances[t.address.toLowerCase()] ?? null)
                            : fmtToken(balances[t.address.toLowerCase()], t.symbol)}
                        </span>
                      </span>
                    </button>
                  ))}
                </section>

                <section className="card">
                  <div className="card-header">
                    <h3>Activity</h3>
                    <button className="card-link" onClick={() => setTab("history")}>
                      View all
                    </button>
                  </div>
                  <History limit={5} />
                </section>

                <p className="muted">
                  {needsBackup
                    ? <><Ico name="cloud" size={14} /> Cloud sync pending — set your recovery password to enable automatic backup</>
                    : cloudSyncedAt
                      ? <><Ico name="cloud" size={14} /> Cloud backup synced {new Date(cloudSyncedAt).toLocaleString()}</>
                      : <><Ico name="cloud" size={14} /> Cloud backup not synced yet</>}
                </p>
              </>
            )}

            {tab === "history" && (
              <>
                <h1 className="page-title">Activity</h1>
                <section className="card">
                  <History showHeader />
                </section>
              </>
            )}

            {tab === "agents" && (
              <>
                <h1 className="page-title">Agents</h1>
                <section className="card">
                  <AgentsTab />
                </section>
              </>
            )}

            {tab === "apps" && (
              <>
                <h1 className="page-title">Authorized Apps</h1>
                <section className="card">
                  <AuthorizedApps />
                </section>
              </>
            )}

            {tab === "deposit" && (
              <>
                <h1 className="page-title">Deposit</h1>
                <section className="card">
                  <Deposit />
                </section>
              </>
            )}

            {tab === "send" && (
              <>
                <h1 className="page-title">Send</h1>
                <section className="card">
                  <SendToken
                    onSent={handleSent}
                    initialToken={sendToken}
                    pathUsdBalance={pathUsdBalance}
                  />
                </section>
              </>
            )}

            {tab === "write-contract" && (
              <>
                <h1 className="page-title">Contract</h1>
                <section className="card">
                  <WriteContract onSent={handleSent} />
                </section>
              </>
            )}

            {tab === "sign-message" && (
              <>
                <h1 className="page-title">Sign Message</h1>
                <section className="card">
                  <SignMessage />
                </section>
              </>
            )}
          </>
        )}
      </main>

      <ExportPasswordModal
        open={showExportModal}
        onConfirm={handleExport}
        onCancel={() => setShowExportModal(false)}
      />

        <ExportPasswordModal
          open={needsBackup}
          title="Set up Cloud Sync"
          confirmLabel={syncing ? "Syncing…" : "Save & Sync"}
          onConfirm={handleCloudSync}
          onCancel={dismissBackupPrompt}
          message={
            <p style={{ marginBottom: 12 }}>
              Your wallet will sync automatically to your account
              {" "}<strong>({accountName})</strong> so you can restore it on any
              device after signing in. Set the recovery password used to encrypt
              the backup — it is the only way to restore on a new device.
            </p>
          }
        />

        {/* Mobile account menu (Tempo-style dropdown under the avatar) */}
        {menuOpen && (
          <div className="menu-overlay" onClick={closeMenu}>
            <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
              <div className="menu-account">
                <div className="avatar">{accountInitial}</div>
                <div className="menu-account-info">
                  <span className="menu-account-name">{accountName}</span>
                  {user?.email && <span className="menu-account-sub">{user.email}</span>}
                </div>
              </div>
              <div className="side-menu">
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    className={`side-menu-item ${tab === n.id && !showRecover ? "active" : ""}`}
                    onClick={() => {
                      setTab(n.id);
                      setShowRecover(false);
                      closeMenu();
                    }}
                  >
                    <span className="side-label">{n.icon} {n.label}</span>
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              {menuButtons(closeMenu)}
            </div>
          </div>
        )}
    </div>
  );
}
