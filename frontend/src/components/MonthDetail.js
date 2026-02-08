/**
 * MonthDetail Component
 * 
 * Displays detailed breakdown of a month's financial data including:
 * - Income and expense categories
 * - Transaction lists
 * - Essential vs non-essential spending splits
 * - Predictions for current month
 * - Category editing capabilities
 */

import React from 'react';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_GOAL_EUR,
  getColorForPercentage
} from '../utils/finance';

const MonthDetail = ({
  month,
  expandedCategories,
  toggleCategory,
  categorySorts,
  toggleSort,
  getSortedTransactions,
  formatCurrency,
  formatMonth,
  formatDate,
  handleCategoryEdit,
  pendingCategoryChange,
  showEssentialSplit,
  essentialCategories,
  categoryEditModal,
  getTransactionKey,
  includeLoanPayments,
  setShowEssentialCategoriesModal,
  defaultCurrency,
  handlePredictionClick,
  handleDismissPrediction,
  isCurrentMonth = false,
  allMonthsData = []
}) => {
  // State to track which section totals are expanded
  // Auto-expand current month sections to show predictions
  const currentMonth = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  
  const [expandedSections, setExpandedSections] = React.useState({
    [`${currentMonth}-income-section`]: true,
    [`${currentMonth}-spending-section`]: true
  });
  
  // Refs for scrolling to sections
  const incomeSectionRef = React.useRef(null);
  const spendingSectionRef = React.useRef(null);
  const essentialSectionRef = React.useRef(null);
  const nonEssentialSectionRef = React.useRef(null);
  
  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };
  
  const scrollToAndExpandSection = (sectionType) => {
    const sectionKey = `${month.month}-${sectionType}-section`;
    
    // Expand the section if it's not already expanded
    if (!expandedSections[sectionKey]) {
      setExpandedSections(prev => ({
        ...prev,
        [sectionKey]: true
      }));
    }
    
    // Scroll to the section with offset to keep header visible
    setTimeout(() => {
      let ref = null;
      if (sectionType === 'income') ref = incomeSectionRef;
      else if (sectionType === 'spending') ref = spendingSectionRef;
      else if (sectionType === 'essential') ref = essentialSectionRef;
      else if (sectionType === 'non-essential') ref = nonEssentialSectionRef;
      
      if (ref?.current) {
        const elementPosition = ref.current.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - 80; // 80px offset to keep header visible
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 100);
  };
  
  const hasExpenses = month.expense_categories && Object.keys(month.expense_categories).length > 0;
  const hasIncome = month.income_categories && Object.keys(month.income_categories).length > 0;

  const maxExpenseAmount = hasExpenses
    ? Math.max(...Object.values(month.expense_categories).map(cat => cat.total))
    : 0;
  const sortedExpenseCategories = hasExpenses
    ? Object.entries(month.expense_categories).sort(([, a], [, b]) => b.total - a.total)
    : [];

  const maxIncomeAmount = hasIncome
    ? Math.max(...Object.values(month.income_categories).map(cat => cat.total))
    : 0;
  const sortedIncomeCategories = hasIncome
    ? Object.entries(month.income_categories).sort(([, a], [, b]) => b.total - a.total)
    : [];

  // Use user's preferred default currency instead of auto-detecting
  const primaryCurrency = defaultCurrency;

  // Calculate savings goal based on currency
  const savingsGoal = (() => {
    switch (defaultCurrency) {
      case 'CHF':
        return SAVINGS_GOAL_CHF;
      case 'EUR':
        return SAVINGS_GOAL_EUR;
      case 'USD':
        return SAVINGS_GOAL_CHF * 1.1;
      default:
        return SAVINGS_GOAL_CHF;
    }
  })();

  // Calculate loan payment amount if needed
  let monthlyLoanPayment = 0;
  if (includeLoanPayments && month.expense_categories) {
    // Find loan payment category (case-insensitive)
    const loanCategory = Object.keys(month.expense_categories).find(cat => 
      cat.toLowerCase().includes('loan payment')
    );
    if (loanCategory) {
      const loanPaymentData = month.expense_categories[loanCategory];
      monthlyLoanPayment = loanPaymentData.total || 0;
    }
  }

  // Calculate adjusted savings and savings rate
  const actualSavings = month.savings || 0;
  const adjustedSavings = actualSavings + monthlyLoanPayment;
  const adjustedSavingsRate = month.income > 0 ? ((adjustedSavings / month.income) * 100) : 0;
  const displaySavings = includeLoanPayments ? adjustedSavings : actualSavings;
  const displaySavingsRate = includeLoanPayments ? adjustedSavingsRate : (month.saving_rate || 0);

  const essentialCategorySet = new Set(essentialCategories || []);
  
  // Build the essential categories label from user's customized list
  const essentialCategoryLabel = essentialCategories && essentialCategories.length > 0
    ? essentialCategories.join(', ')
    : 'Essential categories';
  let essentialTotal = 0;
  let essentialTransactionCount = 0;
  let nonEssentialTotal = 0;
  let nonEssentialTransactionCount = 0;

  if (hasExpenses) {
    Object.entries(month.expense_categories).forEach(([category, categoryData]) => {
      const categoryTotal = categoryData?.total || 0;
      const categoryTransactions = categoryData?.transactions || [];
      
      // Check if this is a loan payment category (case-insensitive, handle singular/plural)
      const isLoanPayment = category.toLowerCase().includes('loan payment');
      
      // If loan payments are counted as savings, exclude them from spending entirely
      if (includeLoanPayments && isLoanPayment) {
        return; // Skip this category
      }
      
      // If loan payments are NOT counted as savings, always treat them as essential
      if (!includeLoanPayments && isLoanPayment) {
        essentialTotal += categoryTotal;
        essentialTransactionCount += categoryTransactions.length;
        return;
      }
      
      // Check if category is essential based on user's customization
      if (essentialCategorySet.has(category)) {
        essentialTotal += categoryTotal;
        essentialTransactionCount += categoryTransactions.length;
      } else {
        nonEssentialTotal += categoryTotal;
        nonEssentialTransactionCount += categoryTransactions.length;
      }
    });
  }

  const totalTrackedExpenses = essentialTotal + nonEssentialTotal;
  const essentialShare = totalTrackedExpenses > 0 ? (essentialTotal / totalTrackedExpenses) * 100 : 0;
  const nonEssentialShare = totalTrackedExpenses > 0 ? (nonEssentialTotal / totalTrackedExpenses) * 100 : 0;

  const predictedEssentialAverage = React.useMemo(() => {
    if (!allMonthsData || allMonthsData.length === 0) return 0;

    const sortedMonths = [...allMonthsData].sort((a, b) => new Date(b.month) - new Date(a.month));
    const currentMonthIndex = sortedMonths.findIndex(m => m.month === month.month);
    const startIndex = currentMonthIndex >= 0 ? currentMonthIndex + 1 : 0;
    const previousMonths = sortedMonths.slice(startIndex, startIndex + 3);

    if (!previousMonths.length) return 0;

    const totals = previousMonths.map(m => {
      if (!m || !m.expense_categories) return 0;
      return Object.entries(m.expense_categories)
        .filter(([cat]) => {
          const isLoanPayment = cat.toLowerCase().includes('loan payment');
          // If loan payments are counted as savings, exclude them
          if (includeLoanPayments && isLoanPayment) return false;
          // If loan payments are NOT counted as savings, always include them as essential
          if (!includeLoanPayments && isLoanPayment) return true;
          // Otherwise check if category is in essential list
          return essentialCategorySet.has(cat);
        })
        .reduce((sum, [, catData]) => sum + (catData?.total || 0), 0);
    });

    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }, [allMonthsData, month.month, essentialCategorySet, includeLoanPayments]);

  // Render category section with transactions
  const renderCategorySection = (categories, maxAmount, sectionType) => {
    if (categories.length === 0) {
      return (
        <div className="empty-state">
          <p>No {sectionType} for this month</p>
        </div>
      );
    }

    return categories.map(([category, categoryData]) => {
      const categoryKey = `${month.month}-${category}`;
      const isExpanded = expandedCategories[categoryKey];
      const total = categoryData?.total || 0;
      const transactions = categoryData?.transactions || [];
      const barPercentage = maxAmount > 0 ? (Math.abs(total) / maxAmount) * 100 : 0;

      // Check if this category is being edited
      const isPending = pendingCategoryChange && 
        pendingCategoryChange.month === month.month &&
        pendingCategoryChange.category === category;

      return (
        <div key={category} className={`category-row ${isPending ? 'pending-change' : ''}`}>
          <div
            className="category-header"
            onClick={() => toggleCategory(categoryKey)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
              <div style={{ flex: 1 }}>
                <div className="category-name">{category}</div>
                <div className="category-bar">
                  <div
                    className={`category-bar-fill ${sectionType === 'expenses' ? 'bar-expense' : 'bar-income'}`}
                    style={{ width: `${barPercentage}%` }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="category-amount">{formatCurrency(total, primaryCurrency)}</span>
              <span className="category-count">{transactions.length} tx</span>
            </div>
          </div>

          {isExpanded && (
            <div className="transactions-list">
              <div className="transactions-header">
                <button
                  className="sort-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSort(categoryKey);
                  }}
                >
                  Sort by {categorySorts[categoryKey] === 'amount' ? 'Date ↓' : 'Amount ↓'}
                </button>
              </div>
              <div className="transactions-items">
                {getSortedTransactions(transactions, categoryKey, category).map((transaction) => {
                  const txKey = getTransactionKey(transaction);
                  return (
                    <div
                      key={txKey}
                      className="transaction-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCategoryEdit(month.month, transaction, category);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Click to change category"
                    >
                      <div className="transaction-main">
                        <div className="transaction-info">
                          <div className="transaction-recipient">{transaction.recipient || 'Unknown'}</div>
                          <div className="transaction-description">{transaction.description}</div>
                        </div>
                        <div className="transaction-details">
                          <div className="transaction-amount">{formatCurrency(transaction.amount, transaction.currency)}</div>
                          <div className="transaction-date">{formatDate(transaction.date)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="month-detail">
      <div className="month-header">
        <h3>{formatMonth(month.month)}</h3>
        <div className="month-stats">
          <div className="stat">
            <span className="stat-label">Income</span>
            <span className="stat-value positive">{formatCurrency(month.income || 0, primaryCurrency)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Expenses</span>
            <span className="stat-value negative">{formatCurrency(month.expenses || 0, primaryCurrency)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Savings</span>
            <span className="stat-value" style={{ color: getColorForPercentage((displaySavingsRate / 50) * 100) }}>
              {formatCurrency(displaySavings, primaryCurrency)}
            </span>
            <span className="stat-sublabel">
              {displaySavingsRate.toFixed(1)}% rate
            </span>
          </div>
        </div>
      </div>

      {/* Savings Progress Bar */}
      <div className="savings-progress">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.min((displaySavings / savingsGoal) * 100, 100)}%`,
              backgroundColor: getColorForPercentage((displaySavings / savingsGoal) * 100)
            }}
          />
        </div>
        <div className="progress-label">
          {((displaySavings / savingsGoal) * 100).toFixed(0)}% of {formatCurrency(savingsGoal, primaryCurrency)} goal
          {includeLoanPayments && monthlyLoanPayment > 0 && (
            <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>
              (includes {formatCurrency(monthlyLoanPayment, primaryCurrency)} loan payment)
            </span>
          )}
        </div>
      </div>

      {/* Essential/Non-Essential Split */}
      {showEssentialSplit && totalTrackedExpenses > 0 && (
        <div className="essential-split-section">
          <div className="split-header">
            <h4>Spending Breakdown</h4>
            <button
              className="btn-link"
              onClick={() => setShowEssentialCategoriesModal(true)}
              title="Customize essential categories"
            >
              Customize
            </button>
          </div>
          <div className="split-bars">
            <div
              className="split-bar essential-bar"
              style={{ width: `${essentialShare}%` }}
              onClick={() => scrollToAndExpandSection('essential')}
              title={`Essential: ${formatCurrency(essentialTotal, primaryCurrency)} (${essentialShare.toFixed(0)}%)`}
            >
              <span className="split-label">
                Essential {essentialShare.toFixed(0)}%
              </span>
            </div>
            <div
              className="split-bar non-essential-bar"
              style={{ width: `${nonEssentialShare}%` }}
              onClick={() => scrollToAndExpandSection('non-essential')}
              title={`Non-Essential: ${formatCurrency(nonEssentialTotal, primaryCurrency)} (${nonEssentialShare.toFixed(0)}%)`}
            >
              <span className="split-label">
                Non-Essential {nonEssentialShare.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="split-details">
            <div className="split-detail">
              <span className="split-detail-label">Essential ({essentialCategoryLabel})</span>
              <span className="split-detail-value">{formatCurrency(essentialTotal, primaryCurrency)}</span>
              <span className="split-detail-count">{essentialTransactionCount} transactions</span>
            </div>
            <div className="split-detail">
              <span className="split-detail-label">Non-Essential</span>
              <span className="split-detail-value">{formatCurrency(nonEssentialTotal, primaryCurrency)}</span>
              <span className="split-detail-count">{nonEssentialTransactionCount} transactions</span>
            </div>
          </div>

          {/* Predicted Essential Spending for Current Month */}
          {isCurrentMonth && predictedEssentialAverage > 0 && (
            <div className="prediction-box">
              <div className="prediction-header">
                <span className="prediction-title">📊 Essential Spending Prediction</span>
              </div>
              <div className="prediction-content">
                <div className="prediction-stat">
                  <span className="prediction-label">Expected (3-month avg)</span>
                  <span className="prediction-value">{formatCurrency(predictedEssentialAverage, primaryCurrency)}</span>
                </div>
                <div className="prediction-stat">
                  <span className="prediction-label">Current</span>
                  <span className="prediction-value">{formatCurrency(essentialTotal, primaryCurrency)}</span>
                </div>
                <div className="prediction-stat">
                  <span className="prediction-label">Progress</span>
                  <span
                    className="prediction-value"
                    style={{
                      color: essentialTotal > predictedEssentialAverage ? '#dc2626' : '#10b981'
                    }}
                  >
                    {((essentialTotal / predictedEssentialAverage) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              {essentialTotal > predictedEssentialAverage && (
                <div className="prediction-warning">
                  ⚠️ Essential spending is above average
                </div>
              )}
            </div>
          )}

          {/* Essential Categories Section */}
          {essentialTotal > 0 && (
            <div className="category-section" ref={essentialSectionRef}>
              <div
                className="section-total-header"
                onClick={() => toggleSection(`${month.month}-essential-section`)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`expand-icon ${expandedSections[`${month.month}-essential-section`] ? 'expanded' : ''}`}>
                    ▶
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="category-name" style={{ fontWeight: '600' }}>
                      Total Essential
                    </div>
                    {isCurrentMonth && predictedEssentialAverage > 0 && (
                      <div className="category-bar" style={{ marginTop: '8px' }}>
                        <div
                          className="category-bar-fill bar-essential"
                          style={{ 
                            width: `${Math.min((essentialTotal / predictedEssentialAverage) * 100, 100)}%`,
                            transition: 'width 0.3s ease'
                          }}
                          title={`${((essentialTotal / predictedEssentialAverage) * 100).toFixed(0)}% of predicted`}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="category-amount">{formatCurrency(essentialTotal, primaryCurrency)}</span>
                  <span className="category-count">{essentialTransactionCount} tx</span>
                </div>
              </div>

              {expandedSections[`${month.month}-essential-section`] && (
                <div className="category-list">
                  {renderCategorySection(
                    sortedExpenseCategories.filter(([cat]) => {
                      const isLoanPayment = cat.toLowerCase().includes('loan payment');
                      if (includeLoanPayments && isLoanPayment) return false;
                      if (!includeLoanPayments && isLoanPayment) return true;
                      return essentialCategorySet.has(cat);
                    }),
                    maxExpenseAmount,
                    'expenses'
                  )}
                </div>
              )}
            </div>
          )}

          {/* Non-Essential Categories Section */}
          {nonEssentialTotal > 0 && (
            <div className="category-section" ref={nonEssentialSectionRef}>
              <div
                className="section-total-header"
                onClick={() => toggleSection(`${month.month}-non-essential-section`)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`expand-icon ${expandedSections[`${month.month}-non-essential-section`] ? 'expanded' : ''}`}>
                    ▶
                  </span>
                  <div className="category-name" style={{ fontWeight: '600' }}>Total Non-Essential</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="category-amount">{formatCurrency(nonEssentialTotal, primaryCurrency)}</span>
                  <span className="category-count">{nonEssentialTransactionCount} tx</span>
                </div>
              </div>

              {expandedSections[`${month.month}-non-essential-section`] && (
                <div className="category-list">
                  {renderCategorySection(
                    sortedExpenseCategories.filter(([cat]) => {
                      const isLoanPayment = cat.toLowerCase().includes('loan payment');
                      if (includeLoanPayments && isLoanPayment) return false;
                      return !essentialCategorySet.has(cat) && !isLoanPayment;
                    }),
                    maxExpenseAmount,
                    'expenses'
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Income Section */}
      {hasIncome && (
        <div className="category-section" ref={incomeSectionRef}>
          <div
            className="section-total-header"
            onClick={() => toggleSection(`${month.month}-income-section`)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`expand-icon ${expandedSections[`${month.month}-income-section`] ? 'expanded' : ''}`}>
                ▶
              </span>
              <div className="category-name" style={{ fontWeight: '600' }}>Income</div>
            </div>
            <span className="category-amount positive">{formatCurrency(month.income || 0, primaryCurrency)}</span>
          </div>

          {expandedSections[`${month.month}-income-section`] && (
            <div className="category-list">
              {renderCategorySection(sortedIncomeCategories, maxIncomeAmount, 'income')}
            </div>
          )}
        </div>
      )}

      {/* Spending Section (when not showing essential split) */}
      {!showEssentialSplit && hasExpenses && (
        <div className="category-section" ref={spendingSectionRef}>
          <div
            className="section-total-header"
            onClick={() => toggleSection(`${month.month}-spending-section`)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`expand-icon ${expandedSections[`${month.month}-spending-section`] ? 'expanded' : ''}`}>
                ▶
              </span>
              <div className="category-name" style={{ fontWeight: '600' }}>Spending</div>
            </div>
            <span className="category-amount negative">{formatCurrency(month.expenses || 0, primaryCurrency)}</span>
          </div>

          {expandedSections[`${month.month}-spending-section`] && (
            <div className="category-list">
              {renderCategorySection(sortedExpenseCategories, maxExpenseAmount, 'expenses')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonthDetail;



