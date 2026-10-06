import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useState } from "react";
import { WalletProvider, useWallet } from "./contexts/WalletContext";
import { CreateWallet } from "./components/CreateWallet";
import { UnlockWallet } from "./components/UnlockWallet";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { Welcome } from "./components/Welcome";
import { PairApprove } from "./components/PairApprove";
import "./App.css";

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

  // CLI pairing approval (/pair?id=…&code=…) — requires a wallet on this device.
  if (window.location.pathname === "/pair") {
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
        <CreateWallet />
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
  const [showLogin, setShowLogin] = useState(false);

  if (authStatus === "checking") {
    return (
      <div className="app-root">
        <div className="loading-screen">
          <div className="spinner" />
          <p>Checking session...</p>
        </div>
      </div>
    );
  }

  // Anonymous → public welcome page, then the sign-in form.
  // Direct links (/deposit, /pair) skip the landing — sign in first, then
  // the app lands on the requested page.
  if (authStatus === "anon") {
    const path = window.location.pathname;
    const direct = path === "/deposit" || path === "/pair";
    return (
      <div className="app-root">
        {direct || showLogin ? (
          <Login />
        ) : (
          <Welcome onSignIn={() => setShowLogin(true)} />
        )}
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
