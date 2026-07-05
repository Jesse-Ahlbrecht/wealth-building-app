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

  async getTransferPairs() {
    return apiClient.get('/api/transactions/transfer-pairs');
  },

  async getRefundPairs() {
    return apiClient.get('/api/transactions/refund-pairs');
  },

  async getIbkrDepositPairs() {
    return apiClient.get('/api/transactions/ibkr-deposit-pairs');
  },

  async updateCategory(transaction, newCategory) {
    return apiClient.post('/api/update-category', { transaction, newCategory });
  }
};

