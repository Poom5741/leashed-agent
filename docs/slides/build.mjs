import pptxgen from "pptxgenjs";

// Palette — the passbook brand (content-informed: paper ledger, ink, stamp red)
const BG      = "F1EBDE";  // paper
const INK     = "211B10";  // primary ink
const DARK    = "171208";  // cover/closing bg
const MUTED   = "8A7F6C";
const STAMP   = "B3372B";  // accent: stamp red
const GREEN   = "2F6B4A";  // auditor green
const BLUE    = "2456A6";  // link ink
const SANS = "Georgia", MONO = "Consolas";

const W = 13.33, H = 7.5, M = 0.55;
const p = new pptxgen();
p.layout = "LAYOUT_WIDE";
p.author = "Leashed Agent";
p.title = "Leashed Agent — TOKEN2049 Origins";

// signature motif: a stamped label (rotated, double-ruled)
const stamp = (s, text, x, y, w, color = STAMP, rot = -4) => {
  s.addText(text, { x, y, w, h: 0.5, align: "center", valign: "middle",
    fontFace: MONO, fontSize: 13, bold: true, color, charSpacing: 3,
    rotate: rot, line: { color, width: 1.75 }, fill: { color: "FFFFFF", transparency: 40 } });
};
const rule = (s, x, y, w, color = INK, wt = 1) =>
  s.addShape(p.shapes.LINE, { x, y, w, h: 0, line: { color, width: wt } });

/* 1 · COVER (dark) */
let s = p.addSlide();
s.background = { color: DARK };
s.addText("LEASHED AGENT", { x: M, y: 1.5, w: W - 2*M, h: 1.1, fontFace: SANS, fontSize: 60, bold: true, color: BG, charSpacing: 2 });
s.addText("An AI worker you can fund with a QR code, audit on-chain, and fire with a button.", { x: M, y: 2.75, w: 9.5, h: 1.0, fontFace: SANS, fontSize: 20, italic: true, color: "C9BFA8" });
rule(s, M, 4.05, 6.2, "6E5F45", 1.5);
s.addText([
  { text: "TOKEN2049 Origins Hackathon · 6–8 Oct 2026 · Marina Bay Sands", options: { breakLine: true, color: "C9BFA8" } },
  { text: "Team Leashed — main track + Cardano · Chainlink CRE · NOWNodes", options: { color: "C9BFA8" } },
], { x: M, y: 4.25, w: 9.5, h: 0.8, fontFace: MONO, fontSize: 14 });
stamp(s, "EVERY PAYMENT ON-CHAIN", 9.1, 1.7, 3.7);
s.addText("the poster on slide 5 was bought by the agent · everything recorded during the 36h sprint", { x: M, y: 6.7, w: 9, h: 0.4, fontFace: MONO, fontSize: 12, color: "8A7F6C" });

/* 2 · PROBLEM */
s = p.addSlide(); s.background = { color: BG };
s.addText("AI agents already spend money. Nobody is holding the leash.", { x: M, y: M, w: 11.5, h: 1.3, fontFace: SANS, fontSize: 34, bold: true, color: INK });
const rows = [
  ["No enforced budgets", "x402 agents pay per call with whatever the key holds — spending caps live in app code, not the chain"],
  ["No receipts", "once the API call returns, the payment evidence is scattered across explorers, if it exists at all"],
  ["No independent audit", "the agent's operator grades its own homework — there is no third party vouching for the books"],
  ["No fiat on-ramp", "a Thai shop owner cannot top up an agent from a bank app today"],
];
rows.forEach((r, i) => {
  const y = 2.1 + i * 1.15;
  s.addText(r[0], { x: M, y, w: 3.6, h: 0.9, fontFace: SANS, fontSize: 18, bold: true, color: INK });
  s.addText(r[1], { x: 4.4, y: y + 0.02, w: 8.3, h: 1.0, fontFace: SANS, fontSize: 14.5, color: "5C5340" });
  if (i < 3) rule(s, M, y + 1.0, W - 2*M, "D8CDB4", 1);
});
stamp(s, "THE TRUST LAYER IS MISSING", 9.7, 6.68, 3.1);
s.addText("Source: x402 Foundation stats — 75.4M txs but only $24.2M volume in 30 days (Aug 2026): micropayments dominate, oversight does not exist.", { x: M, y: 6.85, w: 12.2, h: 0.4, fontFace: MONO, fontSize: 11.5, color: MUTED });

