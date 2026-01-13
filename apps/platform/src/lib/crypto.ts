import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  // Key should be 32 bytes (256 bits) for AES-256
  // Accept hex-encoded (64 chars) or base64-encoded key
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  const decoded = Buffer.from(key, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error(
    "ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)"
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string containing: IV + ciphertext + authTag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: IV + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);

  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Expects format: IV + ciphertext + authTag
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Generate a new random encryption key (for setup).
 * Returns hex-encoded 32-byte key.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
