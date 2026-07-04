import { predictionsAPI } from '../api/predictions';
import { sortMonthsReverseChronologically } from './dateHelpers';

export const unwrapList = (data) =>
  Array.isArray(data) ? data : (data?.data || []);

export const parseAverageEssentialSpending = (avgData) => avgData?.average ?? 0;

export async function fetchPredictionsForMonth(month) {
  return unwrapList(await predictionsAPI.getPredictionsForMonth(month));
}

export async function fetchAverageEssentialSpending(month) {
  const avgData = await predictionsAPI.getAverageEssentialSpending(month);
  return parseAverageEssentialSpending(avgData);
}

export const getPredictionKey = (prediction) =>
  prediction.prediction_key || prediction.predictionKey;

export const getPredictionMonth = (prediction, fallback) =>
  prediction.date ? prediction.date.substring(0, 7) : fallback;

export const getLatestMonthKey = (months) =>
  sortMonthsReverseChronologically(months)[0]?.month ?? null;
