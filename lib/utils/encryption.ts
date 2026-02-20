/**
 * Encryption Service
 * Handles AES-256-GCM encryption for sensitive data at rest
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

import { log } from '@/lib/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

/**
 * Get encryption key from environment
 * Derives a 32-byte key using scrypt if needed
 */
function getEncryptionKey(salt: Buffer): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (!envKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Use scrypt to derive a 32-byte key from the environment key
  return scryptSync(envKey, salt, 32);
}

/**
 * Encrypt plaintext using AES-256-GCM
 */
export function encrypt(plaintext: string): EncryptedData {
  try {
    // Generate random salt and IV
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive encryption key
    const key = getEncryptionKey(salt);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    };
  } catch (error) {
    log.error('Encryption failed', error instanceof Error ? error : new Error(String(error)));
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export function decrypt(encryptedData: EncryptedData): string {
  try {
    // Decode components
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

    // Derive encryption key
    const key = getEncryptionKey(salt);

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    log.error('Decryption failed', error instanceof Error ? error : new Error(String(error)));
    throw new Error('Failed to decrypt data - data may be corrupted or key may be invalid');
  }
}

/**
 * Serialize encrypted data to a string for storage
 */
export function serializeEncrypted(data: EncryptedData): string {
  return JSON.stringify(data);
}

/**
 * Deserialize encrypted data from storage string
 */
export function deserializeEncrypted(serialized: string): EncryptedData {
  try {
    return JSON.parse(serialized) as EncryptedData;
  } catch (error) {
    log.error(
      'Failed to deserialize encrypted data',
      error instanceof Error ? error : new Error(String(error))
    );
    throw new Error('Invalid encrypted data format');
  }
}

/**
 * Check if a string appears to be encrypted data (JSON with expected fields)
 */
export function isEncrypted(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'ciphertext' in parsed &&
      'iv' in parsed &&
      'authTag' in parsed &&
      'salt' in parsed
    );
  } catch {
    return false;
  }
}
