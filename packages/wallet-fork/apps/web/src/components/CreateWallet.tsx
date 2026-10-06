import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import { ThemeToggle } from "./ThemeToggle";
import { Ico } from "./icons";

export function CreateWallet() {
  const { createWallet, platformAuthAvailable, importBackup } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [consent, setConsent] = useState(false);

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

  // The file input is created per-click and held by this closure — if React
  // re-renders while the OS chooser is open, the selection still lands (the
  // mounted-input version silently dropped the change event: Rakazo F7).
  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setError(null);
        await importBackup(await file.text());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to import backup.");
      }
    };
    input.click();
  };

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <div className="card auth-card">
        <img src={`${import.meta.env.BASE_URL}logo-white.svg`} alt="Leashed Wallet" className="auth-logo" />
        <h1>Create Leashed Wallet</h1>
        <p className="subtitle">
          A new EVM wallet on ThaiFi (chain 17) will be generated and encrypted
          on this device. No email, no account — your passkey is the only key,
          and no server can move your funds.
        </p>

        {pinMode ? (
          <>
            <div className="warning-banner" style={{ textAlign: "left" }}>
              <Ico name="shield" size={14} /> <strong>No passkey in this browser.</strong> Your wallet will be
              protected by an 8-digit PIN instead — significantly weaker than a
              passkey. Anyone with this device or your cloud backup could try to
              guess it, and if you forget the PIN the wallet can never be recovered.
            </div>

            <div className="field" style={{ textAlign: "left" }}>
              <label>8-digit PIN</label>
              <input
                type="password"
                autoComplete="off"
                data-1p-ignore
                inputMode="numeric"
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
                autoComplete="off"
                data-1p-ignore
                inputMode="numeric"
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
              <Ico name="download" size={14} /> Import from Backup
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
              <Ico name="download" size={14} /> Import from Backup
            </button>
          </>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
