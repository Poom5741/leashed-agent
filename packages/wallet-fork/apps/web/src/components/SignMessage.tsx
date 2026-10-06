import { useState } from "react";
import { daccSignMessage } from "dacc-js";
import { useWallet } from "../contexts/WalletContext";
import { thaifi } from "../config/chain";

export function SignMessage() {
  const { storedWallet, signWithPasskey } = useWallet();
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const handleSign = async () => {
    if (!storedWallet) return;
    if (!message) {
      setError("Please enter a message to sign.");
      return;
    }

    try {
      setError(null);
      setSignature(null);

      // Passkey ceremony at the moment of signing — every time.
      setConfirming(true);
      const passwordSecretkey = await signWithPasskey();
      setConfirming(false);
      setLoading(true);

      const result = await daccSignMessage({
        daccPublickey: storedWallet.daccPublickey,
        passwordSecretkey,
        network: thaifi,
        message,
      });

      setSignature(result.signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signing failed.";
      setError(message);
    } finally {
      setConfirming(false);
      setLoading(false);
    }
  };

  return (
    <div className="form-section">
      <h3>Sign Message</h3>

      <div className="field">
        <label>Message</label>
        <textarea
          rows={4}
          placeholder="Enter message to sign..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
        />
      </div>

      <button className="btn-primary" onClick={handleSign} disabled={loading || confirming}>
        {confirming ? "Confirm with Passkey…" : loading ? "Signing…" : "Sign Message"}
      </button>

      {error && <p className="error-text">{error}</p>}

      {signature && (
        <div className="success-box">
          <p>◆ Message signed</p>
          <label>Signature:</label>
          <textarea readOnly rows={4} value={signature} className="signature-output" />
        </div>
      )}
    </div>
  );
}
