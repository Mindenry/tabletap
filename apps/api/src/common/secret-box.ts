import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  // Derive a fixed 32-byte key from the access secret. Rotating the access
  // secret intentionally invalidates stored QR ciphertext; QR labels must then
  // be re-issued, which is the safe failure mode.
  const secret = process.env.QR_ENCRYPTION_KEY ?? process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('QR_ENCRYPTION_KEY or JWT_ACCESS_SECRET must be configured');
  }
  return createHash('sha256').update(secret).digest();
}

/** AES-256-GCM: returns base64url(iv).base64url(tag).base64url(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((buffer) => buffer.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}
