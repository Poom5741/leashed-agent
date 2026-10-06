import { useState, useEffect } from "react";
import { daccSendToken } from "dacc-js";
import { createPublicClient, http, encodeFunctionData, decodeAbiParameters } from "viem";
import { useWallet } from "../contexts/WalletContext";
import { thaifi } from "../config/chain";
import { TOKENS, PATHUSD, findToken } from "../config/tokens";

const client = createPublicClient({
  chain: thaifi,
  transport: http(),
});

async function readDecimals(tokenAddress: string): Promise<number> {
  const data = encodeFunctionData({
    abi: [{ name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
    functionName: "decimals",
  });
  const result = await client.call({
    to: tokenAddress as `0x${string}`,
    data,
  });
  const [dec] = decodeAbiParameters([{ type: "uint8" }], result.data ?? "0x");
  return dec;
}

async function readSymbol(tokenAddress: string): Promise<string> {
  const data = encodeFunctionData({
    abi: [{ name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }],
    functionName: "symbol",
  });
  const result = await client.call({
    to: tokenAddress as `0x${string}`,
    data,
  });
  const [sym] = decodeAbiParameters([{ type: "string" }], result.data ?? "0x");
  return sym;
}

interface Props {
  onSent: () => void;
  /** Token address preselected from the Balances row. */
  initialToken?: string;
  /** pathUSD balance (formatted) — gas for any non-pathUSD transfer. */
  pathUsdBalance?: string | null;
}

export function SendToken({ onSent, initialToken, pathUsdBalance }: Props) {
  const { storedWallet, signWithPasskey } = useWallet();
  // Default to pathUSD — the fee token — so most users can send immediately;
  // the other listed tokens are one click away and any TIP-20/ERC-20 address
  // can still be pasted via "Custom".
  const [tokenAddress, setTokenAddress] = useState<string>(findToken(initialToken ?? "")?.address ?? PATHUSD.address);
  const [custom, setCustom] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [decimals, setDecimals] = useState<number | null>(null);
  const [symbol, setSymbol] = useState<string>("");
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    const known = findToken(tokenAddress);
    if (known) {
      // Listed token — metadata is local, no chain read needed.
      setDecimals(known.decimals);
      setSymbol(known.symbol);
      return;
    }
    if (!tokenAddress || !tokenAddress.startsWith("0x") || tokenAddress.length !== 42) {
      setDecimals(null);
      setSymbol("");
      return;
    }

    let cancelled = false;

    (async () => {
      setFetchingInfo(true);
      try {
        const [dec, sym] = await Promise.all([
          readDecimals(tokenAddress),
          readSymbol(tokenAddress),
        ]);

        if (!cancelled) {
          setDecimals(dec);
          setSymbol(sym);
        }
      } catch {
        if (!cancelled) {
          setDecimals(null);
          setSymbol("");
        }
      } finally {
        if (!cancelled) setFetchingInfo(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  const selectToken = (address: string) => {
    setTokenAddress(address);
    setCustom(!findToken(address));
    setError(null);
    setTxHash(null);
  };

  // Any non-pathUSD transfer still pays gas in pathUSD.
  const isPathUsd = tokenAddress.toLowerCase() === PATHUSD.address.toLowerCase();
  const pathUsdNum = pathUsdBalance ? Number(pathUsdBalance.replace(/,/g, "")) : null;
  const gasBlocked = !isPathUsd && pathUsdNum !== null && !Number.isNaN(pathUsdNum) && pathUsdNum <= 0;

  const handleSend = async () => {
    if (!storedWallet) return;
    if (!tokenAddress || !to || !amount) {
      setError("Please fill in all fields.");
      return;
    }
    if (decimals === null) {
      setError("Could not read token info. Check the token contract address.");
      return;
    }

    try {
      setError(null);
      setTxHash(null);

      // Passkey ceremony at the moment of sending — every time.
      setConfirming(true);
      const passwordSecretkey = await signWithPasskey();
      setConfirming(false);
      setLoading(true);

      const result = await daccSendToken({
        daccPublickey: storedWallet.daccPublickey,
        passwordSecretkey,
        network: thaifi,
        tokenAddress: tokenAddress as `0x${string}`,
        to: to as `0x${string}`,
        amount: parseFloat(amount),
        decimals,
      });

      setTxHash(result.txHash);
      onSent();
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
      <h3>Send Token</h3>

      <div className="field">
        <label>Token</label>
        <div className="token-chips">
          {TOKENS.map((t) => (
            <button
              key={t.address}
              type="button"
              className={`token-chip ${!custom && tokenAddress.toLowerCase() === t.address.toLowerCase() ? "active" : ""}`}
              onClick={() => selectToken(t.address)}
              disabled={loading}
            >
              <span className="token-chip-icon" style={{ background: t.color }}>{t.badge}</span>
              {t.symbol}
            </button>
          ))}
          <button
            type="button"
            className={`token-chip ${custom ? "active" : ""}`}
            onClick={() => {
              setCustom(true);
              setTokenAddress("");
              setDecimals(null);
              setSymbol("");
            }}
            disabled={loading}
          >
            Custom
          </button>
        </div>
        {custom && (
          <>
            <input
              type="text"
              placeholder="Token contract address (0x...)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              disabled={loading}
              style={{ marginTop: 8 }}
            />
            {fetchingInfo && <span className="field-hint">⏳ Reading token info...</span>}
            {!fetchingInfo && decimals !== null && symbol && (
              <span className="field-hint success">{symbol} · {decimals} decimals</span>
            )}
            {!fetchingInfo && tokenAddress.length === 42 && decimals === null && (
              <span className="field-hint error">⚠ Not a valid ERC-20 token</span>
            )}
          </>
        )}
      </div>

      <div className="field">
        <label>Recipient Address</label>
        <input
          type="text"
          placeholder="0x..."
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label>Amount{symbol ? ` (${symbol})` : ""}</label>
        <input
          type="number"
          step="0.000001"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
        />
      </div>

      {gasBlocked && (
        <div className="warning-banner">
          ⛽ <strong>No pathUSD for gas.</strong> Gas is always paid in pathUSD —
          receive some pathUSD first, then send {symbol || "this token"}.
        </div>
      )}

      <button className="btn-primary" onClick={handleSend} disabled={loading || confirming || gasBlocked}>
        {confirming ? "Confirm with Passkey…" : loading ? "Sending…" : `Send${symbol ? ` ${symbol}` : ""}`}
      </button>

      {error && <p className="error-text">{error}</p>}

      {txHash && (
        <div className="success-box">
          <p>◆ Transaction sent</p>
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
