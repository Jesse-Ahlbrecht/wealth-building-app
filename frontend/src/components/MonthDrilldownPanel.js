import React from 'react';
import MonthSummaryCard from './MonthSummaryCard';

const MonthDrilldownPanel = ({
  selectedMonth,
  onClose,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions = [],
  recurringPayments = [],
  transferPairData = { pairs: [], unmatched: [] },
  ibkrDepositPairData = { pairs: [], unmatchedBank: [], unmatchedDeposits: [] },
  averageEssentialSpending = 0,
  onSkipPrediction,
  onDeletePrediction,
  onPredictionChanged,
  onTransactionCategoryUpdated,
  onCategoriesChanged,
  expenseSort,
  onExpenseSortChange
}) => {
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
          predictions={predictions}
          recurringPayments={recurringPayments}
          transferPairData={transferPairData}
          ibkrDepositPairData={ibkrDepositPairData}
          averageEssentialSpending={averageEssentialSpending}
          onSkipPrediction={onSkipPrediction}
          onDeletePrediction={onDeletePrediction}
          onPredictionChanged={onPredictionChanged}
          availableCategories={availableCategories}
          onTransactionCategoryUpdated={onTransactionCategoryUpdated}
          onCategoriesChanged={onCategoriesChanged}
          expenseSort={expenseSort}
          onExpenseSortChange={onExpenseSortChange}
        />
      </div>
    </div>
  );
};

export default MonthDrilldownPanel;
