import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCategoryData, useTransactionSummary, useMonthPredictions, useRecurringPayments, useTransferPairs, useIbkrDepositPairs, usePreferenceState } from '../hooks';
import MonthSummaryCard from '../components/MonthSummaryCard';
import ChartPageStates from '../components/ChartPageStates';
import { sortMonthsReverseChronologically } from '../utils/chartDataHelpers';

const MonthlyOverviewPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const { essentialCategories, availableCategories, refreshCategories } = useCategoryData();
  const { summary, loading, error, loadSummary, refreshSummary } = useTransactionSummary();
  const [expenseSort, setExpenseSort] = usePreferenceState(
    'monthlyOverview_expenseSort',
    'amount_desc',
    preferences,
    updatePreferences
  );
  const [showPreviousMonths, setShowPreviousMonths] = useState(false);

  const sortedMonths = useMemo(
    () => sortMonthsReverseChronologically(summary),
    [summary]
  );

  const latestMonthKey = sortedMonths[0]?.month ?? null;
  const {
    predictions,
    averageEssentialSpending,
    reloadPredictions,
    handleSkipPrediction,
    handleDeletePrediction
  } = useMonthPredictions(latestMonthKey);
  const { recurringPayments } = useRecurringPayments();
  const { transferPairData } = useTransferPairs();
  const { ibkrDepositPairData } = useIbkrDepositPairs();

  const latestMonth = sortedMonths[0];
  const previousMonths = sortedMonths.slice(1);

  return (
    <ChartPageStates
      loading={loading}
      error={error}
      isEmpty={!loading && !error && summary.length === 0}
      onRetry={loadSummary}
      loadingMessage="Loading transaction data..."
      containerClassName="current-month-container"
      emptyTitle="No Transaction Data"
      emptyMessage="Upload bank statements to see your monthly overview here."
    >
      {!latestMonth ? (
        <div className="current-month-container">
          <div className="loading">Unable to determine the current month summary.</div>
        </div>
      ) : (
        <>
          <div className="current-month-container">
            <MonthSummaryCard
              month={latestMonth}
              isCurrentMonth={true}
              defaultCurrency={defaultCurrency}
              essentialCategories={essentialCategories}
              expenseSort={expenseSort}
              onExpenseSortChange={setExpenseSort}
              predictions={predictions[latestMonthKey] || []}
              recurringPayments={recurringPayments}
              transferPairData={transferPairData}
              ibkrDepositPairData={ibkrDepositPairData}
              averageEssentialSpending={averageEssentialSpending[latestMonthKey] || 0}
              onSkipPrediction={handleSkipPrediction}
              onDeletePrediction={handleDeletePrediction}
              onPredictionChanged={reloadPredictions}
              availableCategories={availableCategories}
              onTransactionCategoryUpdated={refreshSummary}
              onCategoriesChanged={refreshCategories}
            />
          </div>

          {previousMonths.length > 0 && (
            <>
              <div
                className="content-header"
                style={{
                  marginTop: '3rem',
                  paddingTop: '2rem',
                  borderTop: '2px solid var(--color-border-primary)',
                  cursor: 'pointer'
                }}
                onClick={() => setShowPreviousMonths((open) => !open)}
              >
                <h2>
                  <span style={{ marginRight: '8px' }}>{showPreviousMonths ? '▼' : '▶'}</span>
                  Previous Months ({previousMonths.length})
                </h2>
              </div>
              {showPreviousMonths && previousMonths.map((month) => (
                <div key={month.month} className="current-month-container" style={{ marginTop: '1.5rem' }}>
                  <MonthSummaryCard
                    month={month}
                    isCurrentMonth={false}
                    defaultCurrency={defaultCurrency}
                    essentialCategories={essentialCategories}
                    expenseSort={expenseSort}
                    onExpenseSortChange={setExpenseSort}
                    recurringPayments={recurringPayments}
                    transferPairData={transferPairData}
              ibkrDepositPairData={ibkrDepositPairData}
                    availableCategories={availableCategories}
                    onTransactionCategoryUpdated={refreshSummary}
                    onCategoriesChanged={refreshCategories}
                  />
                </div>
              ))}
            </>
          )}
        </>
      )}
    </ChartPageStates>
  );
};

export default MonthlyOverviewPage;
