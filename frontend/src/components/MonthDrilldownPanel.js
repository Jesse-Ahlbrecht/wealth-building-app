import React from 'react';
import MonthSummaryCard from './MonthSummaryCard';

const MonthDrilldownPanel = ({
  selectedMonth,
  onClose,
  defaultCurrency,
  essentialCategories,
  availableCategories,
  predictions = [],
  averageEssentialSpending = 0,
  onSkipPrediction,
  onDeletePrediction,
  onPredictionChanged,
  onTransactionCategoryUpdated,
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
          averageEssentialSpending={averageEssentialSpending}
          onSkipPrediction={onSkipPrediction}
          onDeletePrediction={onDeletePrediction}
          onPredictionChanged={onPredictionChanged}
          availableCategories={availableCategories}
          onTransactionCategoryUpdated={onTransactionCategoryUpdated}
          expenseSort={expenseSort}
          onExpenseSortChange={onExpenseSortChange}
        />
      </div>
    </div>
  );
};

export default MonthDrilldownPanel;
