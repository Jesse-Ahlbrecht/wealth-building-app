/**
 * Accounts API
 */

import apiClient from './client';

export const accountsAPI = {
  async getAccounts() {
    return apiClient.get('/api/accounts');
  },

  async renameAccount(accountId, name) {
    return apiClient.put(`/api/accounts/${accountId}`, { name });
  },

  async deleteAccount(accountId) {
    return apiClient.delete(`/api/accounts/${accountId}`);
  }
};

