import { useEffect, useState } from "react";
import { listChains, type ChainInfo } from "../api/client.js";

const FAMILY_GLYPH: Record<ChainInfo["family"], string> = {
  cardano: "₳",
  svm: "◎",
  evm: "◆",
};

/** Payment-network strip fed by GET /api/chains. Blue = configured/live. */
export function ChainsStrip() {
  const [chains, setChains] = useState<ChainInfo[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listChains().then((c) => { if (!cancelled) setChains(c); }).catch(() => { if (!cancelled) setChains([]); });
    return () => { cancelled = true; };
  }, []);
  if (!chains || chains.length === 0) return null;
  return (
    <div className="chain-strip" aria-label="supported payment networks">
      <span className="chain-strip-label">x402 payment rails</span>
      {chains.map((c) => (
        <span key={c.network} className={`chain-badge${c.configured ? " live" : ""}`} title={`${c.label} · ${c.network}`}>
          <span aria-hidden="true">{FAMILY_GLYPH[c.family]}</span> {c.label}
          <span className="token">{c.token}</span>
        </span>
      ))}
    </div>
  );
}
