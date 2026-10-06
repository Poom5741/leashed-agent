/** /pair — approve a Leashed Wallet CLI pairing (passkey/PIN-guard wallet). */

import { useEffect, useState } from "react";
import { http, parseUnits, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { allowDaccWallet, getBalanceToken } from "dacc-js";
import { createClient, tempoActions, Addresses, Abis } from "viem/tempo";
import { useWallet } from "../contexts/WalletContext";
import { thaifi, thaifiTempo } from "../config/chain";
import { TOKENS, PATHUSD, type TokenInfo } from "../config/tokens";
import { Ico } from "./icons";

const accountKeychain = Addresses.accountKeychain;
// authorizeKey(address keyId, uint8 signatureType, (uint64,bool,(address,uint256)[],bool,[]) config)
const authorizeKeyAbi = (Abis.accountKeychain as unknown as {
  name: string;
  inputs: unknown[];
}[]).filter((item) => item.name === "authorizeKey" && item.inputs.length === 3) as unknown as Abi;

/** Gas costs ~0.003 token/tx — require at least this much before attempting. */
const GAS_MIN_UNITS = 10_000n;

function fmtUnits(v: bigint): string {
  return (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface PairingStatus {
  status: string;
  keyId: string;
  name: string;
  userAddress?: string;
  expiry?: number;
  limitAmount?: string;
  limitPeriod?: number;
}

const DAY = 60 * 60 * 24;

export function PairApprove() {
  const { storedWallet, signWithPasskey } = useWallet();
  const [info, setInfo] = useState<PairingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(TOKENS.map((t) => [t.address, t.defaultLimit])),
  );
  const [periodDays, setPeriodDays] = useState("30");
  const [expiryDays, setExpiryDays] = useState("90");

  // Fee-token pick: pathUSD if funded, else THCFI, else THCOC; null = nothing
  // to pay gas with (block the approve and point the user at Deposit).
  const [feeToken, setFeeToken] = useState<TokenInfo | null>(null);
  const [feeChecked, setFeeChecked] = useState(false);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  const pairingId = new URLSearchParams(window.location.search).get("id") ?? "";

  useEffect(() => {
    if (!pairingId) {
      setError("Missing pairing id in the URL.");
      return;
    }
    fetch(`/api/agent/pair/status/${pairingId}`)
      .then((r) => r.json())
      .then((data: PairingStatus & { error?: string }) => {
        if (data.error) setError(data.error);
        else setInfo(data);
      })
      .catch(() => setError("Could not load the pairing."));
  }, [pairingId]);

  useEffect(() => {
    if (!storedWallet) return;
    Promise.all(
      TOKENS.map((t) =>
        getBalanceToken({
          address: storedWallet.address as `0x${string}`,
          tokenAddress: t.address as `0x${string}`,
          network: thaifi,
        })
          .then((r) => [t, BigInt(r.balance)] as const)
          .catch(() => [t, 0n] as const),
      ),
    )
      .then((entries) => {
        const b = Object.fromEntries(entries.map(([t, v]) => [t.address, v]));
        setBalances(b);
        setFeeToken(TOKENS.find((t) => (b[t.address] ?? 0n) >= GAS_MIN_UNITS) ?? null);
        setFeeChecked(true);
      })
      .catch(() => {
        // Balance read failed — fall back to the legacy pathUSD behaviour.
        setFeeToken(PATHUSD);
        setFeeChecked(true);
      });
  }, [storedWallet]);

  const handleApprove = async () => {
    if (!storedWallet || !info || !feeToken) return;
    try {
      setError(null);
      setBusy(true);

      // 1. Passkey ceremony (unlock the signing secret), then recover the
      //    signing key. daccWriteContract can't carry a feeToken, so we sign
      //    with viem/tempo directly and pick the gas token ourselves.
      const passwordSecretkey = await signWithPasskey();
      const { privateKey } = await allowDaccWallet({
        daccPublickey: storedWallet.daccPublickey,
        passwordSecretkey,
      });

      // 2. Send the on-chain authorizeKey tx from the user's wallet, gas paid
      //    in the chosen token (swapped to pathUSD for the validator via the
      //    protocol FeeAMM).
      const expiry = Math.floor(Date.now() / 1000) + Number(expiryDays || 90) * DAY;
      const periodSeconds = BigInt(Math.round(Number(periodDays || 30) * DAY));
      // One limit entry per supported TIP-20, each with its own amount.
      const limitEntries = TOKENS.map((t) => ({
        token: t.address,
        amount: parseUnits(limits[t.address] || "0", t.decimals),
        period: periodSeconds,
      }));
      if (limitEntries.some((l) => l.amount <= 0n))
        throw new Error("All token limits must be greater than 0.");

      const account = privateKeyToAccount(privateKey);
      // feeToken must ride ON THE CHAIN and the same chain object must be
      // passed into writeContract — a client-level feeToken is ignored when an
      // explicit (plain) chain param is present (probe: request.feeToken
      // comes out undefined in that case and gas defaults to pathUSD).
      const chainWithFee = (
        thaifiTempo as unknown as {
          extend: (o: { feeToken: `0x${string}` }) => typeof thaifiTempo;
        }
      ).extend({ feeToken: feeToken.address as `0x${string}` });
      const client = createClient({
        account,
        chain: chainWithFee,
        transport: http(),
      }).extend(tempoActions());

      const hash = await client.writeContract({
        chain: chainWithFee,
        account,
        address: accountKeychain,
        abi: authorizeKeyAbi,
        functionName: "authorizeKey",
        args: [
          info.keyId as `0x${string}`,
          1, // SignatureType.P256 — the CLI key
          {
            expiry: BigInt(expiry),
            enforceLimits: true,
            limits: limitEntries,
            allowAnyCalls: true,
            allowedCalls: [],
          },
        ],
      });
      console.log("authorizeKey tx:", hash);

      // 3. Mark the pairing approved for the CLI.
      await fetch("/api/agent/pairs/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pairingId,
          userAddress: storedWallet.address,
          expiry,
          // Primary record = the pathUSD cap; per-token caps live on-chain.
          limitAmount: limitEntries.find((l) => l.token === PATHUSD.address)!.amount.toString(),
          limitPeriod: Number(periodDays || 30) * DAY,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card auth-card">
        <h1><Ico name="check" size={18} /> CLI authorized</h1>
        <p className="subtitle">
          The CLI can now sign transactions for {storedWallet?.address.slice(0, 10)}… within
          the spending limit. Revoke it any time under Authorized Apps.
        </p>
      </div>
    );
  }

  if (!pairingId || error) {
    return (
      <div className="card auth-card">
        <h1>Pair ThaiFi CLI</h1>
        <p className="error-text">{error ?? "Missing pairing id."}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="card auth-card">
        <p className="muted">Loading pairing…</p>
      </div>
    );
  }

  if (info.status === "approved") {
    return (
      <div className="card auth-card">
        <h1>Already authorized</h1>
        <p className="subtitle">This pairing was already approved on {info.userAddress}.</p>
      </div>
    );
  }
  if (info.status !== "pending") {
    return (
      <div className="card auth-card">
        <h1>Pairing {info.status}</h1>
        <p className="subtitle">Start a new pairing from the CLI (`thaifi login`).</p>
      </div>
    );
  }

  return (
    <div className="card auth-card" style={{ textAlign: "left" }}>
      <h1 style={{ textAlign: "center" }}>Authorize ThaiFi CLI</h1>
      <p className="subtitle" style={{ textAlign: "center" }}>
        A CLI on <strong>{info.name}</strong> wants access to your wallet.
      </p>

      <div className="info-box">
        <p>
          <strong>Agent key:</strong> <code>{info.keyId}</code>
        </p>
        <p>
          The key will be authorized on-chain (AccountKeychain) to sign for{" "}
          <strong>{storedWallet?.address}</strong> within the limit below. Revoke any
          time under Authorized Apps.
        </p>
      </div>

      {feeChecked && feeToken && (
        <div className="info-box">
          <p>
            Gas for this approval: <strong>{feeToken.symbol}</strong> (balance{" "}
            {fmtUnits(balances[feeToken.address] ?? 0n)})
          </p>
        </div>
      )}
      {feeChecked && !feeToken && (
        <div className="info-box">
          <p>
            <Ico name="shield" size={14} /> This wallet has no token to pay gas with — it needs at least 0.01 of
            pathUSD, THCFI or THCOC before transactions can be sent.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              const base = window.location.pathname.startsWith('/wallet/') ? '/wallet' : '';
              window.location.href = `${base}/deposit`;
            }}
          >
            Go to Deposit
          </button>
        </div>
      )}

      <div className="field">
        <label>Spend limits</label>
        <div className="limit-grid">
          {TOKENS.map((t) => (
            <label key={t.address} className="limit-cell">
              <span className="limit-token">
                <span className="token-chip-icon" style={{ background: t.color }}>
                  {t.badge}
                </span>
                {t.symbol}
              </span>
              <input
                type="number"
                value={limits[t.address]}
                onChange={(e) => setLimits((prev) => ({ ...prev, [t.address]: e.target.value }))}
                disabled={busy}
              />
            </label>
          ))}
        </div>
        <span className="field-hint">
          Each token has its own cap per period — adjust them individually.
        </span>
      </div>
      <div className="field">
        <label>Limit period (days)</label>
        <input
          type="number"
          value={periodDays}
          onChange={(e) => setPeriodDays(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label>Key expiry (days from now)</label>
        <input
          type="number"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          disabled={busy}
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleApprove}
        disabled={busy || (feeChecked && !feeToken)}
      >
        {busy ? "Authorizing…" : "Confirm with Passkey & Authorize"}
      </button>
      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        <Ico name="shield" size={14} /> The CLI can spend up to each token's own limit per period
        {feeToken ? ` (gas for this tx is paid in ${feeToken.symbol})` : ""}.
      </p>
    </div>
  );
}
