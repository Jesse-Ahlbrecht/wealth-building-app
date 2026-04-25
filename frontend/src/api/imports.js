/**
 * Imports API
 */

import apiClient from './client';

export const importsAPI = {
  async getOverview() {
    return apiClient.get('/api/imports');
  },

  async importBatches(batches) {
    return apiClient.post('/api/imports', { batches });
  }
};
