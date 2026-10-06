/**
 * Cardano x402 payer adapter — pays for x402 services on cardano:preprod
 * with the agent's own wallet (tUSDM), returning rail-agnostic Receipts.
 */
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactCardanoScheme as ExactCardanoClient } from "@x402/cardano/exact/client";
import { toClientCardanoSigner, getDefaultAsset } from "@x402/cardano";
import type { Receipt } from "@leashed/receipts";

export interface CardanoProviderConfig {
  blockfrost: { baseUrl: string; projectId: string };
}

export interface CardanoPayerOptions {
  mnemonic: string;
  provider: CardanoProviderConfig;
  network?: "cardano:preprod";
  /** USD spend cap per wrapped fetch (client-side spend controls). */
  maxSpend?: number;
}

export function createCardanoPayer(opts: CardanoPayerOptions) {
  const network = opts.network ?? "cardano:preprod";
  const signer = toClientCardanoSigner({
    mnemonic: opts.mnemonic,
    network,
    provider: opts.provider,
  });
  const client = new x402Client().register(network, new ExactCardanoClient(signer));
  if (opts.maxSpend !== undefined) {
    // $-denominated cap; the client scheme resolves USDM as the default asset.
    client.setSpendControls({ maxUsdPerRequest: opts.maxSpend } as never);
  }
  const fetchWithPay = wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);

  return {
    network,
    /** Fetch an x402-protected resource, paying automatically on 402. */
    async payFetch(url: string, init: RequestInit = {}): Promise<{
      response: Response;
      body: string;
      settlement: { transaction?: string; success?: boolean } | null;
    }> {
      const response = await fetchWithPay(url, init);
      const body = await response.text();
      let settlement: { transaction?: string; success?: boolean } | null = null;
      const header = response.headers.get("x-payment-response");
      if (header) {
        try {
          settlement = decodePaymentResponseHeader(header) as { transaction?: string; success?: boolean };
        } catch {
          settlement = null;
        }
      }
      return { response, body, settlement };
    },

    /** Build a Receipt from a paid call. */
    toReceipt(args: {
      url: string;
      serviceId: string;
      purpose: string;
      amountBase: string;
      txHash?: string;
    }): Receipt {
      const asset = getDefaultAsset(network, "USDM");
      const txHash = args.txHash;
      return {
        id: `${(txHash ?? "pending").slice(0, 10)}-${Date.now()}`,
        rail: "cardano-x402",
        serviceId: args.serviceId,
        purpose: args.purpose,
        token: { symbol: asset?.symbol ?? "USDM", decimals: asset?.decimals ?? 6 },
        amountBase: args.amountBase,
        amountDisplay: `${Number(args.amountBase) / 1e6} USDM`,
        payTo: "seller",
        status: txHash ? "paid" : "pending",
        txHash,
        txUrl: txHash ? `https://preprod.cardanoscan.io/transaction/${txHash}` : undefined,
        createdAt: new Date().toISOString(),
      };
    },
  };
}
