import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { WalletProvider, useWallet } from "./contexts/WalletContext";
import { CreateWallet } from "./components/CreateWallet";
import { UnlockWallet } from "./components/UnlockWallet";
import { Dashboard } from "./components/Dashboard";
import { PairApprove } from "./components/PairApprove";
import { CardanoBalance } from "./components/CardanoBalance";
import "./App.css";

// Derive /wallet mount once at module load (App.tsx is the only entry point
// for the wallet flow — main.tsx renders Legal pages at /privacy or
// /wallet/privacy, then everything else hits this file).
const BASE = window.location.pathname.replace(/\/+$/, "").startsWith('/wallet') ? '/wallet' : '';

function WalletFlow() {
  const { status, recoveryMode } = useWallet();

  if (status === "loading") {
    return (
      <div className="app-root">
        <div className="loading-screen">
          <div className="spinner" />
          <p>Loading wallet...</p>
        </div>
      </div>
    );
  }

  // CLI pairing approval (/pair?id=…&code=… or /wallet/pair?… ) — requires a
  // wallet on this device.
  if (window.location.pathname.replace(/\/+$/, "") === `${BASE}/pair`) {
    if (recoveryMode) {
      return (
        <div className="app-root">
          <UnlockWallet />
        </div>
      );
    }
    if (status === "ready") {
      return (
        <div className="auth-screen">
          <PairApprove />
        </div>
      );
    }
    return (
      <div className="auth-screen">
        <div className="card auth-card">
          <h1>Wallet required</h1>
          <p className="subtitle">
            Create or restore a wallet on this device first — then approve the
            pairing.
          </p>
        </div>
      </div>
    );
  }

  // If in recovery mode, show UnlockWallet (which handles recovery UI)
  if (recoveryMode) {
    return (
      <div className="app-root">
        <UnlockWallet />
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="app-root">
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
          <CardanoBalance />
          <CreateWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <Dashboard />
    </div>
  );
}

function AppContent() {
  const { status: authStatus } = useAuth();

  // AuthContext is now a no-op that always returns "authed" — the passkey
  // (in WalletProvider below) is the real boundary. Judges land directly on
  // CreateWallet / UnlockWallet / Dashboard with no login screen.
  if (authStatus !== "authed") {
    return (
      <div className="app-root">
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return <WalletFlow />;
}

export default function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </AuthProvider>
  );
}
