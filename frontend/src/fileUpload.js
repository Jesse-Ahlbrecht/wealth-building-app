/**
 * File upload utilities for the Wealth Management App
 *
 * Security Model:
 * - Files are uploaded in plaintext over HTTPS (TLS)
 * - Server performs encryption at rest (Server-Side Encryption)
 */

/**
 * Create a file upload package for transmission to the server
 * @param {File} file - The file to upload
 * @param {string} sessionToken - User's session token (for metadata, not encryption)
 * @param {Object} metadata - Additional metadata to include
 * @returns {Object} Upload package with formData and metadata
 */
async function createFileUpload(file, sessionToken, metadata = {}) {
  const formData = new FormData();
  // Using 'encryptedFile' field name for backend compatibility, but it contains plaintext
  formData.append('encryptedFile', file);

  // Create metadata package indicating no client-side encryption
  const metadataPackage = {
    nonce: [], 
    keyVersion: null,
    algorithm: 'none',
    originalName: file.name,
    originalSize: file.size,
    originalType: file.type,
    tenantId: metadata.tenantId || 'default',
    uploadedAt: new Date().toISOString(),
    additionalData: [],
    fileMetadata: metadata
  };

  formData.append('encryptionMetadata', JSON.stringify(metadataPackage));

  return {
    formData,
    metadata: metadataPackage
  };
}

// Export function
export {
  createFileUpload
};

