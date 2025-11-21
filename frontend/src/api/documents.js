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
    return apiClient.post('/api/wipe-data', { keep_custom_categories: keepCategories });
  },

  async getUploadProgress(documentId) {
    const sessionToken = typeof window !== 'undefined' ? sessionStorage.getItem('sessionToken') : null;
    const response = await fetch(`${apiClient.baseURL}/api/upload-progress/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get progress: ${response.statusText}`);
    }
    
    const responseData = await response.json();
    // Extract data from signed response (wrapped by auth middleware)
    const data = responseData.data !== undefined ? responseData.data : responseData;
    
    // Ensure we have valid progress data
    return {
      status: data.status || 'processing',
      progress: data.progress !== undefined ? data.progress : 0,
      message: data.message || 'Processing...',
      processed: data.processed !== undefined && data.processed !== null ? data.processed : undefined,
      total: data.total !== undefined && data.total !== null ? data.total : undefined
    };
  }
};