/* 3 · SOLUTION */
s = p.addSlide(); s.background = { color: BG };
s.addText("The Leashed Agent — a pay-as-you-go worker on a chain-enforced leash", { x: M, y: M, w: 12.2, h: 1.2, fontFace: SANS, fontSize: 32, bold: true, color: INK });
s.addText([
  { text: "The agent is a Thai SME marketing worker: it pays an LLM for copy (0.2 THCFI) and an image model for the finished Thai-text poster (1.5 THCFI) — per call, per use.", options: { breakLine: true } },
], { x: M, y: 1.85, w: 11.8, h: 0.9, fontFace: SANS, fontSize: 16, color: "5C5340" });
const cols = [
  ["LEASH", "Spending cap set by the human and enforced by the ThaiFi chain itself (AccountKeychain, TIP-1011). Revocation is instant and on-chain.", INK],
  ["RECEIPTS", "Every payment on every rail becomes one ledger entry — amount, purpose, explorer link — readable like a bank passbook.", INK],
  ["AUDIT", "A Chainlink CRE workflow re-checks the whole ledger and attests the verdict on-chain. Neither the agent nor we can forge it.", INK],
  ["FUNDING", "Budget runs low → the agent shows a PromptPay QR → 1 THB = 1 THCFI, straight from any Thai banking app.", INK],
];
cols.forEach((c, i) => {
  const x = M + i * 3.12;
  s.addShape(p.shapes.RECTANGLE, { x, y: 3.1, w: 2.92, h: 3.4, fill: { color: "FAF6EC" }, line: { color: "D8CDB4", width: 1 }, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.12 } });
  s.addText(c[0], { x: x + 0.2, y: 3.35, w: 2.5, h: 0.5, fontFace: MONO, fontSize: 16, bold: true, color: c[2], charSpacing: 3 });
  rule(s, x + 0.2, 3.95, 2.5, "D8CDB4");
  s.addText(c[1], { x: x + 0.2, y: 4.1, w: 2.55, h: 2.2, fontFace: SANS, fontSize: 13.5, color: "5C5340" });
});
stamp(s, "IT ALREADY WORKS", 9.5, 6.6, 3.3);

/* 4 · ARCHITECTURE */
s = p.addSlide(); s.background = { color: BG };
s.addText("One agent, two payment rails, one independent auditor", { x: M, y: M, w: 12, h: 1.0, fontFace: SANS, fontSize: 32, bold: true, color: INK });
const box = (x, y, w, h, title, sub, color = INK) => {
  s.addShape(p.shapes.RECTANGLE, { x, y, w, h, fill: { color: "FAF6EC" }, line: { color, width: 1.5 } });
  s.addText(title, { x: x + 0.12, y: y + 0.12, w: w - 0.24, h: 0.4, fontFace: MONO, fontSize: 13.5, bold: true, color, margin: 0 });
  s.addText(sub, { x: x + 0.12, y: y + 0.55, w: w - 0.24, h: h - 0.7, fontFace: SANS, fontSize: 12, color: "5C5340", margin: 0 });
};
const arrow = (x, y, w) => s.addShape(p.shapes.LINE, { x, y, w, h: 0, line: { color: INK, width: 2, endArrowType: "triangle" } });
box(M, 1.8, 3.3, 1.5, "HUMAN OWNER", "passkey wallet · sets the cap · one-click revoke");
box(M, 4.6, 3.3, 1.5, "LEASHED AGENT", "plans the job · pays per call · budgets itself");
box(4.7, 1.8, 3.7, 1.5, "RAIL 1 · THAIFI MPP (chain 17)", "Qwen3.8 copy 0.2 THCFI · iApp poster 1.5 THCFI · PromptPay top-up", "8A5A2B");
box(4.7, 4.6, 3.7, 1.5, "RAIL 2 · CARDANO x402 (preprod)", "our own seller: receipt verification 0.10 tUSDM — payments are core, not a bolt-on", "2456A6");
box(9.3, 3.2, 3.5, 1.5, "CHAINLINK CRE AUDITOR", "cron → fetch receipts → risk checks → on-chain attestation (Sepolia)", GREEN);
box(9.3, 5.4, 3.5, 1.2, "NOWNodes RPC", "multichain data plane for receipt verification", MUTED);
arrow(3.85, 2.55, 0.8); arrow(4.65, 5.35, -0.8);
arrow(8.45, 2.55, 0.8); arrow(8.45, 5.35, 0.8);
arrow(9.3, 3.95, -1.3);
s.addText("Solid arrows = real, explorer-linked calls made during the sprint.", { x: M, y: 6.6, w: 9, h: 0.4, fontFace: MONO, fontSize: 12, color: MUTED });

