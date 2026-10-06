/** Authorized Apps — list/revoke CLI agent keys paired with this account. */

import { useCallback, useEffect, useState } from "react";
import { formatUnits, http } from "viem";
import { daccWriteContract } from "dacc-js";
import { createClient, tempoActions } from "viem/tempo";
import { useWallet } from "../contexts/WalletContext";
import { api } from "../lib/api";
import { thaifi } from "../config/chain";
import { TOKENS, PATHUSD } from "../config/tokens";
import { Addresses } from "viem/tempo";

const accountKeychain = Addresses.accountKeychain;

// Read client — fetches remaining spend limits straight from the chain.
const readClient = createClient({
  chain: thaifi,
  transport: http(thaifi.rpcUrls.default.http[0]),
}).extend(tempoActions());

interface Pair {
  id: string;
  keyId: string;
  keyType: string;
  name: string;
  userAddress: string | null;
  expiry: number | null;
  limitAmount: string | null;
  limitPeriod: number | null;
  createdAt: number;
}

const revokeAbi = [
  {
    name: "revokeKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "keyId", type: "address" }],
    outputs: [],
  },
] as const;

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** keyId → token address (lowercase) → remaining, or null when the key is revoked. */
type RemainingMap = Record<string, Record<string, string | null> | null>;

export function AuthorizedApps() {
  const { storedWallet, signWithPasskey } = useWallet();
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [remaining, setRemaining] = useState<RemainingMap>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storedWallet) return;
    setError(null);
    try {
      const { pairs: list } = await api.listPairs();
      setPairs(list);

      // Remaining spend limit per key, for each supported token (on-chain read).
      const entries = await Promise.all(
        list.map(async (p) => {
          const per = await Promise.all(
            TOKENS.map(async (t) => {
              try {
                const res = await readClient.accessKey.getRemainingLimit({
                  account: storedWallet.address as `0x${string}`,
                  accessKey: p.keyId as `0x${string}`,
                  token: t.address as `0x${string}`,
                });
                return [t.address.toLowerCase(), formatUnits(res.remaining, 6)] as const;
              } catch {
                return [t.address.toLowerCase(), null] as const;
              }
            }),
          );
          // Every token read failing means the key itself is gone (revoked/expired).
          const allFailed = per.every(([, v]) => v === null);
          return [p.keyId, allFailed ? null : Object.fromEntries(per)] as const;
        }),
      );
      setRemaining(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load apps.");
    }
  }, [storedWallet]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (pair: Pair) => {
    if (!storedWallet) return;
    if (
      !confirm(
        `Revoke "${pair.name}" (${pair.keyId})? The CLI will lose on-chain access immediately.`,
      )
    )
      return;
    try {
      setBusyKey(pair.keyId);
      const passwordSecretkey = await signWithPasskey();
      await daccWriteContract({
        daccPublickey: storedWallet.daccPublickey,
        passwordSecretkey,
        network: thaifi,
        contractAddress: accountKeychain,
        abi: revokeAbi,
        functionName: "revokeKey",
        args: [pair.keyId as `0x${string}`],
      });
      await api.deletePair(pair.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Apps and CLIs authorized to sign for your wallet. Spending is capped
        on-chain per key.
      </p>

      {error && <p className="error-text">{error}</p>}
      {pairs && pairs.length === 0 && (
        <p className="history-empty">
          No authorized apps yet. Run <code>thaifi login</code> in your terminal
          and approve the pairing here.
        </p>
      )}

      {pairs && pairs.length > 0 && (
        <div className="history-list">
          {pairs.map((p) => (
            <div key={p.id} className="history-row">
              <span className="row-icon">⌘</span>
              <span className="row-main">
                <span className="row-title">{p.name}</span>
                <span className="row-sub">
                  {shorten(p.keyId)} · {p.keyType} · expires{" "}
                  {p.expiry ? new Date(p.expiry * 1000).toLocaleDateString() : "never"}
                </span>
              </span>
              <span className="row-side">
                {remaining[p.keyId] === undefined ? (
                  <span className="row-amount">…</span>
                ) : remaining[p.keyId] === null ? (
                  <span className="row-amount">revoked</span>
                ) : (
                  <span className="limit-lines">
                    {TOKENS.map((t) => {
                      const v = remaining[p.keyId]?.[t.address.toLowerCase()] ?? null;
                      return (
                        <span key={t.address} className="limit-line">
                          {t.symbol} {t === PATHUSD ? "$" : ""}
                          {v ?? "—"}
                        </span>
                      );
                    })}
                  </span>
                )}
                <button
                  className="btn-text-danger"
                  onClick={() => handleRevoke(p)}
                  disabled={busyKey === p.keyId}
                >
                  {busyKey === p.keyId ? "…" : "Revoke"}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
