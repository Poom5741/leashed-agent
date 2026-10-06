// WebAuthn Passkey utilities with PRF (Pseudo-Random Function) extension
// PRF allows us to derive a stable symmetric key from a passkey authenticator,
// which we use to encrypt/decrypt the dacc-js passwordSecretkey.

import { bufferToBase64url, base64urlToBuffer, generateRandomBytes } from "./crypto";

const RP_NAME = "ThaiFi Wallet";

function getRPID(): string {
  // On localhost, use "localhost"; in production, use the domain without port
  return window.location.hostname;
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface PasskeyRegistrationResult {
  credentialId: string; // base64url
  prfSalt: string; // base64url - must be reused during auth
  prfOutput: ArrayBuffer | null; // null if PRF not available during registration
  prfSupported: boolean;
}

/**
 * Register a new passkey with PRF extension support.
 * The PRF salt is generated randomly and stored alongside the wallet.
 * During authentication, the same salt is passed to reproduce the same PRF output.
 */
export async function registerPasskey(): Promise<PasskeyRegistrationResult> {
  const challenge = generateRandomBytes(32);
  const userId = generateRandomBytes(16);
  const prfSalt = generateRandomBytes(32);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    rp: {
      name: RP_NAME,
      id: getRPID(),
    },
    user: {
      id: userId.buffer as ArrayBuffer,
      name: "wallet-user",
      displayName: "Wallet User",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    extensions: {
      // Evaluate PRF during registration so we can encrypt immediately
      prf: {
        eval: {
          first: prfSalt.buffer as ArrayBuffer,
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey registration failed: no credential returned.");
  }

  const credentialId = bufferToBase64url(credential.rawId);

  // Check PRF results
  const extResults = credential.getClientExtensionResults() as unknown as {
    prf?: {
      enabled?: boolean;
      results?: {
        first?: ArrayBuffer;
      };
    };
  };

  const prfSupported = extResults.prf?.enabled === true;
  const prfOutput = extResults.prf?.results?.first ?? null;

  return {
    credentialId,
    prfSalt: bufferToBase64url(prfSalt),
    prfOutput,
    prfSupported,
  };
}

export interface PasskeyAuthResult {
  prfOutput: ArrayBuffer | null;
  prfAvailable: boolean;
}

/**
 * Authenticate with an existing passkey and evaluate PRF.
 * The same prfSalt used during registration must be provided.
 */
export async function authenticateWithPasskey(
  credentialIdBase64url: string,
  prfSaltBase64url: string,
): Promise<PasskeyAuthResult> {
  const challenge = generateRandomBytes(32);
  const allowCredentials: PublicKeyCredentialDescriptor[] = [
    {
      id: base64urlToBuffer(credentialIdBase64url),
      type: "public-key",
    },
  ];

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    rpId: getRPID(),
    allowCredentials,
    userVerification: "required",
    extensions: {
      prf: {
        eval: {
          first: base64urlToBuffer(prfSaltBase64url),
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  const assertion = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Passkey authentication failed: no assertion returned.");
  }

  const extResults = assertion.getClientExtensionResults() as unknown as {
    prf?: {
      results?: {
        first?: ArrayBuffer;
      };
    };
  };

  const prfOutput = extResults.prf?.results?.first ?? null;

  return {
    prfOutput,
    prfAvailable: prfOutput !== null,
  };
}
