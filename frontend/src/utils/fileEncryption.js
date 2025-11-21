/**
 * File Encryption Utilities
 * 
 * NOTE: Client-side encryption has been removed.
 * Files are now uploaded as raw files and encrypted server-side.
 */

// These functions are kept for backward compatibility but are no longer used
export const encryptFile = async (file, sessionToken, tenantId) => {
  throw new Error('Client-side encryption has been removed. Upload files directly.');
};

export const decryptFile = async (encryptedData, sessionToken, metadata) => {
  throw new Error('Client-side decryption has been removed.');
};

