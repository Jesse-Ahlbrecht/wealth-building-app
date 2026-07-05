import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useMonthPairBundles } from '../context/PairDataContext';
import { useCategoryData, useTransactionSummary, useMonthPredictions, useRecurringPayments } from '../hooks';
import MonthSummaryCard from '../components/MonthSummaryCard';
import ChartPageStates from '../components/ChartPageStates';
import { sortMonthsReverseChronologically } from '../utils/chartDataHelpers';
import { EMPTY_PAIR_BUNDLE } from '../utils/pairIndexHelpers';

const EMPTY_PREDICTIONS = [];

const MonthlyOverviewPage = () => {
  const { defaultCurrency } = useAppContext();
  const { essentialCategories, availableCategories, refreshCategories } = useCategoryData();
  const { summary, loading, error, loadSummary, refreshSummary } = useTransactionSummary();
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

  const latestMonth = sortedMonths[0];
  const previousMonths = sortedMonths.slice(1);

  const visibleMonths = useMemo(
    () => (showPreviousMonths ? sortedMonths : sortedMonths.slice(0, 1)),
    [showPreviousMonths, sortedMonths]
  );
  const monthPairBundles = useMonthPairBundles(visibleMonths);

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
              monthPairs={monthPairBundles[latestMonth.month] ?? EMPTY_PAIR_BUNDLE}
              predictions={predictions[latestMonthKey] ?? EMPTY_PREDICTIONS}
              recurringPayments={recurringPayments}
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
                    monthPairs={monthPairBundles[month.month] ?? EMPTY_PAIR_BUNDLE}
                    recurringPayments={recurringPayments}
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
