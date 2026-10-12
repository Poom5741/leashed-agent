/** Get testnet tokens — self-serve guide (slice 5d).
 *
 * The old Cardano tUSDM claim form is removed: judges source testnet
 * stablecoins for the Solana and Tempo rails themselves. This page tells
 * them exactly where to go; the platform never custodies faucet tokens. */

export function FaucetPage() {
  return (
    <>
      <div className="trust-bar">
        <span><span className="live-dot" />GET TESTNET TOKENS</span>
        <span>Self-serve · Solana devnet + Tempo Moderato · find your own faucet</span>
        <span className="right">stablecoin testnets</span>
      </div>

      <div className="fig-label">FIG. 4 · Testnet token sourcing guide</div>
      <hr className="section-rule" />

      <p className="muted" style={{ fontSize: 13 }}>
        The platform accepts x402 payments in <strong>USDC</strong> and
        {" "}<strong>PYUSD</strong> on two testnets. Claims are not custodied
        here — use the official faucets below, then send tokens to the deposit
        addresses shown on the <strong>wallet top-up page</strong> or pay
        per-call directly via x402.
      </p>

      <div className="services-register" style={{ marginTop: 14 }}>
        <div className="service-row">
          <div className="id">◎ SOL</div>
          <div className="url">
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>
            <div className="desc">Solana devnet SOL airdrop — needed for gas/fees</div>
          </div>
          <div><span className="rail">devnet</span></div>
          <div className="mono">free</div>
          <div className="mono" style={{ fontWeight: 600 }}>SOL</div>
        </div>
        <div className="service-row">
          <div className="id">◎ USDC</div>
          <div className="url">
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>
            <div className="desc">Circle's official devnet USDC faucet (mint 4zMMC…ncDU)</div>
          </div>
          <div><span className="rail">devnet</span></div>
          <div className="mono">free</div>
          <div className="mono" style={{ fontWeight: 600 }}>USDC</div>
        </div>
        <div className="service-row">
          <div className="id">◆ TPO</div>
          <div className="url">
            <a href="https://docs.tempo.xyz" target="_blank" rel="noreferrer">docs.tempo.xyz</a>
            <div className="desc">Tempo Moderato testnet access &amp; token faucet per Tempo docs</div>
          </div>
          <div><span className="rail">moderato</span></div>
          <div className="mono">free</div>
          <div className="mono" style={{ fontWeight: 600 }}>USDC</div>
        </div>
        <div className="service-row">
          <div className="id">$ PY</div>
          <div className="url">
            <a href="https://www.paypal.com/pyusd" target="_blank" rel="noreferrer">paypal.com/pyusd</a>
            <div className="desc">
              PYUSD is accepted on both rails once its testnet address is
              configured (PYUSD_ADDRESS / SOLANA_PYUSD_MINT env). No
              PayPal-issued testnet faucet exists yet — source PYUSD
              mainnet facts here.
            </div>
          </div>
          <div><span className="rail">both</span></div>
          <div className="mono">—</div>
          <div className="mono" style={{ fontWeight: 600 }}>PYUSD</div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
        After claiming, paste the platform deposit address from the wallet
        {" "}<strong>Top up</strong> section and send — the x402 seller holds
        no buyer keys and settlement is on-chain.
      </p>
    </>
  );
}
