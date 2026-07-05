import { useCallback } from 'react';

export function useMonthDrilldownPanelProps({
  selectedMonth,
  setSelectedMonth,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions,
  recurringPayments,
  transferPairData,
  ibkrDepositPairData,
  averageEssentialSpending,
  handleSkipPrediction,
  handleDeletePrediction,
  reloadPredictions,
  refreshSummary,
  refreshCategories
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
    recurringPayments,
    transferPairData,
    ibkrDepositPairData,
    averageEssentialSpending: averageEssentialSpending[selectedMonthKey] || 0,
    onSkipPrediction: handleSkipPrediction,
    onDeletePrediction: handleDeletePrediction,
    onPredictionChanged: reloadPredictions,
    onTransactionCategoryUpdated: refreshSummary,
    onCategoriesChanged: refreshCategories
  };
}
