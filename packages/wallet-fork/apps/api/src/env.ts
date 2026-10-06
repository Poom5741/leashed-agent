export interface Env {
  DB: D1Database;
  /** Send Email Workers binding. */
  EMAIL: { send: (message: unknown) => Promise<void> };
  ASSETS: Fetcher;
  JWT_SECRET: string;
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET?: string;
  EMAIL_SENDER: string;
  TIDX_URL: string;
  THAIFI_CHAIN_ID: string;
  THAIFI_RPC_URL: string;
  APP_NAME: string;
  /** PaySolutions PromptPay API bearer token (merchant portal → Auth Key). */
  PAYSO_AUTH_KEY?: string;
  /** PaySolutions merchant id (8 digits). */
  PAYSO_MERCHANT_ID?: string;
  /** Hot wallet private key (0x-prefixed) — holds only MINTER_ROLE on THCFI/THCOC.
   *  Secrets Store bindings resolve via `await binding.get()`; wrangler secrets are plain strings. */
  PAYSO_HOT_KEY?: string | { get: () => Promise<string> };
  /** ThaiFi Pay gateway (pay.thaifi.com) — unknown payso referenceNos are forwarded there. */
  PAY_FORWARD_URL?: string;
  /** Shared secret for the payso forward hop (same value as the pay worker's). */
  INTERNAL_CALLBACK_SECRET?: string;
}

export interface AuthUser {
  id: string;
  provider: string; // 'line' | 'email'
  email: string | null;
  displayName: string | null;
  picture: string | null;
}
