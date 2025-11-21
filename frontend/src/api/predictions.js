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

  async dismissPrediction(predictionKey, recurrenceType = 'monthly') {
    return apiClient.post('/api/predictions/dismiss', {
      prediction_key: predictionKey,
      recurrence_type: recurrenceType
    });
  }
};
