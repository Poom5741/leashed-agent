import { useState } from "react";
import { daccWriteContract } from "dacc-js";
import { parseAbi } from "viem";
import { useWallet } from "../contexts/WalletContext";
import { thaifi } from "../config/chain";
import { Ico } from "./icons";

interface Props {
  onSent?: () => void;
}

export function WriteContract({ onSent }: Props) {
  const { storedWallet, signWithPasskey } = useWallet();
  const [contractAddress, setContractAddress] = useState("");
  const [abiText, setAbiText] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [argsText, setArgsText] = useState("");
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleWrite = async () => {
    if (!storedWallet) return;
    if (!contractAddress || !abiText || !functionName) {
      setError("Contract address, ABI, and function name are required.");
      return;
    }

    try {
      setError(null);
      setTxHash(null);

      // Passkey ceremony at the moment of writing — every time.
      setConfirming(true);
      const passwordSecretkey = await signWithPasskey();
      setConfirming(false);
      setLoading(true);

      const abi = parseAbi(abiText.split("\n").filter(Boolean));
      const args = argsText
        ? argsText.split(",").map((a) => {
            const trimmed = a.trim();
            if (trimmed.startsWith("0x")) return trimmed;
            if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
            return trimmed;
          })
        : [];

      const result = await daccWriteContract({
        daccPublickey: storedWallet.daccPublickey,
        passwordSecretkey,
        network: thaifi,
        contractAddress: contractAddress as `0x${string}`,
        abi,
        functionName,
        args,
        value: value ? parseFloat(value) : undefined,
      });

      setTxHash(result.txHash);
      onSent?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed.";
      setError(message);
    } finally {
      setConfirming(false);
      setLoading(false);
    }
  };

  return (
    <div className="form-section">
      <h3>Write Smart Contract</h3>

      <div className="field">
        <label>Contract Address</label>
        <input
          type="text"
          placeholder="0x..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>
          ABI (one function per line, e.g.{" "}
          <code>function transfer(address to, uint256 amount)</code>)
        </label>
        <textarea
          rows={5}
          placeholder={`function transfer(address to, uint256 amount)`}
          value={abiText}
          onChange={(e) => setAbiText(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Function Name</label>
        <input
          type="text"
          placeholder="transfer"
          value={functionName}
          onChange={(e) => setFunctionName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Arguments (comma-separated, hex and numbers supported)</label>
        <input
          type="text"
          placeholder='0x1234..., 1000000000000000000'
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Value ({thaifi.nativeCurrency.symbol}, optional)</label>
        <input
          type="number"
          step="0.000001"
          placeholder="0.0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loading}
        />
      </div>

      <button className="btn-primary" onClick={handleWrite} disabled={loading || confirming}>
        {confirming ? "Confirm with Passkey…" : loading ? "Sending…" : "Write Contract"}
      </button>

      {error && <p className="error-text">{error}</p>}

      {txHash && (
        <div className="success-box">
          <p><Ico name="check" size={14} /> Transaction sent</p>
          <p>
            <a
              href={`${thaifi.blockExplorers!.default.url}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer
            </a>
          </p>
          <code className="tx-hash">{txHash}</code>
        </div>
      )}
    </div>
  );
}
