const EMPTY_PREDICTIONS = [];

export function useMonthDrilldownPanelProps({
  selectedMonth,
  setSelectedMonth,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions,
  recurringPayments,
  averageEssentialSpending,
  handleSkipPrediction,
  handleDeletePrediction,
  reloadPredictions,
  refreshSummary,
  refreshCategories,
  valueMode = 'absolute'
}) {
  const selectedMonthKey = selectedMonth?.month;

  return {
    selectedMonth,
    defaultCurrency,
    essentialCategories,
    availableCategories,
    predictions: predictions[selectedMonthKey] ?? EMPTY_PREDICTIONS,
    recurringPayments,
    averageEssentialSpending: averageEssentialSpending[selectedMonthKey] || 0,
    onSkipPrediction: handleSkipPrediction,
    onDeletePrediction: handleDeletePrediction,
    onPredictionChanged: reloadPredictions,
    onTransactionCategoryUpdated: refreshSummary,
    onCategoriesChanged: refreshCategories,
    valueMode
  };
}
