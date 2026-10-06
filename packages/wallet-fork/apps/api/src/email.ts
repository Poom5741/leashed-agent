import type { Env } from "./env";

/**
 * Send the OTP email through the Cloudflare Send Email Workers binding,
 * from EMAIL_SENDER (noreply@thaifi.com). Same raw-MIME pattern as
 * mppscan-thaichain — the binding requires Email Routing on the sender zone.
 */
export async function sendOtpEmail(env: Env, email: string, code: string, expiryMinutes: number): Promise<void> {
  const subject = "ThaiFi Wallet — your sign-in code";
  const body = [
    `From: ${env.EMAIL_SENDER}`,
    `To: ${email}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    `Your ThaiFi Wallet sign-in code is: ${code}`,
    "",
    `This code expires in ${expiryMinutes} minutes.`,
    "",
    "If you didn't request this code, you can safely ignore this email.",
  ].join("\r\n");

  // @ts-ignore — cloudflare:email is a Workers runtime module
  const { EmailMessage } = await import("cloudflare:email");

  const message = new EmailMessage(
    env.EMAIL_SENDER,
    email,
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  );

  await env.EMAIL.send(message);
}
