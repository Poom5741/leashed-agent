import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type AuthUser } from "../lib/api";

/**
 * Account layer (LINE / Email OTP) — gates the app and keys the cloud
 * backup. Deliberately separate from WalletContext: login identifies the
 * user, the passkey still guards every piece of key material.
 */
type AuthStatus = "checking" | "anon" | "authed";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  lineEnabled: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lineEnabled, setLineEnabled] = useState(false);

  const refresh = useCallback(async () => {
    const [me, config] = await Promise.all([
      api.me(),
      api.config().catch(() => ({ lineEnabled: false, appName: "ThaiFi Wallet" })),
    ]);
    setLineEnabled(config.lineEnabled);
    if (me.user) {
      setUser(me.user);
      setStatus("authed");
    } else {
      setUser(null);
      setStatus("anon");
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setStatus("anon"));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setStatus("anon");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, lineEnabled, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
