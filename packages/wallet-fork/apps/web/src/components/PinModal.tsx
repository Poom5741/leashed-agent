import { useState, type ReactNode } from "react";

interface PinModalProps {
  open: boolean;
  title?: string;
  message?: ReactNode;
  /** Async so the parent can verify the PIN; throw to show an error and stay open. */
  onSubmit: (pin: string) => Promise<void>;
  onCancel: () => void;
}

/** 8-digit PIN prompt (used when no passkey is available — PIN-guard wallets). */
export function PinModal({ open, title = "Enter PIN", message, onSubmit, onCancel }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (pin.length !== 8) {
      setError("PIN must be exactly 8 digits.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await onSubmit(pin);
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid PIN.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setPin("");
    setError("");
    setBusy(false);
    onCancel();
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">
          {message && <p style={{ marginBottom: 12 }}>{message}</p>}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            placeholder="••••••••"
            value={pin}
            disabled={busy}
            autoFocus
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && pin.length === 8 && handleConfirm()}
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }}
          />
          {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-modal-confirm"
            onClick={handleConfirm}
            disabled={busy || pin.length !== 8}
          >
            {busy ? "Checking…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
