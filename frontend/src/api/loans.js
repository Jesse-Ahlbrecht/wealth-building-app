/**
 * Loans API
 */

import apiClient from './client';

export const loansAPI = {
  async getLoans() {
    return apiClient.get('/api/loans');
  }
};

