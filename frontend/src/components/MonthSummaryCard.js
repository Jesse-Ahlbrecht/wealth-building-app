/**
 * Month Summary Card Component
 * 
 * Displays a comprehensive view of monthly transaction data.
 * Used in both MonthlyOverviewPage and ChartsPage drilldown.
 */

import React from 'react';
import { formatCurrency, formatMonth, formatDate } from '../utils';
import CategoryEditModal from './CategoryEditModal';

const SAVINGS_CATEGORY_NAMES = new Set(['Transfer', 'Internal Transfer', 'Loan Payment', 'Investment Account Payment']);

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
  showEssentialSplit = false, 
  essentialCategories = [],
  expandedCategories = {},
  setExpandedCategories = () => {},
  expandedSections = {},
  setExpandedSections = () => {},
  allMonthsData = [],
  includeLoanPayments = false,
  expenseSort = 'amount_desc',
  onExpenseSortChange = () => {},
  predictions = [],
  averageEssentialSpending = 0,
  onDismissPrediction = () => {},
  availableCategories = { income: [], expense: [] },
  onTransactionCategoryUpdated = () => {}
}) => {
  const [categoryModal, setCategoryModal] = React.useState(null);
  const income = month.income || 0;
  const baseExpenses = month.expenses || 0;
  
  // Find loan payment amount from expense categories
  let monthlyLoanPayment = 0;
  if (month.expenseCategories) {
    const loanCategory = Object.keys(month.expenseCategories).find(cat => 
      cat.toLowerCase().includes('loan payment') || cat.toLowerCase().includes('loan')
    );
    if (loanCategory) {
      monthlyLoanPayment = month.expenseCategories[loanCategory] || 0;
    }
  }
  
  // Calculate adjusted expenses (exclude loan payments if they're counted as savings)
  const expenses = includeLoanPayments ? baseExpenses - monthlyLoanPayment : baseExpenses;
  
  // Calculate adjusted savings
  const actualSavings = month.savings || 0;
  const adjustedSavings = includeLoanPayments ? actualSavings + monthlyLoanPayment : actualSavings;
  
  const savings = adjustedSavings;

  // Group expense categories into essential and non-essential
  const groupExpensesByEssential = (expenseCategories) => {
    if (!expenseCategories || Object.keys(expenseCategories).length === 0) {
      return { essential: {}, nonEssential: {}, savingsCategories: {} };
    }

    const essential = {};
    const nonEssential = {};
    const savingsCategories = {};

    Object.entries(expenseCategories).forEach(([category, amount]) => {
      // Check if this is a loan payment category (case-insensitive)
      const isLoanPayment = category.toLowerCase().includes('loan payment') || category.toLowerCase().includes('loan');

      if (SAVINGS_CATEGORY_NAMES.has(category) && !(isLoanPayment && !includeLoanPayments)) {
        savingsCategories[category] = amount;
        return;
      }
      
      // If loan payments are counted as savings, exclude them from spending entirely
      if (includeLoanPayments && isLoanPayment) {
        return; // Skip this category
      }
      
      // If loan payments are NOT counted as savings, always treat them as essential
      if (!includeLoanPayments && isLoanPayment) {
        essential[category] = amount;
        return;
      }
      
      // Check if category matches any essential category (case-insensitive)
      const isEssential = essentialCategories.some(
        essentialCat => essentialCat.toLowerCase() === category.toLowerCase()
      );
      
      if (isEssential) {
        essential[category] = amount;
      } else {
        nonEssential[category] = amount;
      }
    });

    return { essential, nonEssential, savingsCategories };
  };

  const {
    essential: essentialExpenses,
    nonEssential: nonEssentialExpenses,
    savingsCategories: legacySavingsCategories
  } =
    showEssentialSplit ? groupExpensesByEssential(month.expenseCategories) : { essential: {}, nonEssential: {}, savingsCategories: {} };
  const savingsCategories = {
    ...(month.savingsCategories || {})
  };
  Object.entries(legacySavingsCategories).forEach(([category, amount]) => {
    savingsCategories[category] = (savingsCategories[category] || 0) + amount;
  });
  
  const essentialTotal = Object.values(essentialExpenses).reduce((sum, val) => sum + val, 0);
  const nonEssentialTotal = Object.values(nonEssentialExpenses).reduce((sum, val) => sum + val, 0);
  const savingsCategoryTotal = Object.values(savingsCategories).reduce((sum, val) => sum + val, 0);
  const splitExpensesTotal = essentialTotal + nonEssentialTotal;
  const expensesForDisplay = showEssentialSplit ? splitExpensesTotal : expenses;
  const savingsForDisplay = showEssentialSplit ? income - splitExpensesTotal : savings;
  
  // Calculate predicted essential spending (use average if higher than current)
  const predictedEssentialAverage = isCurrentMonth ? (averageEssentialSpending || 0) : 0;
  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  const effectiveEssential = predictedEssentialAverage > 0 ? Math.max(essentialTotal, predictedEssentialAverage) : essentialTotal;
  const totalPredictedExpenses = effectiveEssential + nonEssentialTotal;
  // Calculate predicted savings, adding loan payments if they're counted as savings
  const basePredictedSavings = income - totalPredictedExpenses;
  const predictedSavings = includeLoanPayments ? basePredictedSavings + monthlyLoanPayment : basePredictedSavings;
  const savingsMetricValue = isCurrentMonth && predictedSavings !== savingsForDisplay ? predictedSavings : savingsForDisplay;
  const metricMaxValue = Math.max(income, expensesForDisplay, Math.abs(savingsMetricValue));

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

  const getCategoryTransactions = (category, type) => {
    const transactionsKey =
      type === 'income'
        ? 'incomeTransactions'
        : type === 'savings'
          ? 'savingsTransactions'
          : 'expenseTransactions';
    const actualTransactions = month[transactionsKey]?.[category] || [];
    
    // Add predicted transactions for this category if it's the current month
    if (isCurrentMonth && predictions && predictions.length > 0) {
      const predictedForCategory = predictions.filter(p => 
        p.category === category && 
        p.type === (type === 'income' ? 'income' : 'expense')
      );
      
      // Merge predicted transactions with actual ones, sorted by date
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

    return { label: accountName, className: `account-badge account-badge-default account-badge-${baseClass}` };
  };

  const renderTransactionDetails = (txn, isPredicted = false) => {
    const badge = getAccountBadgeConfig(txn.account);

    return (
      <div className="transaction-details">
        <div className="transaction-recipient-row">
          <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
          {badge && (
            <span className={badge.className} title={txn.account}>
              {badge.label}
            </span>
          )}
        </div>
        {txn.description && (
          <div className="transaction-description" style={isPredicted ? { color: '#6366f1', fontSize: '12px' } : {}}>
            {txn.description}
          </div>
        )}
      </div>
    );
  };

  const renderTransactionItem = (txn, idx, { dismissible = false } = {}) => {
    const isPredicted = txn.is_predicted || txn.isPredicted;
    const typeKey = txn?.type === 'income' ? 'income' : 'expense';
    const categoryOptions = Array.isArray(availableCategories?.[typeKey]) ? availableCategories[typeKey] : [];
    const canEditCategory = !isPredicted && txn?.transaction_hash && categoryOptions.length > 0;

    return (
      <div
        key={idx}
        className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
        style={isPredicted ? {
          borderColor: '#6366f1',
          backgroundColor: 'var(--color-bg-tertiary)',
          cursor: dismissible ? 'pointer' : 'default'
        } : {}}
        onClick={isPredicted && dismissible ? () => onDismissPrediction(txn) : undefined}
        title={isPredicted && dismissible ? 'Click to dismiss prediction' : ''}
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
        </div>
        <div className="transaction-amount">
          {formatCurrency(Math.abs(txn.amount), txn.currency || defaultCurrency)}
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
        availableCategories={availableCategories}
        essentialCategories={essentialCategories}
      />
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
        {showEssentialSplit && (essentialTotal > 0 || nonEssentialTotal > 0 || savingsCategoryTotal > 0) ? (
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
            value={expensesForDisplay}
            maxValue={metricMaxValue}
            currency={defaultCurrency}
            type="negative"
          />
        )}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <span className="metric-bar-label">
              {includeLoanPayments && monthlyLoanPayment > 0 ? "Savings (incl. loans)" : "Savings"}
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
            {(() => {
              const savingsGoal = defaultCurrency === 'CHF' ? 2000 : defaultCurrency === 'EUR' ? 2000 : 2200;
              return `${((savingsMetricValue / savingsGoal) * 100).toFixed(0)}% of goal`;
            })()}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {showEssentialSplit ? (
        <>
          {/* Essential Expenses */}
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
                        const transactions = getCategoryTransactions(category, 'expense');
                        
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
                                  {transactions.length > 0 && (
                                    <span className="transaction-count">({transactions.length})</span>
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
                          {isExpanded && transactions.length > 0 && (
                            <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
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
          {Object.keys(nonEssentialExpenses).length > 0 && (
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
                  {formatCurrency(nonEssentialTotal, defaultCurrency)}
                </span>
              </div>
              
              {/* Individual categories - shown when expanded */}
              {expandedSections[`${month.month}-nonessential-section`] && (() => {
                const nonEssentialEntries = Object.entries(nonEssentialExpenses);
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
                        const transactions = getCategoryTransactions(category, 'expense');
                        
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
                                  {transactions.length > 0 && (
                                    <span className="transaction-count">({transactions.length})</span>
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
                          {isExpanded && transactions.length > 0 && (
                            <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
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
                        {formatCurrency(nonEssentialTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {Object.keys(savingsCategories).length > 0 && (
            <div className="categories-section">
              <div
                className="category-item category-section-header"
                onClick={() => {
                  const sectionKey = `${month.month}-savings-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginBottom: expandedSections[`${month.month}-savings-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-savings-section`] ? '▼' : '▶'}
                    </span>
                    Savings Movements
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(savingsCategoryTotal, defaultCurrency)}
                </span>
              </div>

              {expandedSections[`${month.month}-savings-section`] && (() => {
                const savingsEntries = Object.entries(savingsCategories);
                const maxSavingsAmount = savingsEntries.length > 0
                  ? Math.max(...savingsEntries.map(([, amount]) => amount))
                  : 0;

                return (
                  <div className="category-list">
                    {savingsEntries
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, amount]) => {
                        const categoryKey = `${month.month}-savings-${category}`;
                        const isExpanded = expandedCategories[categoryKey];
                        const transactions = getCategoryTransactions(category, 'savings');

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
                                  {transactions.length > 0 && (
                                    <span className="transaction-count">({transactions.length})</span>
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
                            {isExpanded && transactions.length > 0 && (
                              <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                                {renderExpenseSortControls()}
                                <div className="transaction-list">
                                  {transactions.map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                      <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                        <span className="category-name">Total Savings Movements</span>
                        <span className="stat-value" style={{ fontWeight: '700' }}>
                          {formatCurrency(savingsCategoryTotal, defaultCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      ) : (
        /* All Categories View */
        (() => {
          const expenseCategories = month.expenseCategories || {};
          const categoryEntries = Object.entries(expenseCategories);
          const savingsEntries = Object.entries(savingsCategories);
          if (categoryEntries.length === 0 && savingsEntries.length === 0) return null;
          
          const maxExpenseAmount = categoryEntries.length > 0
            ? Math.max(...categoryEntries.map(([, amount]) => amount))
            : 0;
          const expenseTotal = Object.values(expenseCategories).reduce((sum, val) => sum + val, 0);
          const maxSavingsAmount = savingsEntries.length > 0
            ? Math.max(...savingsEntries.map(([, amount]) => amount))
            : 0;
          const savingsTotal = Object.values(savingsCategories).reduce((sum, val) => sum + val, 0);
          
          return (
            <>
            {savingsEntries.length > 0 && (
            <div className="categories-section">
              <div
                className="category-item category-section-header"
                onClick={() => {
                  const sectionKey = `${month.month}-savings-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginBottom: expandedSections[`${month.month}-savings-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-savings-section`] ? '▼' : '▶'}
                    </span>
                    Savings Movements
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(savingsTotal, defaultCurrency)}
                </span>
              </div>

              {expandedSections[`${month.month}-savings-section`] && (
                <div className="category-list">
                  {savingsEntries
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => {
                      const categoryKey = `${month.month}-savings-${category}`;
                      const isExpanded = expandedCategories[categoryKey];
                      const transactions = getCategoryTransactions(category, 'savings');

                      return (
                        <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                          <div
                            className="category-item category-subitem"
                            onClick={() => toggleCategory(categoryKey)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ flex: 1 }}>
                              <div className="category-name">
                                <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                                {category}
                                <span className="transaction-count">
                                  ({transactions.length})
                                </span>
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
                          {isExpanded && transactions.length > 0 && (
                            <div className="transaction-list-wrapper">
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Savings Movements</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(savingsTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            {categoryEntries.length > 0 && (
            <div className="categories-section">
              <div 
                className="category-item category-section-header" 
                onClick={() => {
                  const sectionKey = `${month.month}-expense-section`;
                  setExpandedSections(prev => ({
                    ...prev,
                    [sectionKey]: !prev[sectionKey]
                  }));
                }}
                style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600', 
                  marginBottom: expandedSections[`${month.month}-expense-section`] ? '8px' : '0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {expandedSections[`${month.month}-expense-section`] ? '▼' : '▶'}
                    </span>
                    Expenses
                  </span>
                </div>
                <span className="stat-value" style={{ fontWeight: '700' }}>
                  {formatCurrency(expenseTotal, defaultCurrency)}
                </span>
              </div>
              
              {/* Individual categories - shown when expanded */}
              {expandedSections[`${month.month}-expense-section`] && (
                <div className="category-list">
                  {categoryEntries
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => {
                      const categoryKey = `${month.month}-expense-${category}`;
                      const isExpanded = expandedCategories[categoryKey];
                      const transactions = getCategoryTransactions(category, 'expense');
                      
                      return (
                        <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
                          <div 
                            className="category-item category-subitem" 
                            onClick={() => toggleCategory(categoryKey)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ flex: 1 }}>
                              <div className="category-name">
                                <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                                {category}
                                <span className="transaction-count">
                                  ({transactions.length})
                                </span>
                              </div>
                              <div className="category-bar">
                                <div
                                  className="category-bar-fill"
                                  style={{ width: `${maxExpenseAmount > 0 ? (amount / maxExpenseAmount) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="category-amount">
                              {formatCurrency(amount, defaultCurrency)}
                            </div>
                          </div>
                          {isExpanded && transactions.length > 0 && (
                            <div className="transaction-list-wrapper">
                              {renderExpenseSortControls()}
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => renderTransactionItem(txn, idx, { dismissible: true }))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Expenses</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(expenseTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
            </>
          );
        })()
      )}

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
                      const transactions = getCategoryTransactions(category, 'income');
                      
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
                                {transactions.length > 0 && (
                                  <span className="transaction-count">({transactions.length})</span>
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
                        {isExpanded && transactions.length > 0 && (
                          <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                            <div className="transaction-list">
                              {transactions.map((txn, idx) => renderTransactionItem(txn, idx))}
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

export default MonthSummaryCard;
