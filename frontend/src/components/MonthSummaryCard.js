/**
 * Month Summary Card Component
 * 
 * Displays a comprehensive view of monthly transaction data.
 * Used in both MonthlyOverviewPage and ChartsPage drilldown.
 */

import React, { useMemo } from 'react';
import { formatCurrency, formatMonth, formatDate } from '../utils';
import { getCategoryNames } from '../utils/categoryHelpers';
import {
  computeMonthExpenseBreakdown,
  getSavingsCategoryTransactions,
  mergeSavingsCategories,
  sumCategoryAmounts
} from '../utils/categoryHelpers';
import { buildRecurringMatchKeys, isRecurringTransaction } from '../utils/predictionHelpers';
import {
  filterTransferPairsForMonth,
  getUnpairedInternalTransfersForMonth
} from '../utils/transferPairHelpers';
import {
  filterIbkrDepositPairsForMonth,
  getUnpairedIbkrBankTransfersForMonth,
  isIbkrBankTransfer
} from '../utils/ibkrDepositPairHelpers';
import { getSavingsGoalForCurrency } from '../utils/finance';
import CategoryEditModal from './CategoryEditModal';
import PredictionEditModal from './PredictionEditModal';
import CollapsibleBreakdownSection from './CollapsibleBreakdownSection';
import TransferPairGroup from './TransferPairGroup';

/**
 * Metric Bar Component
 * Displays a single metric with a visual bar chart
 */
