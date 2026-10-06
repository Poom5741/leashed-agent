/**
 * Probe 6: PromptPay + revoke (guided human step — do NOT run unattended).
 * Guided checklist; exit 2 until confirmed by operator.
 */
console.log(`GUIDED PROBE — run manually with the paired CLI:
  1. npx thaifi-wallet-cli@latest deposit --amount 6   (min order)
     → scan QR with a Thai bank app → wait STATUS=delivered, note TX.
  2. npx thaifi-wallet-cli@latest balance              (balance +6 THCFI)
  3. In wallet.thaifi.com → Authorized Apps → revoke this agent key.
  4. npx thaifi-wallet-cli@latest request https://mpp.thaifi.com/whoami
     → expect auth failure (revoked) within seconds.
  When all 4 steps observed: edit this file to return exit 0 with a date.`);
process.exit(2);
