import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/**
 * Auth layer — Leashed Agent fork ships in passkey-only mode. The original
 * upstream used LINE / Email OTP to gate the app and key a cloud backup;
 * here the passkey IS the boundary, so we short-circuit to `authed` and
 * keep the same context shape so downstream code (Logout button, status
 * pill) doesn't need to change.
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

const ANON_DEVICE_USER: AuthUser = {
  id: "device",
  displayName: "Passkey Wallet",
  email: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    status: "authed",
    user: ANON_DEVICE_USER,
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
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
