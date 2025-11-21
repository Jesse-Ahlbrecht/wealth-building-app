/**
 * Documents API
 */

import apiClient from './client';

export const documentsAPI = {
  async getDocuments() {
    return apiClient.get('/api/documents');
  },

  async detectType(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    return fetch(`${apiClient.baseURL}/api/documents/detect-type`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiClient.sessionToken}`
      },
      body: formData
    }).then(res => res.json());
  },

  async uploadDocument(file, documentType, onProgress) {
    // Complex upload with progress - kept in App.js for now
    // TODO: Refactor upload logic
    throw new Error('Use uploadBankStatementWithProgress from App.js for now');
  },

  async deleteDocument(documentId) {
    return apiClient.delete(`/api/documents/${documentId}`);
  },

  async deleteDocumentsByType(documentType) {
    return apiClient.delete(`/api/documents/by-type/${documentType}`);
  },

  async downloadDocument(fileId) {
    // Download returns blob, not JSON
    const url = `${apiClient.baseURL}/api/download-statement/${fileId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiClient.sessionToken}`
      }
    });
    return response.blob();
  },

  async wipeData(keepCategories) {
    return apiClient.post('/api/wipe-data', { keep_categories: keepCategories });
  }
};

