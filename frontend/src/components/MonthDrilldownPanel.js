import React from 'react';
import { useMonthPairSlice } from '../context/PairDataContext';
import { EMPTY_PAIR_SLICE } from '../utils/pairIndexHelpers';
import MonthSummaryCard from './MonthSummaryCard';

const MonthDrilldownPanel = ({
  selectedMonth,
  onClose,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions = [],
  recurringPayments = [],
  averageEssentialSpending = 0,
  onSkipPrediction,
  onDeletePrediction,
  onPredictionChanged,
  onTransactionCategoryUpdated,
  onCategoriesChanged
}) => {
  const monthPairSlice = useMonthPairSlice(selectedMonth?.month);

  if (!selectedMonth) return null;

  return (
    <div id="drilldown-details" className="drilldown-details">
      <button
        className="drilldown-close"
        onClick={onClose}
        title="Close details"
      >
        ✕
      </button>
      <div className="current-month-container">
        <MonthSummaryCard
          month={selectedMonth}
          isCurrentMonth={false}
          defaultCurrency={defaultCurrency}
          essentialCategories={essentialCategories}
          monthPairSlice={monthPairSlice ?? EMPTY_PAIR_SLICE}
          predictions={predictions}
          recurringPayments={recurringPayments}
          averageEssentialSpending={averageEssentialSpending}
          onSkipPrediction={onSkipPrediction}
          onDeletePrediction={onDeletePrediction}
          onPredictionChanged={onPredictionChanged}
          availableCategories={availableCategories}
          onTransactionCategoryUpdated={onTransactionCategoryUpdated}
          onCategoriesChanged={onCategoriesChanged}
        />
      </div>
    </div>
  );
};

export default MonthDrilldownPanel;