/* 5 · LIVE EVIDENCE (screenshots) */
s = p.addSlide(); s.background = { color: DARK };
s.addText("It ran. During the hackathon. On real rails.", { x: M, y: 0.4, w: 12, h: 0.9, fontFace: SANS, fontSize: 32, bold: true, color: BG });
s.addImage({ path: "passbook.png", x: M, y: 1.5, w: 7.6, h: 4.75 });
s.addImage({ path: "poster.png", x: 8.5, y: 1.5, w: 4.3, h: 4.3 });
s.addText([
  { text: "Passbook: credit line 4,998.5 THCFI (on-chain) · 2 receipts · CRE verdict ✔ PASS", options: { breakLine: true, color: "C9BFA8" } },
  { text: "Right: the deliverable the agent bought — Thai-text promo poster, 1.5 THCFI", options: { color: "C9BFA8" } },
], { x: M, y: 6.5, w: 12.2, h: 0.8, fontFace: MONO, fontSize: 12.5 });
stamp(s, "RECORDED IN-SPRINT", 10.3, 0.5, 2.6);

/* 6 · ON-CHAIN EVIDENCE TABLE */
s = p.addSlide(); s.background = { color: BG };
s.addText("The evidence chain judges can click", { x: M, y: M, w: 12, h: 0.9, fontFace: SANS, fontSize: 32, bold: true, color: INK });
s.addTable([
  [{ text: "Event", options: { bold: true, fill: { color: "E8E0CD" } } },
   { text: "Rail", options: { bold: true, fill: { color: "E8E0CD" } } },
   { text: "Amount", options: { bold: true, fill: { color: "E8E0CD" } } },
   { text: "Proof (live links)", options: { bold: true, fill: { color: "E8E0CD" } } }],
  ["Agent buys Thai poster render", "ThaiFi MPP · chain 17", "1.5 THCFI", { text: "exp.thaifi.com/tx/0xf6e9…3b65e", options: { hyperlink: { url: "https://exp.thaifi.com/tx/0xf6e953e17647cf5559455337552b82f93208d57cde8fa2d57ba9a80860f3b65e" }, color: BLUE } }],
  ["Agent pays OUR x402 seller (Cardano)", "x402 · Cardano preprod", "0.10 tUSDM", { text: "cardanoscan.io/tx/5e796a4c…bdc0", options: { hyperlink: { url: "https://preprod.cardanoscan.io/transaction/5e796a4cce249e021ad694283bec298eae0add25cbb31a106b6cca1379efbdc0" }, color: BLUE } }],
  ["CRE auditor verdict", "Chainlink CRE → Sepolia", "PASS ✔ 2 receipts", { text: "docs/cre-auditor-evidence.txt (simulate log)", options: { color: GREEN } }],
  ["Leash enforcement", "AccountKeychain · TIP-1011", "4,998.5 / 5,000 THCFI", "on-chain limit decremented by the chain itself — incl. gas"],
], { x: M, y: 1.7, w: 12.2, colW: [3.6, 2.6, 2.3, 3.7], fontFace: SANS, fontSize: 12.5, color: INK, border: { pt: 0.75, color: "D8CDB4" }, fill: { color: "FAF6EC" }, rowH: 0.62, valign: "middle" });
s.addText("Ledger + policy engine: 10 unit tests · seller: live at :4020 · audit re-runnable: pnpm probe / scripts/demo.sh", { x: M, y: 5.9, w: 12, h: 0.4, fontFace: MONO, fontSize: 12, color: MUTED });
stamp(s, "NOT MOCKS", 10.9, 0.45, 1.9);

