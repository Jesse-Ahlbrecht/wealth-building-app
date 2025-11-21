/**
 * Broker API
 */

import apiClient from './client';

export const brokerAPI = {
  async getBroker() {
    return apiClient.get('/api/broker');
  },

  async getHistoricalValuation() {
    return apiClient.get('/api/broker/historical-valuation');
  }
};