export const MetricBar = ({ label, value, maxValue, currency, type = 'positive' }) => {
  const percentage = maxValue > 0 ? (Math.abs(value) / maxValue) * 100 : 0;
  
  return (
    <div className="metric-bar-item">
      <div className="metric-bar-header">
        <span className="metric-bar-label">{label}</span>
        <div className={`metric-bar-value ${type}`}>
          {formatCurrency(value, currency)}
        </div>
      </div>
      <div className="metric-bar-container">
        <div
          className={`metric-bar-fill ${type}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Month Summary Card Component
 * Displays a comprehensive view of monthly transaction data
 */
const MonthSummaryCard = ({ 
  month, 
  isCurrentMonth, 
  defaultCurrency = 'CHF', 
  essentialCategories = [],
  expenseSort = 'amount_desc',
  onExpenseSortChange = () => {},
  predictions = [],
  recurringPayments = [],
  transferPairData = { pairs: [], unmatched: [] },
  ibkrDepositPairData = { pairs: [], unmatchedBank: [], unmatchedDeposits: [] },
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
  const internalTransferTransactions = month?.internalTransferTransactions || [];
  const transferPairsInMonth = useMemo(
    () => filterTransferPairsForMonth(transferPairData?.pairs, month?.month),
    [transferPairData?.pairs, month?.month]
  );
  const unpairedInternalTransfers = useMemo(
    () => getUnpairedInternalTransfersForMonth(internalTransferTransactions, transferPairsInMonth),
    [internalTransferTransactions, transferPairsInMonth]
  );
  const ibkrDepositPairsInMonth = useMemo(
    () => filterIbkrDepositPairsForMonth(ibkrDepositPairData?.pairs, month?.month),
    [ibkrDepositPairData?.pairs, month?.month]
  );
  const ibkrMatchByBankHash = useMemo(() => {
    const map = new Map();
    ibkrDepositPairsInMonth.forEach((pair) => {
      if (pair?.bank?.transaction_hash) {
        map.set(pair.bank.transaction_hash, pair);
      }
    });
    return map;
  }, [ibkrDepositPairsInMonth]);
  const unpairedIbkrBankTransfers = useMemo(
    () => getUnpairedIbkrBankTransfersForMonth(internalTransferTransactions, ibkrDepositPairsInMonth),
    [internalTransferTransactions, ibkrDepositPairsInMonth]
  );
  
  // Calculate predicted essential spending (use average if higher than current)
  const predictedEssentialAverage = isCurrentMonth ? (averageEssentialSpending || 0) : 0;
  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  const effectiveEssential = predictedEssentialAverage > 0 ? Math.max(essentialTotal, predictedEssentialAverage) : essentialTotal;
  const totalPredictedExpenses = effectiveEssential + nonEssentialTotal;
  const predictedSavings = income - totalPredictedExpenses;
  const savingsMetricValue = isCurrentMonth && predictedSavings !== savingsForDisplay ? predictedSavings : savingsForDisplay;
  const metricMaxValue = Math.max(income, splitExpensesTotal, Math.abs(savingsMetricValue));

  // Helper to toggle category expansion
  const toggleCategory = (categoryKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  // Helper to get transactions for a category
  const [sortFieldRaw, sortDirectionRaw] = expenseSort.split('_');
  const sortField = ['amount', 'date', 'recipient'].includes(sortFieldRaw) ? sortFieldRaw : 'amount';
  const sortDirection = sortDirectionRaw === 'asc' ? 'asc' : 'desc';

  const getSortDirection = (field) => {
    if (sortField !== field) return 'desc';
    return sortDirection === 'asc' ? 'asc' : 'desc';
  };

  const getSortArrow = (field) => {
    if (sortField !== field) return '▲▼';
    return getSortDirection(field) === 'asc' ? '▲' : '▼';
  };

  const handleSortToggle = (field) => {
    const currentDirection = getSortDirection(field);
    const nextDirection = sortField === field && currentDirection === 'desc' ? 'asc' : 'desc';
    onExpenseSortChange(`${field}_${nextDirection}`);
  };

  const sortTransactions = (transactions, type) => {
    const sorted = [...transactions];
    const getAmount = (txn) => Math.abs(txn.amount || 0);
    const getDate = (txn) => {
      const value = txn?.date ? new Date(txn.date).getTime() : 0;
      return Number.isNaN(value) ? 0 : value;
    };
    const getRecipient = (txn) => (txn?.recipient || '').toString().toLowerCase();

    if (type === 'expense') {
      const directionMultiplier = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'amount') {
        return sorted.sort((a, b) => {
          const amountDelta = (getAmount(a) - getAmount(b)) * directionMultiplier;
          return amountDelta !== 0 ? amountDelta : getDate(b) - getDate(a);
        });
      }
      if (sortField === 'recipient') {
        return sorted.sort((a, b) => {
          const recipientDelta = getRecipient(a).localeCompare(getRecipient(b)) * directionMultiplier;
          return recipientDelta !== 0 ? recipientDelta : getDate(b) - getDate(a);
        });
      }
      return sorted.sort((a, b) => {
        const dateDelta = (getDate(a) - getDate(b)) * directionMultiplier;
        return dateDelta !== 0 ? dateDelta : getAmount(b) - getAmount(a);
      });
    }

    return sorted.sort((a, b) => getDate(b) - getDate(a));
  };

  const getCategoryTransactionCount = (category, type) => {
    const actualCount = type === 'savings'
      ? getSavingsCategoryTransactions(month, category).length
      : (month[type === 'income' ? 'incomeTransactions' : 'expenseTransactions']?.[category] || []).length;

    if (!isCurrentMonth || !predictions?.length) {
      return actualCount;
    }

    const predictedCount = predictions.filter((prediction) =>
      prediction.category === category &&
      prediction.type === (type === 'income' ? 'income' : 'expense')
    ).length;

    return actualCount + predictedCount;
  };

  const getCategoryTransactions = (category, type) => {
    const actualTransactions = type === 'savings'
      ? getSavingsCategoryTransactions(month, category)
      : (month[type === 'income' ? 'incomeTransactions' : 'expenseTransactions']?.[category] || []);
    
    // Add predicted transactions for this category if it's the current month
    if (isCurrentMonth && predictions && predictions.length > 0) {
      const predictedForCategory = predictions.filter(p =>
        p.category === category &&
        p.type === (type === 'income' ? 'income' : 'expense')
      );

      const allTransactions = [...actualTransactions, ...predictedForCategory];
      return sortTransactions(allTransactions, type);
    }
    
    return sortTransactions(actualTransactions, type);
  };

  const getAccountBadgeConfig = (accountNameRaw) => {
    const accountName = (accountNameRaw || '').trim();
    if (!accountName) return null;

    const normalized = accountName.toLowerCase();
    const baseClass = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    if (normalized.includes('dkb')) {
      if (normalized.includes('giro')) {
        return { label: 'DKB Giro', className: 'account-badge account-badge-dkb account-badge-dkb-girokonto' };
      }
      if (normalized.includes('tagesgeld')) {
        return { label: 'DKB Tagesgeld', className: 'account-badge account-badge-dkb account-badge-dkb-tagesgeld' };
      }
      return { label: accountName, className: 'account-badge account-badge-dkb' };
    }

    if (normalized.includes('yuh')) {
      return { label: accountName, className: 'account-badge account-badge-yuh' };
    }

    if (normalized.includes('swisscard')) {
      return { label: accountName, className: 'account-badge account-badge-swisscard' };
    }

    if (normalized.includes('kfw')) {
      return { label: accountName, className: 'account-badge account-badge-kfw' };
    }

    if (normalized.includes('interactive brokers') || normalized.includes('ibkr')) {
      return { label: 'Interactive Brokers', className: 'account-badge account-badge-interactive-brokers' };
    }

    return { label: accountName, className: `account-badge account-badge-default account-badge-${baseClass}` };
  };

  const renderTransactionDetails = (txn, isPredicted = false) => {
    const badge = getAccountBadgeConfig(txn.account);
    const isRecurring = isRecurringTransaction(txn, recurringMatchKeys);
    const refunded = txn.refundedAmount || 0;
    const ibkrMatch = txn?.transaction_hash ? ibkrMatchByBankHash.get(txn.transaction_hash) : null;

    return (
      <div className="transaction-details">
        <div className="transaction-recipient-row">
          <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
          {isRecurring && (
            <span className="account-badge account-badge-recurring" title="Recognized recurring payment">
              Recurring
            </span>
          )}
          {refunded > 0 && (
            <span className="account-badge account-badge-refund" title="Matched to a purchase or refund">
              Refund
            </span>
          )}
          {ibkrMatch && (
            <span className="account-badge account-badge-ibkr-match" title="Matched to Interactive Brokers deposit">
              IBKR
            </span>
          )}
          {badge && (
            <span className={badge.className} title={txn.account}>
              {badge.label}
            </span>
          )}
        </div>
        {txn.description && (
          <div className="transaction-description" style={isPredicted ? { color: 'var(--color-accent-secondary)', fontSize: '12px' } : {}}>
            {txn.description}
          </div>
        )}
        {ibkrMatch && (
          <div className="transaction-description" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Matched IBKR deposit on {formatDate(ibkrMatch.deposit.date)}
          </div>
        )}
      </div>
    );
  };

  const togglePair = (pairKey) => {
    setExpandedPairs((prev) => ({
      ...prev,
      [pairKey]: !prev[pairKey]
    }));
  };

  const renderIbkrDepositLeg = (deposit) => (
    <div className="transaction-item">
      <div className="transaction-date">
        {formatDate(deposit.date)}
        <span className="account-badge account-badge-interactive-brokers" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
          IBKR
        </span>
      </div>
      <div className="transaction-details">
        <div className="transaction-recipient">{deposit.security || 'Deposit'}</div>
        <div className="transaction-description" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Interactive Brokers Cash
        </div>
      </div>
      <div className="transaction-amount">
        {formatCurrency(Math.abs(deposit.amount), deposit.currency || defaultCurrency)}
      </div>
    </div>
  );

  const renderIbkrDepositPair = (pair) => {
    const pairKey = `${month.month}-ibkr-pair-${pair.id}`;
    const bankTxn = {
      ...pair.bank,
      amount: -Math.abs(pair.bank.amount),
      type: pair.bank.type || 'expense'
    };

    return (
      <TransferPairGroup
        key={pair.id}
        pairKey={pairKey}
        isExpanded={expandedPairs[pairKey]}
        onToggle={togglePair}
        label={`${pair.bank.account} → Interactive Brokers`}
        dayDiff={pair.dayDiff}
        amount={pair.amount}
        currency={pair.currency}
        defaultCurrency={defaultCurrency}
      >
        {renderTransactionItem(bankTxn, `ibkr-bank-${pair.id}`)}
        {renderIbkrDepositLeg(pair.deposit)}
      </TransferPairGroup>
    );
  };

  const renderInternalTransferPair = (pair) => {
    const pairKey = `${month.month}-pair-${pair.id}`;

    return (
      <TransferPairGroup
        key={pair.id}
        pairKey={pairKey}
        isExpanded={expandedPairs[pairKey]}
        onToggle={togglePair}
        label={`${pair.outflow.account} → ${pair.inflow.account}`}
        dayDiff={pair.dayDiff}
        amount={pair.amount}
        currency={pair.currency}
        defaultCurrency={defaultCurrency}
      >
        {renderTransactionItem(pair.outflow, `out-${pair.id}`)}
        {renderTransactionItem(pair.inflow, `in-${pair.id}`)}
      </TransferPairGroup>
    );
  };

  const renderInternalTransfersContent = () => {
    const hasTransferPairs = transferPairsInMonth.length > 0;
    const nonIbkrUnpaired = unpairedInternalTransfers.filter((txn) => !isIbkrBankTransfer(txn));
    const showIbkrUnmatched = unpairedIbkrBankTransfers.length > 0;

    return (
      <>
        {ibkrDepositPairsInMonth.length > 0 && (
          <div className="transfer-pair-list" style={{ marginBottom: '12px' }}>
            <div className="transfer-pair-unmatched-title">IBKR deposits</div>
            {ibkrDepositPairsInMonth.map(renderIbkrDepositPair)}
          </div>
        )}
        {hasTransferPairs ? (
          <div className="transfer-pair-list">
            {transferPairsInMonth.map(renderInternalTransferPair)}
          </div>
        ) : (
          <div className="transaction-list">
            {sortTransactions(
              internalTransferTransactions.filter((txn) => !ibkrMatchByBankHash.has(txn?.transaction_hash)),
              'expense'
            ).map((txn, idx) => renderTransactionItem(txn, idx))}
          </div>
        )}
        {hasTransferPairs && nonIbkrUnpaired.length > 0 && (
          <div className="transfer-pair-unmatched">
            <div className="transfer-pair-unmatched-title">Unmatched</div>
            <div className="transaction-list">
              {sortTransactions(nonIbkrUnpaired, 'expense').map((txn, idx) =>
                renderTransactionItem(txn, `unpaired-${idx}`)
              )}
            </div>
          </div>
        )}
        {showIbkrUnmatched && (
          <div className="transfer-pair-unmatched">
            <div className="transfer-pair-unmatched-title">Unmatched IBKR transfers</div>
            <div className="transaction-list">
              {sortTransactions(unpairedIbkrBankTransfers, 'expense').map((txn, idx) =>
                renderTransactionItem(txn, `ibkr-unpaired-${idx}`)
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderTransactionItem = (txn, idx, { dismissible = false } = {}) => {
    const isPredicted = txn.is_predicted || txn.isPredicted;
    const typeKey = txn?.type === 'income' ? 'income' : 'expense';
    const categoryOptions = typeKey === 'income' ? incomeCategoryNames : expenseCategoryNames;
    const canEditCategory = !isPredicted && txn?.transaction_hash && categoryOptions.length > 0;
    const menuKey = `${month.month}-${txn.prediction_key || idx}`;
    const menuOpen = predictionMenu === menuKey;

    return (
      <div
        key={idx}
        className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
        style={isPredicted ? {
          borderColor: 'var(--color-accent-secondary)',
          backgroundColor: 'var(--color-bg-tertiary)'
        } : {}}
      >
        <div className="transaction-date">
          {formatDate(txn.date)}
          {isPredicted && (
            <span className="account-badge account-badge-predicted" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
              Predicted
            </span>
          )}
        </div>
        {renderTransactionDetails(txn, isPredicted)}
        <div className="transaction-actions">
          {canEditCategory && (
            <button
              type="button"
              className="transaction-category-pill"
              onClick={(event) => {
                event.stopPropagation();
                setCategoryModal({
                  transaction: txn,
                  currentCategory: txn.category || '',
                  monthKey: month.month
                });
              }}
              title="Change transaction category"
            >
              {txn.category || 'Set category'}
            </button>
          )}
          {isPredicted && dismissible && (
            <div className="prediction-menu">
              <button
                type="button"
                className="prediction-menu-btn"
                onClick={() => setPredictionMenu(menuOpen ? null : menuKey)}
                title="Manage prediction"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="prediction-menu-dropdown">
                  <button type="button" onClick={() => { setPredictionMenu(null); onSkipPrediction(txn); }}>Skip this month</button>
                  <button type="button" onClick={() => { setPredictionMenu(null); setPredictionModal(txn); }}>Customize</button>
                  <button type="button" className="danger" onClick={() => { setPredictionMenu(null); onDeletePrediction(txn); }}>Delete permanently</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="transaction-amount">
          {(() => {
            const gross = Math.abs(txn.amount);
            const refunded = txn.refundedAmount || 0;
            const net = gross - refunded;
            const currency = txn.currency || defaultCurrency;
            if (refunded > 0.01) {
              return (
                <div className="transaction-amount-refund">
                  <span className="transaction-amount-gross">{formatCurrency(gross, currency)}</span>
                  <span className="transaction-amount-net">{formatCurrency(net, currency)}</span>
                </div>
              );
            }
            return formatCurrency(gross, currency);
          })()}
        </div>
      </div>
    );
  };

  const renderExpenseSortControls = () => {
    return (
      <div className="transaction-sort-row" role="group" aria-label="Sort expense transactions">
        <button
          className={`transaction-sort-btn ${sortField === 'date' ? 'active' : ''}`}
          onClick={() => handleSortToggle('date')}
        >
          Date
          <span className="transaction-sort-arrow">{getSortArrow('date')}</span>
        </button>
        <button
          className={`transaction-sort-btn ${sortField === 'recipient' ? 'active' : ''}`}
          onClick={() => handleSortToggle('recipient')}
        >
          Recipient
          <span className="transaction-sort-arrow">{getSortArrow('recipient')}</span>
        </button>
        <button
          className={`transaction-sort-btn transaction-sort-btn-amount ${sortField === 'amount' ? 'active' : ''}`}
          onClick={() => handleSortToggle('amount')}
        >
          Amount
          <span className="transaction-sort-arrow">{getSortArrow('amount')}</span>
        </button>
      </div>
    );
  };

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
      {/* Header */}
      <div className="current-month-header">
        <div>
          <h3>{formatMonth(month.month)}</h3>
          {isCurrentMonth && <p>Current Month</p>}
        </div>
      </div>

      {/* Comparison Bar Chart */}
      <div className="metrics-bar-charts">
        <MetricBar
          label="Income"
          value={income}
          maxValue={metricMaxValue}
          currency={defaultCurrency}
          type="positive"
        />
        {(essentialTotal > 0 || nonEssentialTotal > 0 || savingsCategoryTotal > 0) ? (
          <>
            <div className="metric-bar-item">
              <div className="metric-bar-header">
                <span className="metric-bar-label">Essential Expenses</span>
                <div className="metric-bar-value negative">
                  {formatCurrency(essentialTotal, defaultCurrency)}
                  {isCurrentMonth && predictedEssentialAverage > 0 && (
                    <span className="metric-bar-meta" style={{ marginLeft: '8px', fontSize: '14px', opacity: 0.7 }}>
                      (avg: {formatCurrency(predictedEssentialAverage, defaultCurrency)})
                    </span>
                  )}
                </div>
              </div>
              <div className="metric-bar-container">
                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                  <div
                    className="metric-bar-fill negative"
                    style={{ 
                      width: `${metricMaxValue > 0 ? (essentialTotal / metricMaxValue) * 100 : 0}%`,
                      borderRadius: (isCurrentMonth && predictedEssentialDifference > 0) ? '8px 0 0 8px' : '8px'
                    }}
                  />
                  {isCurrentMonth && predictedEssentialDifference > 0 && (
                    <div
                      style={{ 
                        width: `${metricMaxValue > 0 ? (predictedEssentialDifference / metricMaxValue) * 100 : 0}%`,
                        background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.25), rgba(220, 38, 38, 0.15))',
                        borderRadius: '0 8px 8px 0',
                        minWidth: predictedEssentialDifference > 0 ? '2px' : '0'
                      }}
                      title={`Predicted essential gap: ${formatCurrency(predictedEssentialDifference, defaultCurrency)}`}
                    />
                  )}
                </div>
              </div>
            </div>
            <MetricBar
              label="Non-Essential Expenses"
              value={nonEssentialTotal}
              maxValue={metricMaxValue}
              currency={defaultCurrency}
              type="negative"
            />
          </>
        ) : (
          <MetricBar
            label="Expenses"
            value={splitExpensesTotal}
            maxValue={metricMaxValue}
            currency={defaultCurrency}
            type="negative"
          />
        )}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <span className="metric-bar-label">
              Savings
            </span>
            <div className={`metric-bar-value ${savingsMetricValue >= 0 ? 'positive' : 'negative'}`}>
              {savingsMetricValue >= 0 ? '+' : ''}{formatCurrency(savingsMetricValue, defaultCurrency)}
            </div>
          </div>
          <div className="metric-bar-container">
            <div
              className={`metric-bar-fill ${savingsMetricValue >= 0 ? 'positive' : 'negative'}`}
              style={{ width: `${metricMaxValue > 0 ? (Math.abs(savingsMetricValue) / metricMaxValue) * 100 : 0}%` }}
            />
          </div>
          <div className="metric-bar-footer" style={{ fontSize: '12px', marginTop: '8px' }}>
            {`${((savingsMetricValue / getSavingsGoalForCurrency(defaultCurrency)) * 100).toFixed(0)}% of goal`}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
          {otherExpenseAmount > 0 && (
            <div className="categories-section needs-review-section">
              <div
                className="category-item category-section-header"
                onClick={() => {
                  const sectionKey = `${month.month}-needs-review-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginBottom: expandedSections[`${month.month}-needs-review-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-needs-review-section`] ? '▼' : '▶'}
                    </span>
                    Needs Review
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(otherExpenseAmount, defaultCurrency)}
                </span>
              </div>
              {expandedSections[`${month.month}-needs-review-section`] && (
                <div className="category-list">
                  <div style={{ marginLeft: '24px', marginTop: '4px' }}>
                    <div
                      className="category-item category-subitem"
                      onClick={() => toggleCategory(`${month.month}-needs-review-other`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="category-name">
                          <span className="expand-arrow" style={{ marginRight: '8px' }}>
                            {expandedCategories[`${month.month}-needs-review-other`] ? '▼' : '▶'}
                          </span>
                          Other
                          <span className="transaction-count">
                            ({getCategoryTransactionCount('Other', 'expense')})
                          </span>
                        </div>
                      </div>
                      <div className="category-amount">
                        {formatCurrency(otherExpenseAmount, defaultCurrency)}
                      </div>
                    </div>
                    {expandedCategories[`${month.month}-needs-review-other`] && (
                      <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                        {renderExpenseSortControls()}
                        <div className="transaction-list">
                          {getCategoryTransactions('Other', 'expense').map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {Object.keys(essentialExpenses).length > 0 && (
            <div className="categories-section">
              <div 
                className="category-item category-section-header" 
                onClick={() => {
                  const sectionKey = `${month.month}-essential-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600', 
                  marginBottom: expandedSections[`${month.month}-essential-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-essential-section`] ? '▼' : '▶'}
                    </span>
                    Essential Expenses
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(essentialTotal, defaultCurrency)}
                </span>
              </div>
              
              {/* Individual categories - shown when expanded */}
              {expandedSections[`${month.month}-essential-section`] && (() => {
                const essentialEntries = Object.entries(essentialExpenses);
                const maxEssentialAmount = essentialEntries.length > 0 
                  ? Math.max(...essentialEntries.map(([, amount]) => amount))
                  : 0;
                
                return (
                  <div className="category-list">
                    {essentialEntries
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, amount]) => {
                        const categoryKey = `${month.month}-essential-${category}`;
                        const isExpanded = expandedCategories[categoryKey];
                        const transactionCount = getCategoryTransactionCount(category, 'expense');
                        
                        return (
                          <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                            <div 
                              className="category-item category-subitem" 
                              onClick={() => toggleCategory(categoryKey)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div style={{ flex: 1 }}>
                                <div className="category-name">
                                  <span className="expand-arrow" style={{ marginRight: '8px' }}>
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                  {category}
                                  {transactionCount > 0 && (
                                    <span className="transaction-count">({transactionCount})</span>
                                  )}
                                </div>
                                <div className="category-bar">
                                  <div
                                    className="category-bar-fill"
                                    style={{ width: `${maxEssentialAmount > 0 ? (amount / maxEssentialAmount) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                              <div className="category-amount">
                                {formatCurrency(amount, defaultCurrency)}
                              </div>
                            </div>
                          {isExpanded && transactionCount > 0 && (
                            <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {getCategoryTransactions(category, 'expense').map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">
                        Total Essential
                        {isCurrentMonth && predictedEssentialAverage > 0 && (
                          <span style={{ fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>
                            (avg: {formatCurrency(predictedEssentialAverage, defaultCurrency)})
                          </span>
                        )}
                      </span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(essentialTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {/* Non-Essential Expenses */}
          {Object.keys(nonEssentialWithoutOther).length > 0 && (
            <div className="categories-section">
              <div 
                className="category-item category-section-header" 
                onClick={() => {
                  const sectionKey = `${month.month}-nonessential-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600', 
                  marginBottom: expandedSections[`${month.month}-nonessential-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-nonessential-section`] ? '▼' : '▶'}
                    </span>
                    Non-Essential Expenses
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(nonEssentialWithoutOtherTotal, defaultCurrency)}
                </span>
              </div>
              
              {/* Individual categories - shown when expanded */}
              {expandedSections[`${month.month}-nonessential-section`] && (() => {
                const nonEssentialEntries = Object.entries(nonEssentialWithoutOther);
                const maxNonEssentialAmount = nonEssentialEntries.length > 0 
                  ? Math.max(...nonEssentialEntries.map(([, amount]) => amount))
                  : 0;
                
                return (
                  <div className="category-list">
                    {nonEssentialEntries
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, amount]) => {
                        const categoryKey = `${month.month}-nonessential-${category}`;
                        const isExpanded = expandedCategories[categoryKey];
                        const transactionCount = getCategoryTransactionCount(category, 'expense');
                        
                        return (
                          <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                            <div 
                              className="category-item category-subitem" 
                              onClick={() => toggleCategory(categoryKey)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div style={{ flex: 1 }}>
                                <div className="category-name">
                                  <span className="expand-arrow" style={{ marginRight: '8px' }}>
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                  {category}
                                  {transactionCount > 0 && (
                                    <span className="transaction-count">({transactionCount})</span>
                                  )}
                                </div>
                                <div className="category-bar">
                                  <div
                                    className="category-bar-fill"
                                    style={{ width: `${maxNonEssentialAmount > 0 ? (amount / maxNonEssentialAmount) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                              <div className="category-amount">
                                {formatCurrency(amount, defaultCurrency)}
                              </div>
                            </div>
                          {isExpanded && transactionCount > 0 && (
                            <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {getCategoryTransactions(category, 'expense').map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Non-Essential</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(nonEssentialWithoutOtherTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          )}

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
                {renderInternalTransfersContent()}
              </div>
            </CollapsibleBreakdownSection>
          )}

          {Object.keys(savingsCategories).length > 0 && (() => {
            const savingsEntries = Object.entries(savingsCategories);
            const maxSavingsAmount = savingsEntries.length > 0
              ? Math.max(...savingsEntries.map(([, amount]) => amount))
              : 0;

            return (
              <CollapsibleBreakdownSection
                monthKey={month.month}
                sectionId="savings-section"
                title="Savings Movements"
                total={savingsCategoryTotal}
                defaultCurrency={defaultCurrency}
                expandedSections={expandedSections}
                setExpandedSections={setExpandedSections}
                footer={expandedSections[`${month.month}-savings-section`] && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)', marginLeft: '24px' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Savings Movements</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(savingsCategoryTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                )}
              >
                <div className="category-list">
                  {savingsEntries
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => {
                      const categoryKey = `${month.month}-savings-${category}`;
                      const isExpanded = expandedCategories[categoryKey];
                      const transactionCount = getCategoryTransactionCount(category, 'savings');

                      return (
                        <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                          <div
                            className="category-item category-subitem"
                            onClick={() => toggleCategory(categoryKey)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ flex: 1 }}>
                              <div className="category-name">
                                <span className="expand-arrow" style={{ marginRight: '8px' }}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                {category}
                                {transactionCount > 0 && (
                                  <span className="transaction-count">({transactionCount})</span>
                                )}
                              </div>
                              <div className="category-bar">
                                <div
                                  className="category-bar-fill category-bar-income"
                                  style={{ width: `${maxSavingsAmount > 0 ? (amount / maxSavingsAmount) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="category-amount">
                              {formatCurrency(amount, defaultCurrency)}
                            </div>
                          </div>
                          {isExpanded && transactionCount > 0 && (
                            <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {getCategoryTransactions(category, 'savings').map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CollapsibleBreakdownSection>
            );
          })()}

      {/* Income Categories */}
      {(month.incomeCategories && Object.keys(month.incomeCategories).length > 0) && (() => {
        const incomeTotal = Object.values(month.incomeCategories).reduce((sum, val) => sum + val, 0);
        return (
          <div className="categories-section">
            <div 
              className="category-item category-section-header" 
              onClick={() => {
                const sectionKey = `${month.month}-income-section`;
                setExpandedSections(prev => ({
                  ...prev,
                  [sectionKey]: !prev[sectionKey]
                }));
              }}
              style={{ 
                cursor: 'pointer', 
                fontWeight: '600', 
                marginBottom: expandedSections[`${month.month}-income-section`] ? '8px' : '0'
              }}
            >
              <div style={{ flex: 1 }}>
                <span className="category-name">
                  <span className="expand-arrow" style={{ marginRight: '8px' }}>
                    {expandedSections[`${month.month}-income-section`] ? '▼' : '▶'}
                  </span>
                  Income
                </span>
              </div>
              <span className="stat-value" style={{ fontWeight: '700' }}>
                {formatCurrency(incomeTotal, defaultCurrency)}
              </span>
            </div>
            
            {/* Individual categories - shown when expanded */}
            {expandedSections[`${month.month}-income-section`] && (() => {
              const incomeEntries = Object.entries(month.incomeCategories);
              const maxIncomeAmount = incomeEntries.length > 0 
                ? Math.max(...incomeEntries.map(([, amount]) => amount))
                : 0;
              
              return (
                <div className="category-list">
                  {incomeEntries
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => {
                      const categoryKey = `${month.month}-income-${category}`;
                      const isExpanded = expandedCategories[categoryKey];
                      const transactionCount = getCategoryTransactionCount(category, 'income');
                      
                      return (
                        <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                          <div 
                            className="category-item category-subitem" 
                            onClick={() => toggleCategory(categoryKey)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ flex: 1 }}>
                              <div className="category-name">
                                <span className="expand-arrow" style={{ marginRight: '8px' }}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                {category}
                                {transactionCount > 0 && (
                                  <span className="transaction-count">({transactionCount})</span>
                                )}
                              </div>
                              <div className="category-bar">
                                <div
                                  className="category-bar-fill category-bar-income"
                                  style={{ width: `${maxIncomeAmount > 0 ? (amount / maxIncomeAmount) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="category-amount">
                              {formatCurrency(amount, defaultCurrency)}
                            </div>
                          </div>
                        {isExpanded && transactionCount > 0 && (
                          <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                            <div className="transaction-list">
                              {getCategoryTransactions(category, 'income').map((txn, idx) => renderTransactionItem(txn, idx))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Income</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(incomeTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          );
        })()}
    </>
  );
};

export default React.memo(MonthSummaryCard);
