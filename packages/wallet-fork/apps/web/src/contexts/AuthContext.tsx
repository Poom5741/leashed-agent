import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Auth layer — Leashed Agent fork ships in passkey-only mode. The original
 * upstream used LINE / Email OTP to gate the app and key a cloud backup;
 * here the passkey is the boundary. We derive the displayed account label
 * from the on-device wallet state (address prefix + guard) so it reads as
 * "0x1234…F4E4 · passkey" instead of the upstream's anonymous "Local
 * Wallet" placeholder.
 */
type AuthStatus = "authed";

interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser;
  lineEnabled: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ANON_USER: AuthUser = { id: "device", displayName: "Wallet (no address yet)", email: null };

function deriveDisplay(address: string | undefined, guard: string | undefined): string {
  if (!address) return "Wallet (no address yet)";
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const tag = guard === "pin" ? "PIN" : "Passkey";
  return `${short} · ${tag} wallet`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The AuthProvider is mounted ABOVE WalletProvider, so we can't useContext here
  // without a small dance. We read the wallet state via a custom event instead
  // — WalletProvider updates window.__leashedWallet on every state change.
  const [user, setUser] = useState<AuthUser>(ANON_USER);
  useEffect(() => {
    const update = () => {
      const w = (window as unknown as { __leashedWallet?: { address?: string; guard?: string } }).__leashedWallet;
      if (w) setUser({ id: "device", displayName: deriveDisplay(w.address, w.guard), email: null });
    };
    update();
    window.addEventListener("leashed:wallet-changed", update);
    return () => window.removeEventListener("leashed:wallet-changed", update);
  }, []);

  const value: AuthContextValue = {
    status: "authed",
    user,
    lineEnabled: false,
    refresh: async () => undefined,
    logout: async () => undefined,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
