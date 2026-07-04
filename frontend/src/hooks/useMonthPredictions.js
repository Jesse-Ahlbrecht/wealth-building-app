import { useState, useCallback, useEffect, useRef } from 'react';
import { predictionsAPI } from '../api';
import {
  getPredictionKey,
  getPredictionMonth,
  fetchPredictionsForMonth,
  fetchAverageEssentialSpending
} from '../utils/predictionHelpers';

export function useMonthPredictions(monthKey) {
  const [predictions, setPredictions] = useState({});
  const [averageEssentialSpending, setAverageEssentialSpending] = useState({});
  const cacheRef = useRef({ predictions: {}, averages: {} });

  const loadPredictionsForMonth = useCallback(async (month, { force = false } = {}) => {
    if (!month) return;
    if (!force && cacheRef.current.predictions[month] !== undefined) return;
    try {
      const predictionsData = await fetchPredictionsForMonth(month);
      cacheRef.current.predictions[month] = predictionsData;
      setPredictions((prev) => ({ ...prev, [month]: predictionsData }));
    } catch (err) {
      console.error(`Error loading predictions for ${month}:`, err);
      cacheRef.current.predictions[month] = [];
      setPredictions((prev) => ({ ...prev, [month]: [] }));
    }
  }, []);

  const loadAverageEssentialSpending = useCallback(async (month, { force = false } = {}) => {
    if (!month) return;
    if (!force && cacheRef.current.averages[month] !== undefined) return;
    try {
      const average = await fetchAverageEssentialSpending(month);
      cacheRef.current.averages[month] = average;
      setAverageEssentialSpending((prev) => ({ ...prev, [month]: average }));
    } catch (err) {
      console.error(`Error loading average essential spending for ${month}:`, err);
      cacheRef.current.averages[month] = 0;
      setAverageEssentialSpending((prev) => ({ ...prev, [month]: 0 }));
    }
  }, []);

  useEffect(() => {
    if (!monthKey) return;
    loadPredictionsForMonth(monthKey);
    loadAverageEssentialSpending(monthKey);
  }, [monthKey, loadPredictionsForMonth, loadAverageEssentialSpending]);

  const reloadPredictions = useCallback(() => {
    if (!monthKey) return Promise.resolve();
    return loadPredictionsForMonth(monthKey, { force: true });
  }, [monthKey, loadPredictionsForMonth]);

  const handleSkipPrediction = useCallback(async (prediction, fallbackMonth) => {
    const month = getPredictionMonth(prediction, fallbackMonth || monthKey);
    if (!month) return;
    try {
      await predictionsAPI.skipPredictionForMonth(getPredictionKey(prediction), month);
      await loadPredictionsForMonth(month, { force: true });
    } catch (err) {
      console.error('Error skipping prediction:', err);
    }
  }, [monthKey, loadPredictionsForMonth]);

  const handleDeletePrediction = useCallback(async (prediction, fallbackMonth) => {
    const month = fallbackMonth || monthKey;
    try {
      await predictionsAPI.updateRecurringPayment(getPredictionKey(prediction), {
        recipient: prediction.recipient,
        category: prediction.category,
        enabled: false
      });
      if (month) {
        await loadPredictionsForMonth(month, { force: true });
      }
    } catch (err) {
      console.error('Error deleting prediction:', err);
    }
  }, [monthKey, loadPredictionsForMonth]);

  return {
    predictions,
    averageEssentialSpending,
    loadPredictionsForMonth,
    reloadPredictions,
    handleSkipPrediction,
    handleDeletePrediction
  };
}
