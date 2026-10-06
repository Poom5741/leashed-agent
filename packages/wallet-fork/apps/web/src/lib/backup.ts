import type { StoredWallet } from "./storage";

const BACKUP_VERSION = 2;

export interface BackupFile {
  version: number;
  exportedAt: number;
  wallet: StoredWallet;
  /** passwordSecretkey encrypted with recovery password (for cross-device/domain restore) */
  recoveryEncrypted?: string; // base64 (AES-GCM ciphertext)
  recoveryIv?: string; // base64
  recoverySalt?: string; // base64
}

async function deriveKeyFromPassword(
  password: string,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWithRecoveryPassword(
  recoveryPassword: string,
  secretKey: string,
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassword(recoveryPassword, salt.buffer);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secretKey),
  );
  return {
    ciphertext: btoa(
      Array.from(new Uint8Array(ciphertext))
        .map((b) => String.fromCharCode(b))
        .join(""),
    ),
    iv: btoa(
      Array.from(new Uint8Array(iv.buffer))
        .map((b) => String.fromCharCode(b))
        .join(""),
    ),
    salt: btoa(
      Array.from(salt)
        .map((b) => String.fromCharCode(b))
        .join(""),
    ),
  };
}

export async function decryptWithRecoveryPassword(
  recoveryPassword: string,
  ciphertext: string,
  iv: string,
  salt: string,
): Promise<string> {
  // Canary: prove the helper round-trips with THIS password in THIS context
  // before blaming the file. If the canary fails, the crypto environment (or
  // an instrumentation wrapper) is broken; if it passes, the file params are
  // mismatched. Distinguishes the two (Rakazo F12, round 3).
  try {
    const canary = await encryptWithRecoveryPassword(recoveryPassword, "canary");
    const round = await decryptWithRecoveryPasswordRaw(
      recoveryPassword,
      canary.ciphertext,
      canary.iv,
      canary.salt,
    );
    if (round !== "canary") {
      throw new Error(
        `Restore crypto self-test failed (round-trip returned ${JSON.stringify(round).slice(0, 40)}).`,
      );
    }
  } catch (err) {
    throw new Error(
      `Restore crypto self-test failed in this browser context: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    return await decryptWithRecoveryPasswordRaw(recoveryPassword, ciphertext, iv, salt);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Backup decrypt failed (${detail}) — params: ct=${ciphertext.length}B iv=${iv.length}B salt=${salt.length}B. ` +
        "Check the recovery password matches the one set at export.",
    );
  }
}

async function decryptWithRecoveryPasswordRaw(
  recoveryPassword: string,
  ciphertext: string,
  iv: string,
  salt: string,
): Promise<string> {
  const saltBuf = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)).buffer;
  const ivBuf = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)).buffer;
  const ctBuf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0)).buffer;
  const key = await deriveKeyFromPassword(recoveryPassword, saltBuf);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuf) },
    key,
    ctBuf,
  );
  return new TextDecoder().decode(decrypted);
}

export interface BackupExportOptions {
  wallet: StoredWallet;
  passwordSecretkey: string;
  recoveryPassword: string;
}

export async function createBackupFile({
  wallet,
  passwordSecretkey,
  recoveryPassword,
}: BackupExportOptions): Promise<string> {
  const encrypted = await encryptWithRecoveryPassword(
    recoveryPassword,
    passwordSecretkey,
  );

  const backup: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    wallet,
    recoveryEncrypted: encrypted.ciphertext,
    recoveryIv: encrypted.iv,
    recoverySalt: encrypted.salt,
  };

  return JSON.stringify(backup, null, 2);
}

export function downloadBackupFile(jsonContent: string, wallet: StoredWallet): void {
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const shortAddr = wallet.address.slice(2, 8);
  const filename = `thaifi-wallet-${shortAddr}-${date}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(jsonText: string): BackupFile {
  const data = JSON.parse(jsonText) as BackupFile;

  if (data.version < 1 || data.version > BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }

  const w = data.wallet;
  // PIN-guard wallets have no passkey material (prfSalt/credentialId empty).
  const isPin = w.guard === "pin";
  if (
    !w.address ||
    !w.daccPublickey ||
    !w.encryptedSecret ||
    !w.iv ||
    (!isPin && (!w.prfSalt || !w.credentialId))
  ) {
    throw new Error("Invalid backup file: missing required fields.");
  }

  return data;
}
