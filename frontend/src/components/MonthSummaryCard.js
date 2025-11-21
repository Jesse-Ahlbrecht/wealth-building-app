/**
 * Month Summary Card Component
 * 
 * Displays a comprehensive view of monthly transaction data.
 * Used in both MonthlyOverviewPage and ChartsPage drilldown.
 */

import React from 'react';
import { formatCurrency, formatMonth, formatDate } from '../utils';

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
  predictions = [],
  averageEssentialSpending = 0,
  onDismissPrediction = () => {}
}) => {
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
      return { essential: {}, nonEssential: {} };
    }

    const essential = {};
    const nonEssential = {};

    Object.entries(expenseCategories).forEach(([category, amount]) => {
      // Check if this is a loan payment category (case-insensitive)
      const isLoanPayment = category.toLowerCase().includes('loan payment') || category.toLowerCase().includes('loan');
      
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

    return { essential, nonEssential };
  };

  const { essential: essentialExpenses, nonEssential: nonEssentialExpenses } = 
    showEssentialSplit ? groupExpensesByEssential(month.expenseCategories) : { essential: {}, nonEssential: {} };
  
  const essentialTotal = Object.values(essentialExpenses).reduce((sum, val) => sum + val, 0);
  const nonEssentialTotal = Object.values(nonEssentialExpenses).reduce((sum, val) => sum + val, 0);
  
  // Calculate predicted essential spending (use average if higher than current)
  const predictedEssentialAverage = isCurrentMonth ? (averageEssentialSpending || 0) : 0;
  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  const effectiveEssential = predictedEssentialAverage > 0 ? Math.max(essentialTotal, predictedEssentialAverage) : essentialTotal;
  const totalPredictedExpenses = effectiveEssential + nonEssentialTotal;
  // Calculate predicted savings, adding loan payments if they're counted as savings
  const basePredictedSavings = income - totalPredictedExpenses;
  const predictedSavings = includeLoanPayments ? basePredictedSavings + monthlyLoanPayment : basePredictedSavings;

  // Helper to toggle category expansion
  const toggleCategory = (categoryKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  // Helper to get transactions for a category
  const getCategoryTransactions = (category, type) => {
    const transactionsKey = type === 'income' ? 'incomeTransactions' : 'expenseTransactions';
    const actualTransactions = month[transactionsKey]?.[category] || [];
    
    // Add predicted transactions for this category if it's the current month
    if (isCurrentMonth && predictions && predictions.length > 0) {
      const predictedForCategory = predictions.filter(p => 
        p.category === category && 
        p.type === (type === 'income' ? 'income' : 'expense')
      );
      
      // Merge predicted transactions with actual ones, sorted by date
      const allTransactions = [...actualTransactions, ...predictedForCategory];
      return allTransactions.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA; // Most recent first
      });
    }
    
    return actualTransactions;
  };

  return (
    <>
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
          maxValue={Math.max(income, expenses, Math.abs(savings))}
          currency={defaultCurrency}
          type="positive"
        />
        {showEssentialSplit && (essentialTotal > 0 || nonEssentialTotal > 0) ? (
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
                      width: `${Math.max(income, expenses, Math.abs(savings)) > 0 ? (essentialTotal / Math.max(income, expenses, Math.abs(savings))) * 100 : 0}%`,
                      borderRadius: (isCurrentMonth && predictedEssentialDifference > 0) ? '8px 0 0 8px' : '8px'
                    }}
                  />
                  {isCurrentMonth && predictedEssentialDifference > 0 && (
                    <div
                      style={{ 
                        width: `${Math.max(income, expenses, Math.abs(savings)) > 0 ? (predictedEssentialDifference / Math.max(income, expenses, Math.abs(savings))) * 100 : 0}%`,
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
              maxValue={Math.max(income, expenses, Math.abs(savings))}
              currency={defaultCurrency}
              type="negative"
            />
          </>
        ) : (
          <MetricBar
            label="Expenses"
            value={expenses}
            maxValue={Math.max(income, expenses, Math.abs(savings))}
            currency={defaultCurrency}
            type="negative"
          />
        )}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <span className="metric-bar-label">
              {includeLoanPayments && monthlyLoanPayment > 0 ? "Savings (incl. loans)" : "Savings"}
            </span>
            <div className={`metric-bar-value ${(isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings) >= 0 ? 'positive' : 'negative'}`}>
              {(isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings) >= 0 ? '+' : ''}{formatCurrency(isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings, defaultCurrency)}
            </div>
          </div>
          <div className="metric-bar-container">
            <div
              className={`metric-bar-fill ${(isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings) >= 0 ? 'positive' : 'negative'}`}
              style={{ width: `${Math.max(income, expenses, Math.abs(savings)) > 0 ? (Math.abs(isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings) / Math.max(income, expenses, Math.abs(savings))) * 100 : 0}%` }}
            />
          </div>
          <div className="metric-bar-footer" style={{ fontSize: '12px', marginTop: '8px' }}>
            {(() => {
              const savingsGoal = defaultCurrency === 'CHF' ? 2000 : defaultCurrency === 'EUR' ? 2000 : 2200;
              const currentSavings = isCurrentMonth && predictedSavings !== savings ? predictedSavings : savings;
              return `${((currentSavings / savingsGoal) * 100).toFixed(0)}% of goal`;
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
                className="category-item" 
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
                              className="category-item" 
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
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => {
                                  const isPredicted = txn.is_predicted || txn.isPredicted;
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
                                      style={isPredicted ? { 
                                        borderColor: '#6366f1',
                                        backgroundColor: 'var(--color-bg-tertiary)',
                                        cursor: 'pointer'
                                      } : {}}
                                      onClick={isPredicted ? () => onDismissPrediction(txn) : undefined}
                                      title={isPredicted ? 'Click to dismiss prediction' : ''}
                                    >
                                      <div className="transaction-date">
                                        {formatDate(txn.date)}
                                        {isPredicted && (
                                          <span className="account-badge account-badge-predicted" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
                                            Predicted
                                          </span>
                                        )}
                                      </div>
                                      <div className="transaction-details">
                                        <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
                                        {txn.description && (
                                          <div className="transaction-description" style={isPredicted ? { color: '#6366f1', fontSize: '12px' } : {}}>
                                            {txn.description}
                                          </div>
                                        )}
                                      </div>
                                      <div className="transaction-amount">
                                        {formatCurrency(Math.abs(txn.amount), txn.currency || defaultCurrency)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item" style={{ fontWeight: '600' }}>
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
                className="category-item" 
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
                              className="category-item" 
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
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => {
                                  const isPredicted = txn.is_predicted || txn.isPredicted;
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
                                      style={isPredicted ? { 
                                        borderColor: '#6366f1',
                                        backgroundColor: 'var(--color-bg-tertiary)',
                                        cursor: 'pointer'
                                      } : {}}
                                      onClick={isPredicted ? () => onDismissPrediction(txn) : undefined}
                                      title={isPredicted ? 'Click to dismiss prediction' : ''}
                                    >
                                      <div className="transaction-date">
                                        {formatDate(txn.date)}
                                        {isPredicted && (
                                          <span className="account-badge account-badge-predicted" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
                                            Predicted
                                          </span>
                                        )}
                                      </div>
                                      <div className="transaction-details">
                                        <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
                                        {txn.description && (
                                          <div className="transaction-description" style={isPredicted ? { color: '#6366f1', fontSize: '12px' } : {}}>
                                            {txn.description}
                                          </div>
                                        )}
                                      </div>
                                      <div className="transaction-amount">
                                        {formatCurrency(Math.abs(txn.amount), txn.currency || defaultCurrency)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item" style={{ fontWeight: '600' }}>
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
        </>
      ) : (
        /* All Categories View */
        (() => {
          const expenseCategories = month.expenseCategories || {};
          const categoryEntries = Object.entries(expenseCategories);
          if (categoryEntries.length === 0) return null;
          
          const maxExpenseAmount = Math.max(...categoryEntries.map(([, amount]) => amount));
          const expenseTotal = Object.values(expenseCategories).reduce((sum, val) => sum + val, 0);
          
          return (
            <div className="categories-section">
              <div 
                className="category-item" 
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
                            className="category-item" 
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
                              <div className="transaction-list">
                                {transactions.map((txn, idx) => {
                                  const isPredicted = txn.is_predicted || txn.isPredicted;
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
                                      style={isPredicted ? { 
                                        borderColor: '#6366f1',
                                        backgroundColor: 'var(--color-bg-tertiary)',
                                        cursor: 'pointer'
                                      } : {}}
                                      onClick={isPredicted ? () => onDismissPrediction(txn) : undefined}
                                      title={isPredicted ? 'Click to dismiss prediction' : ''}
                                    >
                                      <div className="transaction-date">
                                        {formatDate(txn.date)}
                                        {isPredicted && (
                                          <span className="account-badge account-badge-predicted" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
                                            Predicted
                                          </span>
                                        )}
                                      </div>
                                      <div className="transaction-details">
                                        <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
                                        {txn.description && (
                                          <div className="transaction-description" style={isPredicted ? { color: '#6366f1', fontSize: '12px' } : {}}>
                                            {txn.description}
                                          </div>
                                        )}
                                      </div>
                                      <div className="transaction-amount">
                                        {formatCurrency(Math.abs(txn.amount), txn.currency || defaultCurrency)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item" style={{ fontWeight: '600' }}>
                      <span className="category-name">Total Expenses</span>
                      <span className="stat-value" style={{ fontWeight: '700' }}>
                        {formatCurrency(expenseTotal, defaultCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* Income Categories */}
      {(month.incomeCategories && Object.keys(month.incomeCategories).length > 0) && (() => {
        const incomeTotal = Object.values(month.incomeCategories).reduce((sum, val) => sum + val, 0);
        return (
          <div className="categories-section">
            <div 
              className="category-item" 
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
                            className="category-item" 
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
                              {transactions.map((txn, idx) => (
                                <div key={idx} className="transaction-item">
                                  <div className="transaction-date">{formatDate(txn.date)}</div>
                                  <div className="transaction-details">
                                    <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
                                    {txn.description && (
                                      <div className="transaction-description">{txn.description}</div>
                                    )}
                                  </div>
                                  <div className="transaction-amount">
                                    {formatCurrency(Math.abs(txn.amount), txn.currency || defaultCurrency)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Total at the bottom when expanded */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
                    <div className="category-item" style={{ fontWeight: '600' }}>
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

