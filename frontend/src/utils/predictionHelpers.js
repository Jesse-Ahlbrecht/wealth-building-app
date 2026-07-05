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

const RECIPIENT_PREFIXES = ['überweisung von ', 'uberweisung von ', 'twint von '];

export const normalizeRecurringRecipient = (recipient = '') => {
  let value = recipient.trim().replace(/^["']|["']$/g, '');
  value = value.replace(/\s+/g, ' ');
  const lower = value.toLowerCase();
  for (const prefix of RECIPIENT_PREFIXES) {
    if (lower.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }
  return value;
};

export const getRecurringMatchKey = (recipient, category, type = 'expense') =>
  `${normalizeRecurringRecipient(recipient).toLowerCase()}|${category}|${type}`;

export const buildRecurringMatchKeys = (recurringPayments = []) => {
  const keys = new Set();
  recurringPayments.forEach((payment) => {
    if (payment?.enabled === false) return;
    keys.add(getRecurringMatchKey(payment.recipient, payment.category, payment.type || 'expense'));
  });
  return keys;
};

export const isRecurringTransaction = (transaction, recurringMatchKeys) => {
  if (!transaction || transaction.is_predicted || transaction.isPredicted) return false;
  if (!recurringMatchKeys?.size) return false;
  const type = transaction.type === 'income' ? 'income' : 'expense';
  const key = getRecurringMatchKey(transaction.recipient, transaction.category, type);
  return recurringMatchKeys.has(key);
};

export const getLatestMonthKey = (months) =>
  sortMonthsReverseChronologically(months)[0]?.month ?? null;

export const computeAllocationPredictions = ({
  isCurrentMonth,
  averageEssentialSpending,
  essentialTotal,
  nonEssentialTotal,
  splitExpensesTotal,
  income,
  savingsForDisplay
}) => {
  const predictedEssentialAverage = isCurrentMonth ? (averageEssentialSpending || 0) : 0;
  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  const showPredictedGap = isCurrentMonth && predictedEssentialDifference > 0;
  const barEffectiveEssential = showPredictedGap
    ? essentialTotal + predictedEssentialDifference
    : essentialTotal;
  const expenseBarTotal = showPredictedGap
    ? barEffectiveEssential + nonEssentialTotal
    : splitExpensesTotal;
  const effectiveEssentialForSavings = predictedEssentialAverage > 0
    ? Math.max(essentialTotal, predictedEssentialAverage)
    : essentialTotal;
  const predictedSavings = income - (effectiveEssentialForSavings + nonEssentialTotal);
  const savingsMetricValue = isCurrentMonth && predictedSavings !== savingsForDisplay
    ? predictedSavings
    : savingsForDisplay;

  return {
    predictedEssentialAverage,
    predictedEssentialDifference,
    showPredictedGap,
    barEffectiveEssential,
    expenseBarTotal,
    savingsMetricValue
  };
};