/* 7 · TRACKS MAP */
s = p.addSlide(); s.background = { color: BG };
s.addText("One product, four submissions — every integration is core", { x: M, y: M, w: 12, h: 1.0, fontFace: SANS, fontSize: 32, bold: true, color: INK });
const tracks = [
  ["MAIN · $100K AWS", "The whole product: two-rail agent + passbook oversight + CRE audit. Themes: AI x Crypto · Payments · Consumer.", INK],
  ["CARDANO · $27.5K", "Payments are Cardano-native: x402 preprod tUSDM, our own seller endpoint, TS-only SDK path — 0.10 tUSDM changed hands.", INK],
  ["CHAINLINK CRE · $10K", "The auditor IS a CRE workflow: HTTP fetch + risk logic + EVM write, proven by cre workflow simulate.", INK],
  ["NOWNODES · €6.5K", "The auditor's RPC data plane reads EVM receipt state through NOWNodes — architectural, not decorative.", INK],
];
tracks.forEach((t, i) => {
  const x = M + (i % 2) * 6.25, y = 1.85 + Math.floor(i / 2) * 2.3;
  s.addShape(p.shapes.RECTANGLE, { x, y, w: 5.95, h: 2.0, fill: { color: "FAF6EC" }, line: { color: "D8CDB4", width: 1 } });
  s.addText(t[0], { x: x + 0.22, y: y + 0.18, w: 5.5, h: 0.45, fontFace: MONO, fontSize: 15, bold: true, color: t[2], charSpacing: 2 });
  s.addText(t[1], { x: x + 0.22, y: y + 0.7, w: 5.5, h: 1.2, fontFace: SANS, fontSize: 13.5, color: "5C5340" });
});
s.addText("Partner integrations are core functionality on every track — the rules disqualify bolt-ons, so each leg earns its keep.", { x: M, y: 6.6, w: 12.2, h: 0.5, fontFace: SANS, fontSize: 13, italic: true, color: "5C5340" });

/* 8 · WHY WE WIN (judging fit) */
s = p.addSlide(); s.background = { color: BG };
s.addText("Built for the rubric, in 30 hours, by humans with a leash of our own", { x: M, y: M, w: 12.2, h: 1.1, fontFace: SANS, fontSize: 31, bold: true, color: INK });
const fits = [
  ["Functionality 30%", "Two paid journeys ran end-to-end with explorer links; top-up, revoke and auditor flows all execute."],
  ["Technical 25%", "On-chain limit enforcement (TIP-1011) · x402 seller + payer · MPP memo-bound charges · CRE orchestration."],
  ["Innovation 20%", "The trust layer: leash + receipts + independent audit + fiat on-ramp — the lane comparables left empty."],
  ["Usefulness 15%", "A noodle shop owner in Bangkok is the persona. 1 THB = 1 THCFI funding needs no exchange account."],
  ["Demo 10%", "Recording embedded, judgment-proof: every claim is a clickable transaction."],
];
fits.forEach((f, i) => {
  const y = 1.75 + i * 0.98;
  s.addText(f[0], { x: M, y, w: 3.1, h: 0.8, fontFace: MONO, fontSize: 15, bold: true, color: INK });
  s.addText(f[1], { x: 3.9, y: y + 0.02, w: 8.9, h: 0.9, fontFace: SANS, fontSize: 13.5, color: "5C5340" });
  if (i < 4) rule(s, M, y + 0.84, W - 2*M, "D8CDB4", 1);
});
stamp(s, "PRE-BUILT ≠ SUBMITTED", 9.6, 0.45, 3.2, MUTED, 3);
s.addText("Eligibility: submitted code written in-sprint. ThaiFi wallet/CLI used as public tooling (npm), affiliation disclosed in the README.", { x: M, y: 6.8, w: 12.2, h: 0.45, fontFace: MONO, fontSize: 11.5, color: MUTED });

/* 9 · CLOSING (dark) */
s = p.addSlide(); s.background = { color: DARK };
s.addText("Fund it with a QR.\nLeash it on-chain.\nAudit it with Chainlink.", { x: M, y: 1.6, w: 11, h: 2.6, fontFace: SANS, fontSize: 40, bold: true, color: BG, lineSpacing: 56 });
rule(s, M, 4.7, 5.5, "6E5F45", 1.5);
s.addText([
  { text: "Repo · live dashboard · audit log — linked in the submission", options: { breakLine: true, color: "C9BFA8" } },
  { text: "Team Leashed — Jirayu (Dome) Charoenyost · TOKEN2049 Origins 2026", options: { color: "C9BFA8" } },
], { x: M, y: 4.95, w: 11, h: 0.9, fontFace: MONO, fontSize: 14 });
stamp(s, "ON TIME", 9.9, 5.5, 2.4);

await p.writeFile({ fileName: "leashed-agent-slides.pptx" });
console.log("deck written");
