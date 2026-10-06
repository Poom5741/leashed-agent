// IndexedDB storage for the encrypted wallet blob.
// Stores: address, daccPublickey, encrypted passwordSecretkey, PRF salt, credential ID.

const DB_NAME = "thaifi-wallet";
const DB_VERSION = 1;
const STORE_NAME = "wallet";

export interface StoredWallet {
  address: string;
  daccPublickey: string;
  encryptedSecret: string; // base64 (AES-GCM ciphertext)
  iv: string; // base64 (AES-GCM IV)
  prfSalt: string; // base64url
  credentialId: string; // base64url
  prfSupported: boolean;
  createdAt: number;
  /** D1 account (user id) this wallet belongs to — one wallet per account. */
  ownerUserId?: string;
  /** Key guard: passkey (default, PRF-wrapped) or "pin" (PIN-wrapped, risky). */
  guard?: "passkey" | "pin";
  /** base64 salt for the PIN KDF (pin-guard wallets only). */
  pinSalt?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveWallet(wallet: StoredWallet): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(wallet, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get("current");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteWallet(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete("current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
