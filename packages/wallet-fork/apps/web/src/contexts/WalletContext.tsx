import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createDaccWallet } from "dacc-js";
import { loadWallet, saveWallet, deleteWallet, type StoredWallet } from "../lib/storage";
import {
  createBackupFile,
  parseBackupFile,
  encryptWithRecoveryPassword,
  decryptWithRecoveryPassword,
  type BackupFile,
} from "../lib/backup";
import {
  registerPasskey,
  authenticateWithPasskey,
  isPlatformAuthenticatorAvailable,
} from "../lib/passkey";
import {
  deriveAESKeyFromPRF,
  encryptString,
  decryptString,
  generateRandomSecret,
} from "../lib/crypto";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import { PinModal } from "../components/PinModal";

/**
 * Wallet state machine:
 *   loading → the wallet is opening (device wallet + cloud backup sync check)
 *   none    → no wallet on this device and none in the cloud → CreateWallet
 *   ready   → wallet exists → Dashboard always available (address/balances are
 *             public info — no passkey needed to view, including on refresh)
 *
 * There is deliberately NO locked/unlocked state and NO persisted secret:
 * every operation that touches key material (send, write, sign, export)
 * runs its own ceremony — passkey, or the PIN modal on PIN-guard wallets —
 * and uses the decrypted secret exactly once, in that call's scope.
 *
 * Guards (StoredWallet.guard):
 *   "passkey" (default) — secret wrapped by WebAuthn PRF key.
 *   "pin"               — secret wrapped by an 8-digit PIN (PBKDF2). Used only
 *                         when no platform authenticator exists; the user
 *                         explicitly accepts the weaker security in the UI.
 *                         The recovery password for these wallets IS the PIN.
 *
 * Cloud sync (login = wallet, one wallet per account via ownerUserId):
 *   local wallet, no cloud backup  → needsBackup=true → prompt → syncToCloud
 *   no local wallet, cloud backup  → auto-restore via importBackup →
 *                                    recoveryMode → recoverWithPassword
 */
type WalletStatus = "loading" | "none" | "ready";

interface RecoveryMode {
  backup: BackupFile;
  requiresRecovery: true;
}

interface PinRequest {
  resolve: (pin: string) => void;
  reject: (err: Error) => void;
  title?: string;
  message?: ReactNode;
}

