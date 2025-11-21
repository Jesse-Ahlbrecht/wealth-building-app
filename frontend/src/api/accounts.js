/**
 * Accounts API
 */

import apiClient from './client';

export const accountsAPI = {
  async getAccounts() {
    return apiClient.get('/api/accounts');
  }
};

