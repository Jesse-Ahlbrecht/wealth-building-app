/**
 * File upload utilities for the Wealth Management App
 *
 * Security Model:
 * - Files are uploaded as raw files over HTTPS (TLS)
 * - Server performs encryption at rest (Server-Side Encryption)
 */

/**
 * Create a file upload FormData for transmission to the server
 * @param {File} file - The file to upload
 * @param {string} documentType - The document type identifier
 * @returns {FormData} FormData with file and documentType
 */
function createFileUpload(file, documentType) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  return formData;
}

// Export function
export {
  createFileUpload
};

