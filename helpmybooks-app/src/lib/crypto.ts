import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for tokens at rest (Xero access/refresh tokens).
 * Key comes from XERO_TOKEN_ENCRYPTION_KEY — accepts base64 or hex, must
 * decode to exactly 32 bytes. Generate with: openssl rand -base64 32
 */
function getKey(): Buffer {
  const raw = process.env.XERO_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("XERO_TOKEN_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("XERO_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)");
  }
  return key;
}

export function hasEncryptionKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns "iv:authTag:ciphertext", all base64, colon-separated. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