interface WalletContextValue {
  status: WalletStatus;
  storedWallet: StoredWallet | null;
  platformAuthAvailable: boolean;
  recoveryMode: RecoveryMode | null;
  /** Epoch ms of the latest cloud backup for the current wallet (null = none). */
  cloudSyncedAt: number | null;
  /** Wallet exists on device but has no cloud backup — prompt for sync. */
  needsBackup: boolean;
  /**
   * Decrypt the signing secret: passkey ceremony, or the PIN modal on
   * PIN-guard wallets. One call = one user confirmation; the secret must be
   * used immediately and never stored.
   */
  signWithPasskey: () => Promise<string>;
  createWallet: (opts?: { pin?: string }) => Promise<void>;
  removeWallet: () => Promise<void>;
  exportBackup: (recoveryPassword?: string) => Promise<string>;
  importBackup: (jsonText: string) => Promise<void>;
  recoverWithPassword: (recoveryPassword: string) => Promise<void>;
  cancelRecovery: () => void;
  /** Export + upload the encrypted backup to the account's D1 row. */
  syncToCloud: (recoveryPassword?: string) => Promise<void>;
  /** Skip the sync prompt for this session (re-prompts on next login). */
  dismissBackupPrompt: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [storedWallet, setStoredWallet] = useState<StoredWallet | null>(null);
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode | null>(null);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<number | null>(null);
  const [needsBackup, setNeedsBackup] = useState(false);
  const [pinRequest, setPinRequest] = useState<PinRequest | null>(null);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setPlatformAuthAvailable);
  }, []);

  /** PIN prompt with verification — resolves the raw PIN, or rejects on cancel. */
  const requestPin = useCallback(
    (opts?: { title?: string; message?: ReactNode }) =>
      new Promise<string>((resolve, reject) => {
        setPinRequest({ resolve, reject, ...opts });
      }),
    [],
  );

  /**
   * Login reconciliation — runs once per logged-in account. Decides between
   * local wallet / cloud auto-restore / fresh create, and marks the cloud
   * sync state. A device wallet is BOUND to the account that created it
   * (ownerUserId): signing in as another account follows that account's
   * cloud backup instead — one wallet per account.
   */
  useEffect(() => {
    if (authStatus !== "authed") return;
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const stored = await loadWallet();
      if (cancelled) return;

      let backups: { address: string; updatedAt: number }[] = [];
      try {
        backups = (await api.listBackups()).backups;
      } catch {
        backups = [];
      }
      if (cancelled) return;

      // Device wallet belongs to a DIFFERENT account → hide it here and
      // follow this account's cloud (restore its backup or create new).
      // The other account's local wallet stays in IndexedDB untouched.
      if (stored?.ownerUserId && stored.ownerUserId !== userId) {
        if (backups.length > 0) {
          setStatus("none");
          try {
            const latest = await api.getBackup(backups[0].address);
            await importBackup(latest.backup);
          } catch {
            if (!cancelled) setStatus("none");
          }
        } else {
          setStatus("none");
        }
        return;
      }

      if (stored) {
        // Adopt legacy wallets saved before accounts existed.
        const owned = stored.ownerUserId ? stored : { ...stored, ownerUserId: userId };
        if (!stored.ownerUserId) await saveWallet(owned);
        setStoredWallet(owned);
        setStatus("ready");
        const mine = backups.find(
          (b) => b.address.toLowerCase() === owned.address.toLowerCase(),
        );
        setCloudSyncedAt(mine?.updatedAt ?? null);
        setNeedsBackup(!mine && owned.guard !== "pin");
        return;
      }

      if (backups.length > 0) {
        // Account has a wallet in the cloud but not on this device — auto-restore.
        setStatus("none");
        try {
          const latest = await api.getBackup(backups[0].address);
          await importBackup(latest.backup);
        } catch {
          // Unreadable backup — fall through to manual create/import.
          if (!cancelled) setStatus("none");
        }
        return;
      }

      setStatus("none");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  const signWithPasskey = useCallback(async (): Promise<string> => {
    if (!storedWallet) throw new Error("No wallet on this device.");

    if (storedWallet.guard === "pin") {
      if (!storedWallet.pinSalt) throw new Error("Corrupted PIN wallet.");
      const pin = await requestPin({
        title: "Enter your PIN",
        message: "Enter your 8-digit PIN to sign this transaction.",
      });
      return decryptWithRecoveryPassword(
        pin,
        storedWallet.encryptedSecret,
        storedWallet.iv,
        storedWallet.pinSalt,
      );
    }

    const authResult = await authenticateWithPasskey(
      storedWallet.credentialId,
      storedWallet.prfSalt,
    );
    if (!authResult.prfOutput) {
      throw new Error(
        "Passkey not found. This wallet was created on a different device or domain — " +
          "sign in and restore from your cloud backup, or import a backup file.",
      );
    }
    const aesKey = await deriveAESKeyFromPRF(authResult.prfOutput);
    return decryptString(aesKey, {
      ciphertext: storedWallet.encryptedSecret,
      iv: storedWallet.iv,
    });
  }, [storedWallet, requestPin]);

  const createWallet = useCallback(
    async (opts?: { pin?: string }) => {
      const passwordSecretkey = generateRandomSecret(32);
      const result = await createDaccWallet({ passwordSecretkey });

      let walletData: StoredWallet;
      if (opts?.pin) {
        // PIN-guard fallback (no passkey available) — the user accepted the risks.
        const { ciphertext, iv, salt } = await encryptWithRecoveryPassword(
          opts.pin,
          passwordSecretkey,
        );
        walletData = {
          address: result.address,
          daccPublickey: result.daccPublickey,
          encryptedSecret: ciphertext,
          iv,
          prfSalt: "",
          credentialId: "",
          prfSupported: false,
          createdAt: Date.now(),
          ownerUserId: user?.id,
          guard: "pin",
          pinSalt: salt,
        };
      } else {
        const passkeyResult = await registerPasskey();

        if (!passkeyResult.prfSupported || !passkeyResult.prfOutput) {
          throw new Error(
            "Your authenticator does not support the PRF extension. " +
              "Please use a passkey that supports PRF (e.g., iCloud Keychain on macOS/iOS, Chrome on desktop).",
          );
        }

        const aesKey = await deriveAESKeyFromPRF(passkeyResult.prfOutput);
        const encrypted = await encryptString(aesKey, passwordSecretkey);

        walletData = {
          address: result.address,
          daccPublickey: result.daccPublickey,
          encryptedSecret: encrypted.ciphertext,
          iv: encrypted.iv,
          prfSalt: passkeyResult.prfSalt,
          credentialId: passkeyResult.credentialId,
          prfSupported: passkeyResult.prfSupported,
          createdAt: Date.now(),
          ownerUserId: user?.id,
        };
      }

      await saveWallet(walletData);
      setStoredWallet(walletData);
      setStatus("ready");

      if (walletData.guard === "pin") {
        // Sync the PIN-encrypted backup immediately (no extra prompt — the PIN
        // is the recovery password for these wallets).
        try {
          const json = await createBackupFile({
            wallet: walletData,
            passwordSecretkey,
            recoveryPassword: opts!.pin,
          });
          await api.putBackup(walletData.address, json);
          setCloudSyncedAt(Date.now());
          setNeedsBackup(false);
        } catch (err) {
          console.error("Initial cloud sync failed:", err);
        }
      } else {
        // New passkey wallet — prompt for the recovery password so it syncs.
        setNeedsBackup(true);
      }
    },
    [user?.id, platformAuthAvailable],
  );

  const removeWallet = useCallback(async () => {
    if (storedWallet) {
      // Delete = device AND cloud (otherwise login would auto-restore it again).
      await api.deleteBackup(storedWallet.address).catch(() => undefined);
    }
    await deleteWallet();
    setStoredWallet(null);
    setCloudSyncedAt(null);
    setNeedsBackup(false);
    setRecoveryMode(null);
    setStatus("none");
  }, [storedWallet]);

  const exportBackup = useCallback(
    async (recoveryPassword?: string) => {
      if (!storedWallet) return "";

      let passwordSecretkey: string;
      let recoveryPw: string;
      if (storedWallet.guard === "pin") {
        recoveryPw = await requestPin({
          title: "Enter your PIN",
          message: "Enter your PIN to export the backup file.",
        });
        passwordSecretkey = await decryptWithRecoveryPassword(
          recoveryPw,
          storedWallet.encryptedSecret,
          storedWallet.iv,
          storedWallet.pinSalt,
        );
      } else {
        if (!recoveryPassword) throw new Error("Recovery password is required.");
        recoveryPw = recoveryPassword;
        // Exporting key material is sensitive — passkey-confirm it too.
        passwordSecretkey = await signWithPasskey();
      }

      return createBackupFile({
        wallet: storedWallet,
        passwordSecretkey,
        recoveryPassword: recoveryPw,
      });
    },
    [storedWallet, signWithPasskey, requestPin],
  );

  const importBackup = useCallback(
    async (jsonText: string) => {
      const backup = parseBackupFile(jsonText);
      const isPin = backup.wallet.guard === "pin";

      // Check if this backup has recovery data
      if (!backup.recoveryEncrypted || !backup.recoveryIv || !backup.recoverySalt) {
        // No recovery data - save as-is, user must have the same passkey
        const owned = { ...backup.wallet, ownerUserId: user?.id };
        await saveWallet(owned);
        setStoredWallet(owned);
        setRecoveryMode(null);
        setStatus("ready");
        return;
      }

      // PIN-guard backups never try the passkey — go straight to recovery (PIN).
      if (!isPin) {
        // Has recovery data - try passkey first
        try {
          const authResult = await authenticateWithPasskey(
            backup.wallet.credentialId,
            backup.wallet.prfSalt,
          );

          if (authResult.prfOutput) {
            // Passkey works - save and use normally
            const aesKey = await deriveAESKeyFromPRF(authResult.prfOutput);
            await decryptString(aesKey, {
              ciphertext: backup.wallet.encryptedSecret,
              iv: backup.wallet.iv,
            });

            const owned = { ...backup.wallet, ownerUserId: user?.id };
            await saveWallet(owned);
            setStoredWallet(owned);
            setRecoveryMode(null);
            setStatus("ready");
            return;
          }
        } catch {
          // Passkey failed - will try recovery
        }
      }

      // Passkey doesn't work (or PIN-guard) - enter recovery mode
      setRecoveryMode({ backup, requiresRecovery: true });
    },
    [user?.id],
  );

  const recoverWithPassword = useCallback(
    async (recoveryPassword: string) => {
      if (!recoveryMode) return;

      const { backup } = recoveryMode;
      if (!backup.recoveryEncrypted || !backup.recoveryIv || !backup.recoverySalt) {
        throw new Error("This backup file does not have recovery data.");
      }

      // 1. Decrypt passwordSecretkey with recovery password (the PIN for PIN wallets)
      const passwordSecretkey = await decryptWithRecoveryPassword(
        recoveryPassword,
        backup.recoveryEncrypted,
        backup.recoveryIv,
        backup.recoverySalt,
      );

      let newWallet: StoredWallet;
      if (backup.wallet.guard === "pin") {
        // Stay PIN-guard — no passkey re-registration.
        newWallet = { ...backup.wallet, ownerUserId: user?.id };
      } else {
        // 2. Register a NEW passkey for this device/domain
        const passkeyResult = await registerPasskey();

        if (!passkeyResult.prfSupported || !passkeyResult.prfOutput) {
          throw new Error("Your authenticator does not support the PRF extension.");
        }

        // 3. Re-encrypt passwordSecretkey with new passkey
        const aesKey = await deriveAESKeyFromPRF(passkeyResult.prfOutput);
        const encrypted = await encryptString(aesKey, passwordSecretkey);

        newWallet = {
          ...backup.wallet,
          credentialId: passkeyResult.credentialId,
          prfSalt: passkeyResult.prfSalt,
          encryptedSecret: encrypted.ciphertext,
          iv: encrypted.iv,
          prfSupported: passkeyResult.prfSupported,
          ownerUserId: user?.id,
        };
      }

      await saveWallet(newWallet);
      setStoredWallet(newWallet);
      setRecoveryMode(null);
      setStatus("ready");

      // 4. Refresh the cloud backup so it carries the current device's wrap —
      //    the recovery password is already in hand here.
      try {
        const fresh = await createBackupFile({
          wallet: newWallet,
          passwordSecretkey,
          recoveryPassword,
        });
        await api.putBackup(newWallet.address, fresh);
        setCloudSyncedAt(Date.now());
        setNeedsBackup(false);
      } catch {
        // Cloud refresh is best-effort; the backup from the other device remains.
      }
    },
    [recoveryMode, user?.id],
  );

  const cancelRecovery = useCallback(() => {
    setRecoveryMode(null);
  }, []);

  const syncToCloud = useCallback(
    async (recoveryPassword?: string) => {
      if (!storedWallet) return;

      let json: string;
      if (storedWallet.guard === "pin") {
        const pin = await requestPin({
          title: "Enter your PIN",
          message: "Enter your PIN to sync the encrypted backup.",
        });
        const passwordSecretkey = await decryptWithRecoveryPassword(
          pin,
          storedWallet.encryptedSecret,
          storedWallet.iv,
          storedWallet.pinSalt,
        );
        json = await createBackupFile({
          wallet: storedWallet,
          passwordSecretkey,
          recoveryPassword: pin,
        });
      } else {
        if (!recoveryPassword) throw new Error("Recovery password is required.");
        json = await exportBackup(recoveryPassword);
      }

      await api.putBackup(storedWallet.address, json);
      setCloudSyncedAt(Date.now());
      setNeedsBackup(false);
    },
    [storedWallet, exportBackup, requestPin],
  );

  const dismissBackupPrompt = useCallback(() => {
    setNeedsBackup(false);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        status,
        storedWallet,
        platformAuthAvailable,
        recoveryMode,
        cloudSyncedAt,
        needsBackup,
        signWithPasskey,
        createWallet,
        removeWallet,
        exportBackup,
        importBackup,
        recoverWithPassword,
        cancelRecovery,
        syncToCloud,
        dismissBackupPrompt,
      }}
    >
      {children}

      <PinModal
        open={pinRequest !== null}
        title={pinRequest?.title}
        message={pinRequest?.message}
        onSubmit={async (pin) => {
          const w = storedWallet;
          if (!w?.pinSalt) throw new Error("No PIN wallet on this device.");
          // Throws on a wrong PIN (AES-GCM auth failure) — the modal stays open.
          await decryptWithRecoveryPassword(pin, w.encryptedSecret, w.iv, w.pinSalt);
          pinRequest.resolve(pin);
          setPinRequest(null);
        }}
        onCancel={() => {
          pinRequest?.reject(new Error("PIN entry cancelled."));
          setPinRequest(null);
        }}
      />
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
