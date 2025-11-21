/**
 * Transactions API
 */

import apiClient from './client';

export const transactionsAPI = {
  async getTransactions() {
    return apiClient.get('/api/transactions');
  },

  async getSummary() {
    return apiClient.get('/api/summary');
  },

  async updateCategory(transaction, newCategory) {
    return apiClient.post('/api/update-category', { transaction, newCategory });
  }
};

