/**
 * Predictions API
 */

import apiClient from './client';

export const predictionsAPI = {
  async getPredictionsForMonth(month) {
    return apiClient.get(`/api/predictions/month/${month}`);
  },

  async getAverageEssentialSpending(month) {
    return apiClient.get(`/api/predictions/average-essential/${month}`);
  },

  async skipPredictionForMonth(predictionKey, month) {
    return apiClient.post('/api/predictions/dismiss', {
      prediction_key: predictionKey,
      scope: 'month',
      month
    });
  },

  async getRecurringPayments() {
    return apiClient.get('/api/predictions/recurring');
  },

  async updateRecurringPayment(predictionKey, payload) {
    return apiClient.put(`/api/predictions/recurring/${predictionKey}`, payload);
  }
};
