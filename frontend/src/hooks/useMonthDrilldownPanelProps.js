import { useCallback } from 'react';

export function useMonthDrilldownPanelProps({
  selectedMonth,
  setSelectedMonth,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions,
  averageEssentialSpending,
  handleSkipPrediction,
  handleDeletePrediction,
  reloadPredictions,
  refreshSummary
}) {
  const selectedMonthKey = selectedMonth?.month;
  const onClose = useCallback(() => setSelectedMonth(null), [setSelectedMonth]);

  return {
    selectedMonth,
    onClose,
    defaultCurrency,
    essentialCategories,
    availableCategories,
    predictions: predictions[selectedMonthKey] || [],
    averageEssentialSpending: averageEssentialSpending[selectedMonthKey] || 0,
    onSkipPrediction: handleSkipPrediction,
    onDeletePrediction: handleDeletePrediction,
    onPredictionChanged: reloadPredictions,
    onTransactionCategoryUpdated: refreshSummary
  };
}
