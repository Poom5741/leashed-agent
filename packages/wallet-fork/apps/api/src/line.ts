// LINE Login (OAuth 2.1) — flow ported from thaichain/v0-thai-vote-website
// lib/auth/line.ts to Workers-native fetch + WebCrypto.

import type { Env } from "./env";

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export interface LineProfile {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}

export function lineReady(env: Env): boolean {
  return Boolean(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET);
}

/** Callback path must match the LINE Developers console: /line-callback */
export function callbackUri(origin: string): string {
  return `${origin}/line-callback`;
}

export function buildAuthorizeUrl(env: Env, origin: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.LINE_CHANNEL_ID);
  url.searchParams.set("redirect_uri", callbackUri(origin));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  return url.toString();
}

export async function exchangeCode(env: Env, code: string, origin: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUri(origin),
      client_id: env.LINE_CHANNEL_ID,
      client_secret: env.LINE_CHANNEL_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error(`LINE token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("LINE token exchange returned no id_token");
  return data.id_token;
}

export async function verifyIdToken(env: Env, idToken: string): Promise<LineProfile> {
  // LINE requires POST with a form body here — a GET query string is rejected.
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: env.LINE_CHANNEL_ID,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE id_token verification failed: ${res.status} ${body}`);
  }
  const profile = (await res.json()) as LineProfile;
  if (!profile.sub) throw new Error("LINE id_token missing sub");
  return profile;
}
