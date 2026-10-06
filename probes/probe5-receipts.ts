/**
 * Probe 5: receipt attribution — can each payment in mpp stats recent[] be
 * attributed to a service + tx? Exit 0 = pass.
 */
const stats = await fetch("https://mpp.thaifi.com/stats");
if (!stats.ok) throw new Error(`stats HTTP ${stats.status}`);
const data = (await stats.json()) as {
  recent?: { txHash?: string; txUrl?: string; serviceId?: string; amount?: string; payer?: string }[];
};
const rows = data.recent ?? [];
if (rows.length === 0) throw new Error("no recent payments to attribute (fine on a fresh chain — verify schema fields by hand)");
for (const r of rows) {
  if (!r.txHash || !r.serviceId || r.amount === undefined) throw new Error(`incomplete attribution row: ${JSON.stringify(r)}`);
}
console.log(`attribution OK for ${rows.length} recent payments (txHash+serviceId+amount present)`);
console.log("PASS");
