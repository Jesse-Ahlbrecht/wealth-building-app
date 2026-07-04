import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCategoryData, useTransactionSummary, useMonthPredictions, usePreferenceState } from '../hooks';
import MonthSummaryCard from '../components/MonthSummaryCard';
import ChartPageStates from '../components/ChartPageStates';
import { getLatestMonthKey } from '../utils/predictionHelpers';

const MonthlyOverviewPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const { essentialCategories, availableCategories } = useCategoryData();
  const { summary, loading, error, loadSummary, refreshSummary } = useTransactionSummary();
  const [includeLoanPayments, setIncludeLoanPayments] = usePreferenceState(
    'monthlyOverview_includeLoanPayments',
    false,
    preferences,
    updatePreferences
  );
  const [expenseSort, setExpenseSort] = usePreferenceState(
    'monthlyOverview_expenseSort',
    'amount_desc',
    preferences,
    updatePreferences
  );

  const latestMonthKey = getLatestMonthKey(summary);
  const {
    predictions,
    averageEssentialSpending,
    reloadPredictions,
    handleSkipPrediction,
    handleDeletePrediction
  } = useMonthPredictions(latestMonthKey);

  const sortedMonths = useMemo(
    () => [...summary].sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01')),
    [summary]
  );

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
          <div className="details-controls">
            <div className="loan-payment-toggle">
              <button
                className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
                onClick={() => setIncludeLoanPayments(!includeLoanPayments)}
                title="Include monthly loan payments in savings calculation"
              >
                Include loans in saving
              </button>
            </div>
          </div>

          <div className="current-month-container">
            <MonthSummaryCard
              month={latestMonth}
              isCurrentMonth={true}
              defaultCurrency={defaultCurrency}
              essentialCategories={essentialCategories}
              includeLoanPayments={includeLoanPayments}
              expenseSort={expenseSort}
              onExpenseSortChange={setExpenseSort}
              predictions={predictions[latestMonthKey] || []}
              averageEssentialSpending={averageEssentialSpending[latestMonthKey] || 0}
              onSkipPrediction={handleSkipPrediction}
              onDeletePrediction={handleDeletePrediction}
              onPredictionChanged={reloadPredictions}
              availableCategories={availableCategories}
              onTransactionCategoryUpdated={refreshSummary}
            />
          </div>

          {previousMonths.length > 0 && (
            <>
              <div className="content-header" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid var(--color-border-primary)' }}>
                <h2>Previous Months</h2>
              </div>
              {previousMonths.map((month) => (
                <div key={month.month} className="current-month-container" style={{ marginTop: '1.5rem' }}>
                  <MonthSummaryCard
                    month={month}
                    isCurrentMonth={false}
                    defaultCurrency={defaultCurrency}
                    essentialCategories={essentialCategories}
                    includeLoanPayments={includeLoanPayments}
                    expenseSort={expenseSort}
                    onExpenseSortChange={setExpenseSort}
                    availableCategories={availableCategories}
                    onTransactionCategoryUpdated={refreshSummary}
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
