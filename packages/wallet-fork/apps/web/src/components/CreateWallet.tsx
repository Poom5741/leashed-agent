import { useState, useRef } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useTheme, logoFor } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

export function CreateWallet() {
  const { createWallet, platformAuthAvailable, importBackup } = useWallet();
  const [theme] = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // No platform authenticator → PIN-guard wallet (user must accept the risks).
  const pinMode = !platformAuthAvailable;
  const pinValid = /^\d{8}$/.test(pin) && pin === pinConfirm;
  const canCreate = pinMode ? pinValid && consent : true;

  const handleCreate = async () => {
    try {
      setError(null);
      setLoading(true);
      await createWallet(pinMode ? { pin } : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create wallet.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const text = await file.text();
      await importBackup(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import backup.";
      setError(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <div className="card auth-card">
        <img src={logoFor(theme)} alt="Leashed Wallet" className="auth-logo" />
        <h1>Create Leashed Wallet</h1>
        <p className="subtitle">
          A new EVM wallet on ThaiFi (chain 17) will be generated and encrypted
          on this device. No email, no account — your passkey is the only key,
          and no server can move your funds.
        </p>

        {pinMode ? (
          <>
            <div className="warning-banner" style={{ textAlign: "left" }}>
              ⚠ <strong>No passkey in this browser.</strong> Your wallet will be
              protected by an 8-digit PIN instead — significantly weaker than a
              passkey. Anyone with this device or your cloud backup could try to
              guess it, and if you forget the PIN the wallet can never be recovered.
            </div>

            <div className="field" style={{ textAlign: "left" }}>
              <label>8-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={8}
                placeholder="••••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                style={{ textAlign: "center", fontSize: 18, letterSpacing: 8 }}
              />
            </div>
            <div className="field" style={{ textAlign: "left" }}>
              <label>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={8}
                placeholder="••••••••"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                style={{ textAlign: "center", fontSize: 18, letterSpacing: 8 }}
              />
            </div>

            <label className="consent-row">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
              />
              <span>
                I understand and accept these risks. This wallet will only be as
                safe as my PIN.
              </span>
            </label>

            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={loading || !canCreate}
            >
              {loading ? "Creating wallet…" : "Create Wallet with PIN"}
            </button>

            <div className="divider">
              <span>or</span>
            </div>

            <button className="btn-secondary" onClick={handleImportClick}>
              ↧ Import from Backup
            </button>
          </>
        ) : (
          <>
            <div className="info-box">
              <h3>How it works</h3>
              <ol style={{ textAlign: "left", paddingLeft: 18, margin: 0 }}>
                <li>A random secret key is generated locally on your device</li>
                <li>
                  A dacc-js wallet is created from that secret, producing an encrypted key
                  blob (<code>daccPublickey</code>)
                </li>
                <li>
                  Your Passkey derives a symmetric key via the WebAuthn PRF extension, which
                  encrypts the secret
                </li>
                <li>
                  Only your biometrics can unlock the secret and authorize transactions
                </li>
              </ol>
            </div>

            <button className="btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating wallet…" : "Create Wallet"}
            </button>

            <div className="divider">
              <span>or</span>
            </div>

            <button className="btn-secondary" onClick={handleImportClick}>
              ↧ Import from Backup
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
