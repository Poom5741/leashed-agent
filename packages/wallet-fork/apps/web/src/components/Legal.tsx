// Privacy Policy and Terms of Use — required URLs for the LINE Login channel
// (set in the LINE Developers console). Served by the SPA at /privacy and
// /terms via the Workers asset fallback.

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
      <a className="legal-back" href="/">← Back to ThaiFi Wallet</a>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated / ปรับปรุงล่าสุด: {updated}</p>
      {children}
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy / นโยบายความเป็นส่วนตัว" updated="September 18, 2026">
      <h2>English</h2>

      <h2>1. Overview</h2>
      <p>
        ThaiFi Wallet is a <strong>non-custodial</strong> wallet for the ThaiFi
        network (chain ID 17). Your account sign-in (LINE or email) identifies
        you and stores an <strong>encrypted</strong> copy of your wallet backup.
        We never hold your keys and cannot move your funds.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Sign-in data:</strong> if you sign in with LINE, your LINE user
          ID, display name and profile picture; if you sign in with email, your
          email address. Email sign-in codes are sent from{" "}
          <code>noreply@thaifi.com</code>.
        </li>
        <li>
          <strong>Encrypted wallet backup (optional):</strong> the encrypted key
          blob produced on your device, stored in Cloudflare D1. It is
          ciphertext — meaningless without your passkey or recovery password.
        </li>
        <li>
          <strong>Session cookie:</strong> a signed, HttpOnly cookie that keeps
          you signed in for up to 30 days.
        </li>
        <li>
          <strong>Public blockchain data:</strong> your wallet address and
          transactions are public on the ThaiFi chain and shown in the History
          tab via the ThaiFi indexer.
        </li>
      </ul>

      <h2>3. What we never see</h2>
      <p>
        Your private key, secret, recovery password and passkey biometrics are
        generated and stay on your device. Every transaction is signed locally
        after a passkey confirmation. No employee or server can recover them.
      </p>

      <h2>4. Storage and processors</h2>
      <ul>
        <li><strong>Cloudflare</strong> — Workers, D1 database and transactional email.</li>
        <li><strong>LINE</strong> — identity provider when you choose LINE sign-in.</li>
      </ul>

      <h2>5. Your choices</h2>
      <p>
        You can delete the cloud backup or sign out at any time in the app.
        Removing your wallet from a device does not delete blockchain records,
        which are public by design. Questions: contact us via{" "}
        <a href="https://thaifi.com" target="_blank" rel="noreferrer">thaifi.com</a>.
      </p>

      <div className="legal-lang">
        <h2>ไทย</h2>
        <p>
          <strong>สรุป:</strong> ThaiFi Wallet เป็น wallet แบบ non-custodial
          กุญแจส่วนตัวของคุณถูกสร้างและจัดเก็บไว้ในเครื่องของคุณเท่านั้น
          เราไม่มีทางเห็นหรือย้ายเงินของคุณได้ เราเก็บเพียง: ข้อมูลการล็อกอิน
          (LINE user ID / อีเมล), ไฟล์สำรอง wallet ที่<strong>เข้ารหัสแล้ว</strong>
          (เก็บบน Cloudflare D1 — ถอดรหัสไม่ได้หากไม่มี passkey หรือ recovery
          password ของคุณ), session cookie และข้อมูลสาธารณะบนบล็อกเชน
          อีเมลรหัสล็อกอินส่งจาก noreply@thaifi.com
          คุณสามารถลบ backup บนคลาวด์หรือออกจากระบบได้ทุกเมื่อจากในแอป
        </p>
      </div>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use / ข้อกำหนดการใช้งาน" updated="September 18, 2026">
      <h2>English</h2>

      <h2>1. The service</h2>
      <p>
        ThaiFi Wallet provides a non-custodial wallet interface for the ThaiFi
        network (chain ID {thaifi.id}), including encrypted cloud backup of your
        wallet key and transaction history. The software is provided as-is.
      </p>

      <h2>2. You are responsible for your keys</h2>
      <p>
        Because the wallet is non-custodial, <strong>only you</strong> can access
        your funds. You are solely responsible for your recovery password,
        backup file and device security. If you lose them,{" "}
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
        acceptance. These terms are governed by the laws of Thailand.
      </p>

      <div className="legal-lang">
        <h2>ไทย</h2>
        <p>
          <strong>สรุป:</strong> ThaiFi Wallet เป็น wallet แบบ non-custodial —
          <strong>คุณรับผิดชอบกุญแจและการสำรองข้อมูลของคุณเองทั้งหมด</strong>
          หากสูญเสีย recovery password หรือไฟล์ backup จะไม่มีใครรวมถึงเรา
          สามารถกู้คืนการเข้าถึง wallet ของคุณได้ ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย
          บริการจัดให้ "ตามสภาพ" โดยไม่มีการรับประกัน
          และเราไม่รับผิดต่อความเสียหายที่เกิดจากการใช้งาน
          ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย
        </p>
      </div>
    </LegalShell>
  );
}
