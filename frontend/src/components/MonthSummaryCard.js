import React, { useCallback, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatMonth } from '../utils';
import { getCategoryNames } from '../utils/categoryHelpers';
import {
  computeMonthExpenseBreakdown,
  mergeSavingsCategories,
  sumCategoryAmounts
} from '../utils/categoryHelpers';
import { buildRecurringMatchKeys, computeAllocationPredictions } from '../utils/predictionHelpers';
import { EMPTY_PAIR_SLICE, getInternalTransferTransactions } from '../utils/pairIndexHelpers';
import { useCategoryTransactionIndex, usePreferenceState } from '../hooks';
import { useCockpitDisplay } from '../context/CockpitDisplayContext';
import { PredictionMenuProvider } from '../context/PredictionMenuContext';
import CategoryEditModal from './CategoryEditModal';
import PredictionEditModal from './PredictionEditModal';
import CollapsibleBreakdownSection from './CollapsibleBreakdownSection';
import MonthAllocationBar from './MonthAllocationBar';
import MonthCategoryBreakdown from './MonthCategoryBreakdown';
import MonthInternalTransfersSection from './MonthInternalTransfersSection';
import TransactionListItem from './TransactionListItem';

const MonthSummaryCard = ({
  month,
  isCurrentMonth,
  defaultCurrency = 'CHF',
  essentialCategories = [],
  monthPairSlice = EMPTY_PAIR_SLICE,
  predictions = [],
  recurringPayments = [],
  averageEssentialSpending = 0,
  onSkipPrediction = () => {},
  onDeletePrediction = () => {},
  onPredictionChanged = () => {},
  availableCategories = { income: [], expense: [] },
  onTransactionCategoryUpdated = () => {},
  onCategoriesChanged = () => {},
  activeSection: controlledActiveSection,
  onActiveSectionChange
}) => {
  const { preferences, updatePreferences } = useAppContext();
  const { valueMode } = useCockpitDisplay();
  const [expenseSort, setExpenseSort] = usePreferenceState(
    `expenseSort_${month.month}`,
    'amount_desc',
    preferences,
    updatePreferences
  );

  const [categoryModal, setCategoryModal] = React.useState(null);
  const [predictionModal, setPredictionModal] = React.useState(null);
  const [expandedCategories, setExpandedCategories] = React.useState({});
  const [expandedSections, setExpandedSections] = React.useState({});
  const [expandedPairs, setExpandedPairs] = React.useState({});
  const [showInternalTransfers, setShowInternalTransfers] = React.useState(false);

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
  const hasExpenseSplit = essentialTotal > 0 || nonEssentialTotal > 0 || savingsCategoryTotal > 0;

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
  const internalTransferTransactions = getInternalTransferTransactions(month);

  const categoryIndex = useCategoryTransactionIndex({
    month,
    expenseSort,
    predictions,
    isCurrentMonth
  });
  const { getCount, getTransactions, sortConfig } = categoryIndex;
  const { sortField, sortDirection } = sortConfig;

  const allocationPredictions = useMemo(
    () => computeAllocationPredictions({
      isCurrentMonth,
      averageEssentialSpending,
      essentialTotal,
      nonEssentialTotal,
      splitExpensesTotal,
      income,
      savingsForDisplay
    }),
    [
      isCurrentMonth,
      averageEssentialSpending,
      essentialTotal,
      nonEssentialTotal,
      splitExpensesTotal,
      income,
      savingsForDisplay
    ]
  );

  const {
    predictedEssentialAverage,
    predictedEssentialDifference,
    showPredictedGap,
    barEffectiveEssential,
    expenseBarTotal,
    savingsMetricValue
  } = allocationPredictions;

  const [activeSection, setActiveSection] = React.useState(null);
  const isSectionControlled = controlledActiveSection !== undefined;
  const resolvedActiveSection = isSectionControlled ? controlledActiveSection : activeSection;

  const handleSectionClick = useCallback((section) => {
    const next = resolvedActiveSection === section ? null : section;
    if (isSectionControlled) {
      onActiveSectionChange?.(next);
    } else {
      setActiveSection(next);
    }
  }, [isSectionControlled, onActiveSectionChange, resolvedActiveSection]);

  useEffect(() => {
    setActiveSection(null);
    setExpandedCategories({});
  }, [valueMode]);

  useEffect(() => {
    if (!resolvedActiveSection) return undefined;

    const handlePointerDown = (event) => {
      if (event.target.closest('.month-allocation-segment, .month-allocation-header--clickable')) {
        return;
      }
      if (event.target.closest('.month-breakdown-panel')) {
        return;
      }
      if (isSectionControlled) {
        onActiveSectionChange?.(null);
      } else {
        setActiveSection(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [resolvedActiveSection, isSectionControlled, onActiveSectionChange]);

  const sectionAvailability = useMemo(() => ({
    essential: Object.keys(essentialExpenses).length > 0,
    nonEssential: Object.keys(nonEssentialExpenses).length > 0,
    savings: Object.keys(savingsCategories).length > 0,
    income: income > 0
  }), [essentialExpenses, nonEssentialExpenses, savingsCategories, income]);

  const handleShowInternalTransfers = useCallback(() => {
    setShowInternalTransfers(true);
    setExpandedSections((prev) => ({
      ...prev,
      [`${month.month}-internal-transfers-section`]: true
    }));
  }, [month.month]);

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
    setExpenseSort(`${field}_${nextDirection}`);
  }, [sortField, sortDirection, setExpenseSort]);

  const handleCategoryEdit = useCallback((transaction) => {
    setCategoryModal({
      transaction,
      currentCategory: transaction.category || '',
      monthKey: month.month
    });
  }, [month.month]);

  const renderTransactionItem = useCallback((txn, idx, { dismissible = false } = {}) => (
    <TransactionListItem
      key={idx}
      txn={txn}
      idx={idx}
      defaultCurrency={defaultCurrency}
      recurringMatchKeys={recurringMatchKeys}
      ibkrMatchByBankHash={monthPairSlice.ibkrMatchByBankHash}
      monthKey={month.month}
      incomeCategoryNames={incomeCategoryNames}
      expenseCategoryNames={expenseCategoryNames}
      dismissible={dismissible}
      onCategoryEdit={handleCategoryEdit}
      onSkipPrediction={onSkipPrediction}
      onCustomizePrediction={setPredictionModal}
      onDeletePrediction={onDeletePrediction}
    />
  ), [
    defaultCurrency,
    recurringMatchKeys,
    monthPairSlice.ibkrMatchByBankHash,
    month.month,
    incomeCategoryNames,
    expenseCategoryNames,
    handleCategoryEdit,
    onSkipPrediction,
    onDeletePrediction
  ]);

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

      <PredictionMenuProvider>
        <div className="month-allocation-region">
          <MonthAllocationBar
            income={income}
            essentialTotal={essentialTotal}
            nonEssentialTotal={nonEssentialTotal}
            hasExpenseSplit={hasExpenseSplit}
            splitExpensesTotal={splitExpensesTotal}
            savingsValue={savingsMetricValue}
            currency={defaultCurrency}
            isCurrentMonth={isCurrentMonth}
            predictedEssentialAverage={predictedEssentialAverage}
            predictedEssentialDifference={predictedEssentialDifference}
            showPredictedGap={showPredictedGap}
            barEffectiveEssential={barEffectiveEssential}
            expenseBarTotal={expenseBarTotal}
            activeSection={resolvedActiveSection}
            onSectionClick={handleSectionClick}
            sectionAvailability={sectionAvailability}
          />

          <MonthCategoryBreakdown
            month={month}
            defaultCurrency={defaultCurrency}
            isCurrentMonth={isCurrentMonth}
            activeSection={resolvedActiveSection}
            incomeTotal={income}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            essentialExpenses={essentialExpenses}
            essentialTotal={essentialTotal}
            nonEssentialExpenses={nonEssentialExpenses}
            nonEssentialTotal={nonEssentialTotal}
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
        </div>

        {internalTransferTotal > 0 && !showInternalTransfers && (
          <button
            type="button"
            className="month-internal-transfers-toggle"
            onClick={handleShowInternalTransfers}
          >
            Show internal transfers
          </button>
        )}

        {internalTransferTotal > 0 && showInternalTransfers && (
          <>
            <button
              type="button"
              className="month-internal-transfers-toggle"
              onClick={() => setShowInternalTransfers(false)}
            >
              Hide internal transfers
            </button>
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
                  monthPairSlice={monthPairSlice}
                  sortConfig={sortConfig}
                  expandedPairs={expandedPairs}
                  onTogglePair={togglePair}
                  renderTransactionItem={renderTransactionItem}
                />
              </div>
            </CollapsibleBreakdownSection>
          </>
        )}
      </PredictionMenuProvider>
    </>
  );
};

export default React.memo(MonthSummaryCard);
