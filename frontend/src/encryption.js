/**
 * Client-side AES-256-GCM encryption utilities for the Wealth Management App
 *
 * Implements the client-side encryption strategy from wealth.plan.md:
 * - AES-GCM encryption of bank statement files before upload
 * - Key derivation from session tokens for client-side encryption
 * - Double encryption: client encrypts, server adds secondary layer
 *
 * Security Model:
 * - Files are encrypted in the browser using AES-GCM
 * - Encryption keys are derived from session tokens
 * - Ciphertext + nonce + key version metadata is sent to server
 * - Server stores encrypted blobs with additional server-side encryption
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12; // 96 bits for GCM

/**
 * Generate a cryptographically secure random nonce
 */
function generateNonce() {
  return crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
}

/**
 * Derive an encryption key from a session token
 * Uses PBKDF2 with high iteration count for key derivation
 */
async function deriveEncryptionKey(sessionToken, salt = 'wealth-app-client') {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionToken),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltBytes = encoder.encode(salt);

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000, // High iteration count for security
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Encrypt file data using AES-GCM
 */
async function encryptFile(file, sessionToken, tenantId = 'default') {
  try {
    const fileData = await file.arrayBuffer();
    const key = await deriveEncryptionKey(sessionToken, `wealth-file-${tenantId}`);

    const nonce = generateNonce();

    // Additional authenticated data (AAD) - includes filename for integrity
    const encoder = new TextEncoder();
    const additionalData = encoder.encode(`${file.name}:${file.size}:${file.lastModified}`);

    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: nonce,
        additionalData: additionalData
      },
      key,
      fileData
    );

    // Return encrypted package with metadata
    return {
      encryptedData: new Uint8Array(encryptedData),
      nonce: nonce,
      keyVersion: 'client-v1', // Version for key derivation scheme
      algorithm: ENCRYPTION_ALGORITHM,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type,
      tenantId: tenantId,
      encryptedAt: new Date().toISOString(),
      additionalData: additionalData
    };

  } catch (error) {
    throw new Error(`File encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt file data using AES-GCM
 * Note: This is primarily for client-side caching/decryption of downloaded files
 */
async function decryptFile(encryptedPackage, sessionToken) {
  try {
    const { encryptedData, nonce, keyVersion, tenantId, additionalData } = encryptedPackage;

    const key = await deriveEncryptionKey(sessionToken, `wealth-file-${tenantId || 'default'}`);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: nonce,
        additionalData: additionalData
      },
      key,
      encryptedData
    );

    return new Uint8Array(decryptedData);

  } catch (error) {
    throw new Error(`File decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt JSON data for secure transmission
 */
async function encryptJsonData(data, sessionToken, tenantId = 'default') {
  try {
    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(data);
    const jsonData = encoder.encode(jsonString);

    const key = await deriveEncryptionKey(sessionToken, `wealth-json-${tenantId}`);
    const nonce = generateNonce();

    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: nonce
      },
      key,
      jsonData
    );

    return {
      encryptedData: new Uint8Array(encryptedData),
      nonce: nonce,
      keyVersion: 'client-v1',
      algorithm: ENCRYPTION_ALGORITHM,
      tenantId: tenantId,
      encryptedAt: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`JSON encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt JSON data
 */
async function decryptJsonData(encryptedPackage, sessionToken) {
  try {
    const { encryptedData, nonce, tenantId } = encryptedPackage;

    const key = await deriveEncryptionKey(sessionToken, `wealth-json-${tenantId || 'default'}`);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: nonce
      },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedData);
    return JSON.parse(jsonString);

  } catch (error) {
    throw new Error(`JSON decryption failed: ${error.message}`);
  }
}

/**
 * Create a secure file upload package
 * This prepares encrypted file data for transmission to the server
 */
async function createSecureUpload(file, sessionToken, metadata = {}) {
  const encryptedPackage = await encryptFile(file, sessionToken, metadata.tenantId);

  // Create FormData for upload
  const formData = new FormData();

  // Add encrypted file data
  const encryptedBlob = new Blob([encryptedPackage.encryptedData]);
  formData.append('encryptedFile', encryptedBlob);

  // Add encryption metadata as JSON
  const metadataPackage = {
    nonce: Array.from(encryptedPackage.nonce),
    keyVersion: encryptedPackage.keyVersion,
    algorithm: encryptedPackage.algorithm,
    originalName: encryptedPackage.originalName,
    originalSize: encryptedPackage.originalSize,
    originalType: encryptedPackage.originalType,
    tenantId: encryptedPackage.tenantId,
    encryptedAt: encryptedPackage.encryptedAt,
    additionalData: Array.from(encryptedPackage.additionalData),
    fileMetadata: metadata
  };

  formData.append('encryptionMetadata', JSON.stringify(metadataPackage));

  return {
    formData,
    metadata: metadataPackage,
    encryptedPackage
  };
}

/**
 * Utility to check if Web Crypto API is available and supports required algorithms
 */
function checkCryptoSupport() {
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  if (!crypto.subtle.importKey || !crypto.subtle.deriveKey ||
      !crypto.subtle.encrypt || !crypto.subtle.decrypt) {
    throw new Error('Required Web Crypto operations not supported');
  }

  // Check for AES-GCM support
  return crypto.subtle.generateKey(
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  ).then(() => true).catch(() => false);
}

/**
 * Get encryption capabilities info for debugging
 */
async function getEncryptionInfo() {
  const isSupported = await checkCryptoSupport();

  return {
    webCryptoSupported: !!crypto?.subtle,
    aesGcmSupported: isSupported,
    algorithm: ENCRYPTION_ALGORITHM,
    keyLength: KEY_LENGTH,
    nonceLength: NONCE_LENGTH
  };
}

// Export functions
export {
  encryptFile,
  decryptFile,
  encryptJsonData,
  decryptJsonData,
  createSecureUpload,
  checkCryptoSupport,
  getEncryptionInfo,
  deriveEncryptionKey
};

