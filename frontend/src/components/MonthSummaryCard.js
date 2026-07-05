import React, { useCallback, useMemo } from 'react';
import { formatMonth } from '../utils';
import { getCategoryNames } from '../utils/categoryHelpers';
import {
  computeMonthExpenseBreakdown,
  mergeSavingsCategories,
  sumCategoryAmounts
} from '../utils/categoryHelpers';
import { buildRecurringMatchKeys } from '../utils/predictionHelpers';
import { useMonthPairBundle } from '../context/PairDataContext';
import { useCategoryTransactionIndex } from '../hooks/useCategoryTransactionIndex';
import CategoryEditModal from './CategoryEditModal';
import PredictionEditModal from './PredictionEditModal';
import CollapsibleBreakdownSection from './CollapsibleBreakdownSection';
import MonthMetricsSection from './MonthMetricsSection';
import MonthCategoryBreakdown from './MonthCategoryBreakdown';
import MonthInternalTransfersSection from './MonthInternalTransfersSection';
import TransactionListItem from './TransactionListItem';

const EMPTY_INTERNAL_TXNS = [];

const MonthSummaryCard = ({
  month,
  isCurrentMonth,
  defaultCurrency = 'CHF',
  essentialCategories = [],
  expenseSort = 'amount_desc',
  onExpenseSortChange = () => {},
  predictions = [],
  recurringPayments = [],
  averageEssentialSpending = 0,
  onSkipPrediction = () => {},
  onDeletePrediction = () => {},
  onPredictionChanged = () => {},
  availableCategories = { income: [], expense: [] },
  onTransactionCategoryUpdated = () => {},
  onCategoriesChanged = () => {}
}) => {
  const [categoryModal, setCategoryModal] = React.useState(null);
  const [predictionMenu, setPredictionMenu] = React.useState(null);
  const [predictionModal, setPredictionModal] = React.useState(null);
  const [expandedCategories, setExpandedCategories] = React.useState({});
  const [expandedSections, setExpandedSections] = React.useState({});
  const [expandedPairs, setExpandedPairs] = React.useState({});

  const expenseBreakdown = useMemo(
    () => computeMonthExpenseBreakdown(month, essentialCategories),
    [month, essentialCategories]
  );

  const {
    essential: essentialExpenses,
    nonEssential: nonEssentialExpenses,
    expenseSavingsCategories,
    essentialTotal,
    nonEssentialTotal,
    splitExpensesTotal,
    savings: savingsForDisplay,
    income
  } = expenseBreakdown;

  const savingsCategories = useMemo(
    () => mergeSavingsCategories(month, expenseSavingsCategories),
    [month, expenseSavingsCategories]
  );

  const savingsCategoryTotal = sumCategoryAmounts(savingsCategories);
  const otherExpenseAmount = month?.expenseCategories?.Other || 0;
  const { nonEssentialWithoutOther, nonEssentialWithoutOtherTotal } = useMemo(() => {
    const copy = { ...nonEssentialExpenses };
    delete copy.Other;
    return {
      nonEssentialWithoutOther: copy,
      nonEssentialWithoutOtherTotal: sumCategoryAmounts(copy)
    };
  }, [nonEssentialExpenses]);

  const expenseCategoryNames = useMemo(
    () => getCategoryNames(availableCategories?.expense),
    [availableCategories?.expense]
  );
  const incomeCategoryNames = useMemo(
    () => getCategoryNames(availableCategories?.income),
    [availableCategories?.income]
  );
  const recurringMatchKeys = useMemo(
    () => buildRecurringMatchKeys(recurringPayments),
    [recurringPayments]
  );

  const internalTransferTotal = month?.internalTransferTotal || 0;
  const internalTransferTransactions = month?.internalTransferTransactions ?? EMPTY_INTERNAL_TXNS;
  const monthPairs = useMonthPairBundle(
    month?.month,
    internalTransferTotal > 0 ? internalTransferTransactions : EMPTY_INTERNAL_TXNS
  );

  const categoryIndex = useCategoryTransactionIndex({
    month,
    expenseSort,
    predictions,
    isCurrentMonth
  });
  const { getCount, getTransactions, sortConfig } = categoryIndex;
  const { sortField, sortDirection } = sortConfig;

  const predictedEssentialAverage = isCurrentMonth ? (averageEssentialSpending || 0) : 0;
  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  const effectiveEssential = predictedEssentialAverage > 0 ? Math.max(essentialTotal, predictedEssentialAverage) : essentialTotal;
  const totalPredictedExpenses = effectiveEssential + nonEssentialTotal;
  const predictedSavings = income - totalPredictedExpenses;
  const savingsMetricValue = isCurrentMonth && predictedSavings !== savingsForDisplay ? predictedSavings : savingsForDisplay;
  const metricMaxValue = Math.max(income, splitExpensesTotal, Math.abs(savingsMetricValue));

  const toggleCategory = useCallback((categoryKey) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  }, []);

  const togglePair = useCallback((pairKey) => {
    setExpandedPairs((prev) => ({
      ...prev,
      [pairKey]: !prev[pairKey]
    }));
  }, []);

  const handleSortToggle = useCallback((field) => {
    const nextDirection = sortField === field && sortDirection === 'desc' ? 'asc' : 'desc';
    onExpenseSortChange(`${field}_${nextDirection}`);
  }, [sortField, sortDirection, onExpenseSortChange]);

  const renderTransactionItem = (txn, idx, { dismissible = false } = {}) => (
    <TransactionListItem
      key={idx}
      txn={txn}
      idx={idx}
      defaultCurrency={defaultCurrency}
      recurringMatchKeys={recurringMatchKeys}
      ibkrMatchByBankHash={monthPairs.ibkrMatchByBankHash}
      monthKey={month.month}
      incomeCategoryNames={incomeCategoryNames}
      expenseCategoryNames={expenseCategoryNames}
      dismissible={dismissible}
      onCategoryEdit={(transaction) => setCategoryModal({
        transaction,
        currentCategory: transaction.category || '',
        monthKey: month.month
      })}
      predictionMenu={predictionMenu}
      onPredictionMenuChange={setPredictionMenu}
      onSkipPrediction={onSkipPrediction}
      onCustomizePrediction={setPredictionModal}
      onDeletePrediction={onDeletePrediction}
    />
  );

  return (
    <>
      <CategoryEditModal
        modal={categoryModal}
        onClose={() => setCategoryModal(null)}
        onUpdated={onTransactionCategoryUpdated}
        onCategoriesChanged={onCategoriesChanged}
        availableCategories={availableCategories}
        essentialCategories={essentialCategories}
      />
      {predictionModal && (
        <PredictionEditModal
          payment={{
            prediction_key: predictionModal.prediction_key || predictionModal.predictionKey,
            recipient: predictionModal.recipient,
            category: predictionModal.category,
            recurrence_type: predictionModal.recurrence_type || predictionModal.recurrenceType || 'monthly',
            amount: Math.abs(predictionModal.amount || 0),
            day: predictionModal.date ? new Date(predictionModal.date).getDate() : '',
            currency: predictionModal.currency || defaultCurrency,
            enabled: true
          }}
          onClose={() => setPredictionModal(null)}
          onSaved={onPredictionChanged}
        />
      )}

      <div className="current-month-header">
        <div>
          <h3>{formatMonth(month.month)}</h3>
          {isCurrentMonth && <p>Current Month</p>}
        </div>
      </div>

      <MonthMetricsSection
        income={income}
        essentialTotal={essentialTotal}
        nonEssentialTotal={nonEssentialTotal}
        savingsCategoryTotal={savingsCategoryTotal}
        splitExpensesTotal={splitExpensesTotal}
        savingsMetricValue={savingsMetricValue}
        metricMaxValue={metricMaxValue}
        defaultCurrency={defaultCurrency}
        isCurrentMonth={isCurrentMonth}
        predictedEssentialAverage={predictedEssentialAverage}
        predictedEssentialDifference={predictedEssentialDifference}
      />

      <MonthCategoryBreakdown
        month={month}
        defaultCurrency={defaultCurrency}
        isCurrentMonth={isCurrentMonth}
        expandedCategories={expandedCategories}
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
        toggleCategory={toggleCategory}
        essentialExpenses={essentialExpenses}
        essentialTotal={essentialTotal}
        nonEssentialWithoutOther={nonEssentialWithoutOther}
        nonEssentialWithoutOtherTotal={nonEssentialWithoutOtherTotal}
        otherExpenseAmount={otherExpenseAmount}
        savingsCategories={savingsCategories}
        savingsCategoryTotal={savingsCategoryTotal}
        predictedEssentialAverage={predictedEssentialAverage}
        getCount={getCount}
        getTransactions={getTransactions}
        renderTransactionItem={renderTransactionItem}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortToggle={handleSortToggle}
      />

      {internalTransferTotal > 0 && (
        <CollapsibleBreakdownSection
          monthKey={month.month}
          sectionId="internal-transfers-section"
          title="Internal Transfers"
          total={internalTransferTotal}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
        >
          <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px' }}>
            <MonthInternalTransfersSection
              monthKey={month.month}
              defaultCurrency={defaultCurrency}
              internalTransferTransactions={internalTransferTransactions}
              monthPairs={monthPairs}
              sortConfig={sortConfig}
              expandedPairs={expandedPairs}
              onTogglePair={togglePair}
              renderTransactionItem={renderTransactionItem}
            />
          </div>
        </CollapsibleBreakdownSection>
      )}
    </>
  );
};

export default React.memo(MonthSummaryCard);
