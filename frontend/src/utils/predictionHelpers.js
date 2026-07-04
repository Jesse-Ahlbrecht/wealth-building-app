import { predictionsAPI } from '../api/predictions';

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

export const getLatestMonthKey = (months) => {
  if (!months?.length) return null;
  const sorted = [...months].sort(
    (a, b) => new Date(b.month + '-01') - new Date(a.month + '-01')
  );
  return sorted[0]?.month ?? null;
};
