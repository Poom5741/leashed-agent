// Privacy Policy and Terms of Use — Leashed Agent fork ships English-only.
// LINE sign-in is removed; the passkey is the only identity.

import { thaifi } from "../config/chain";

function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legal-page">
      <a className="legal-back" href="/">← Back to Leashed Wallet</a>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated: {updated}</p>
      {children}
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="October 6, 2026">
      <h2>1. Overview</h2>
      <p>
        Leashed Wallet is a <strong>non-custodial</strong> passkey wallet for
        the ThaiFi network (chain ID {thaifi.id}). It is a fork of the ThaiFi
        Wallet, re-skinned for the Leashed Agent Platform. There is no
        identity provider — your device and your passkey are the only thing
        that authorises access.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Nothing about you.</strong> No email, no LINE user ID, no
          phone, no analytics. The wallet never asks for an account.
        </li>
        <li>
          <strong>Encrypted wallet backup (optional):</strong> the encrypted
          key blob produced on your device, stored in Cloudflare D1. It is
          ciphertext — meaningless without your passkey or recovery password.
        </li>
        <li>
          <strong>Public blockchain data:</strong> your wallet address and
          transactions are public on the ThaiFi chain and shown in the
          Activity tab via the ThaiFi indexer.
        </li>
      </ul>

      <h2>3. What we never see</h2>
      <p>
        Your private key, secret, recovery password and passkey biometrics are
        generated and stay on your device. Every transaction is signed locally
        after a passkey confirmation. No employee or server can recover them.
      </p>

      <h2>4. Storage</h2>
      <ul>
        <li><strong>Cloudflare</strong> — Workers, D1 database (encrypted backups only).</li>
      </ul>

      <h2>5. Your choices</h2>
      <p>
        You can delete the cloud backup at any time in the app. Removing your
        wallet from a device does not delete blockchain records, which are
        public by design. Questions: open an issue on the Leashed Agent
        GitHub repo.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use" updated="October 6, 2026">
      <h2>1. The service</h2>
      <p>
        Leashed Wallet provides a non-custodial wallet interface for the ThaiFi
        network (chain ID {thaifi.id}), including optional encrypted cloud
        backup of your wallet key and read-only transaction history. The
        software is provided as-is.
      </p>

      <h2>2. You are responsible for your keys</h2>
      <p>
        Because the wallet is non-custodial, <strong>only you</strong> can
        access your funds. You are solely responsible for your recovery
        password, backup file and device security. If you lose them,{" "}
        <strong>nobody — including us — can restore access</strong>. A cloud
        backup helps only if you remember your recovery password.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        You agree not to use the wallet for unlawful activity, to abuse or
        attack the service (including automated request flooding), or to
        circumvent security measures.
      </p>

      <h2>4. No warranty; limitation of liability</h2>
      <p>
        The service is provided "as is" without warranties of any kind. To the
        maximum extent permitted by law, we are not liable for lost funds,
        lost keys, lost backups, transaction errors, chain outages or indirect
        damages arising from your use of the wallet.
      </p>

      <h2>5. Changes</h2>
      <p>
        We may update these terms; continued use after an update constitutes
        acceptance.
      </p>
    </LegalShell>
  );
}
