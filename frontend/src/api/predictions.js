/**
 * Predictions API
 */

import apiClient from './client';

export const predictionsAPI = {
  async dismissPrediction(predictionKey, recurrenceType) {
    return apiClient.post('/api/predictions/dismiss', {
      prediction_key: predictionKey,
      recurrence_type: recurrenceType
    });
  }
};

