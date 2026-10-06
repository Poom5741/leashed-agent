import { useState, useRef } from "react";
import { useWallet } from "../contexts/WalletContext";
import { ConfirmModal } from "./ConfirmModal";
import { useTheme, logoFor } from "../lib/theme";
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
  const [theme] = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteConfirm = async () => {
    setConfirmDelete(false);
    await removeWallet();
    onBack?.();
  };

  const handleImportConfirm = () => {
    setConfirmImport(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const text = await file.text();
      await importBackup(text);
      onBack?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import backup.";
      setError(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
      <img src={logoFor(theme)} alt="Leashed Wallet" className="card-logo" />
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

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

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
