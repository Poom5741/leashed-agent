/** `thaifi services [--search q]` — discover paid services from an MPP/x402 registry. */

const REGISTRY =
  process.env.THAIFI_MPP_REGISTRY ?? "https://mpp.thaifi.com";

interface Service {
  id?: string;
  serviceId?: string;
  name?: string;
  description?: string;
  url?: string;
  endpoint?: string;
  price?: string | number;
}

export async function services(options: { search?: string } = {}): Promise<void> {
  const base = REGISTRY.replace(/\/$/, "");
  const url = options.search ? `${base}/services?search=${encodeURIComponent(options.search)}` : `${base}/services`;
  console.log("Registry: " + base);

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("Registry unreachable (" + (err instanceof Error ? err.message : err) + ").");
    console.error("Set THAIFI_MPP_REGISTRY to your MPP/x402 registry URL.");
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    console.error("Registry returned HTTP " + res.status);
    process.exitCode = 1;
    return;
  }

  let data: { services?: Service[] } | Service[];
  try {
    data = (await res.json()) as { services?: Service[] } | Service[];
  } catch (err) {
    console.error("Registry returned a non-JSON response (" + (err instanceof Error ? err.message : err) + ").");
    console.error("Set THAIFI_MPP_REGISTRY to your MPP/x402 registry URL.");
    process.exitCode = 1;
    return;
  }
  const list = Array.isArray(data) ? data : (data.services ?? []);
  if (list.length === 0) {
    console.log("No services found.");
    return;
  }
  for (const s of list) {
    const id = s.id ?? s.serviceId ?? "?";
    console.log("");
    console.log(id + " — " + (s.name ?? id));
    if (s.description) console.log("  " + s.description);
    if (s.url || s.endpoint) console.log("  " + (s.url ?? s.endpoint));
    if (s.price !== undefined) console.log("  price: " + s.price);
  }
  console.log("");
  console.log("Call a service: thaifi request <SERVICE_URL>");
}
