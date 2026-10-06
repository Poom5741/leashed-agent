import { useState } from "react";
import { useWallet } from "../contexts/WalletContext";
import { ConfirmModal } from "./ConfirmModal";
import { Ico } from "./icons";

/**
 * Recovery / Import screen — reached from the Dashboard ("Recover / Import")
 * or automatically when an imported backup needs its recovery password.
 * There is no unlock flow: the dashboard is always available; this screen
 * exists only to restore a wallet onto a new device/domain (re-register the
 * passkey from a backup file) or manage the local wallet.
 */
export function UnlockWallet({ onBack }: { onBack?: () => void }) {
  const { storedWallet, removeWallet, importBackup, recoveryMode, recoverWithPassword, cancelRecovery } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleDeleteConfirm = async () => {
    setConfirmDelete(false);
    await removeWallet();
    onBack?.();
  };

  // Closure-bound dynamic input — survives React re-renders while the OS
  // chooser is open (the mounted-input version dropped selections: F7).
  const handleImportConfirm = () => {
    setConfirmImport(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setError(null);
        await importBackup(await file.text());
        onBack?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to import backup.");
      }
    };
    input.click();
  };

  const handleRecovery = async () => {
    if (!recoveryPassword) return;
    try {
      setRecoveryLoading(true);
      setError(null);
      await recoverWithPassword(recoveryPassword);
      onBack?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recovery failed.";
      setError(message);
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="card">
      <img src={`${import.meta.env.BASE_URL}logo-white.svg`} alt="Leashed Wallet" className="card-logo" />
      <h1>Recover / Import Wallet</h1>
      <p className="subtitle">
        Import a backup file to restore this wallet on a new device or domain —
        the passkey is re-registered here using your recovery password.
      </p>

      {storedWallet && (
        <div className="address-box">
          <span className="label">Current Wallet Address</span>
          <code>{storedWallet.address}</code>
        </div>
      )}

      {recoveryMode ? (
        <div className="recovery-section">
          <div className="warning-banner">
            <Ico name="shield" size={14} /> Passkey not found on this device/domain. Use your recovery password to restore.
          </div>
          <div className="field">
            <label>Recovery Password</label>
            <input
              type="password"
              autoComplete="off"
              data-1p-ignore
              placeholder="Enter the recovery password you set during export"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
              disabled={recoveryLoading}
            />
          </div>
          <button className="btn-primary" onClick={handleRecovery} disabled={recoveryLoading}>
            {recoveryLoading ? "Recovering…" : "Restore with Password"}
          </button>
          <button className="btn-text" onClick={cancelRecovery} style={{ display: "block", margin: "12px auto 0" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="link-row">
          <button className="btn-text" onClick={() => setConfirmImport(true)}>
            <Ico name="download" size={14} /> Import backup file
          </button>
          <button className="btn-text-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <ConfirmModal
        open={confirmDelete}
        title="Delete Wallet"
        message="This deletes the wallet from this device AND its encrypted cloud backup. Without a backup file, this wallet can never be recovered. Continue?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        open={confirmImport}
        title="Import Backup"
        message="Importing a backup will replace the current wallet on this device. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={handleImportConfirm}
        onCancel={() => setConfirmImport(false)}
      />

      {onBack && (
        <button className="btn-text" onClick={onBack} style={{ display: "block", margin: "16px auto 0" }}>
          ← Back to wallet
        </button>
      )}
    </div>
  );
}
