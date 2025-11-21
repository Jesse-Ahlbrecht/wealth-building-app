import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell } from 'recharts';
import './App.css';
import MonthlyOverviewPage from './pages/MonthlyOverviewPage';
import ChartsPage from './pages/ChartsPage';
import AccountsPage from './pages/AccountsPage';
import BrokerPage from './pages/BrokerPage';
import LoansPage from './pages/LoansPage';
import ProjectionPage from './pages/ProjectionPage';
import DocumentsPage from './pages/DocumentsPage';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_GOAL_EUR,
  SAVINGS_RATE_GOAL,
  EUR_TO_CHF_RATE,
  convertAmountToCurrency,
  getColorForPercentage
} from './utils/finance';
import { createFileUpload } from './fileUpload';

const DEFAULT_ESSENTIAL_CATEGORIES = ['Rent', 'Insurance', 'Groceries', 'Utilities'];
const TAB_ITEMS = [
  { key: 'monthly-overview', label: 'Monthly Overview' },
  { key: 'charts', label: 'Savings Statistics' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'broker', label: 'Broker' },
  { key: 'loans', label: 'Loans' },
  { key: 'projection', label: 'Wealth Projection' },
  { key: 'data', label: 'Manage Files' }
];
const TAB_DESCRIPTIONS = {
  'monthly-overview': 'Track current month progress and review historical spending patterns',
  charts: 'Track savings progress and rates over time',
  accounts: 'Review balances across cash and savings accounts',
  broker: 'Inspect performance of your investment accounts',
  loans: 'Stay on top of loan balances and payments',
  projection: 'Model future net worth using your current savings rate',
  data: 'Upload and manage statements, broker reports, and loan documents'
};

const API_BASE_URL = 'http://localhost:5001';

const BANK_STATEMENT_TYPES = {
  bank_statement_dkb: 'dkb',
  bank_statement_yuh: 'yuh'
};

const BROKER_DOCUMENT_TYPES = {
  broker_ing_diba_csv: 'ing_diba',
  broker_viac_pdf: 'viac'
};

const normalizeTypeKey = (value) =>
  (value || '').toString().trim().toLowerCase();

const normalizeDocumentRecord = (doc) => {
  if (!doc) return doc;
  let metadata = doc.documentMetadata ?? doc.metadata ?? doc.encryption_metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (error) {
      metadata = {};
    }
  }
  if (!metadata || typeof metadata !== 'object') {
    metadata = {};
  }

  const fileInfo = metadata.file_info || doc.fileInfo || {};
  const documentType =
    doc.documentType ||
    doc.file_type ||
    fileInfo.document_type ||
    metadata.document_type ||
    (doc.documentMetadata && doc.documentMetadata.document_type);

  return {
    ...doc,
    documentType,
    documentMetadata: metadata,
    metadata,
    fileInfo,
    clientMetadata: metadata.client_encryption || doc.clientMetadata
  };
};

const uploadBankStatementWithProgress = (file, bankType, sessionToken, onProgress, documentId = null, handleAuthFailure = null) => {
  if (!bankType) {
    return Promise.resolve(null);
  }

  const emit = (phase, progress, message, extra = {}) => {
    if (typeof onProgress === 'function') {
      onProgress(phase, progress, message, extra);
    }
  };

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    formData.append('file', file);
    formData.append('bankType', bankType);
    formData.append('uploadId', uploadId);
    if (documentId) {
      formData.append('documentId', documentId.toString());
    }

    const xhr = new XMLHttpRequest();
    let pollHandle = null;
    let finished = false;

    const stopPolling = () => {
      if (pollHandle) {
        clearTimeout(pollHandle);
        pollHandle = null;
      }
    };

    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/upload-progress/${uploadId}`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        });

        if (response.status === 401) {
          if (handleAuthFailure) {
            handleAuthFailure();
          }
          stopPolling();
          return;
        }

        if (response.ok) {
          const payload = await response.json();
          const data = payload.data || payload;

          if (data.success) {
            const total = data.total || 0;
            const processed = data.processed || 0;
            const percent = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 0;
            emit('processing', percent, `Processing ${processed}/${total} transactions…`, {
              processedCount: `${processed}/${total}`
            });

            if (data.status === 'complete' || data.status === 'error') {
              return;
            }
          }
        }
      } catch (error) {
        console.warn('Progress polling error:', error);
      }

      if (!finished) {
        pollHandle = setTimeout(pollProgress, 600);
      }
    };

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        emit('upload', percent, `Uploading… ${percent}%`);
      }
    });

    xhr.upload.addEventListener('load', () => {
      emit('upload', 100, 'Upload complete.');
      emit('processing', 0, 'Processing transactions…', { processedCount: '0/?' });
      pollProgress();
    });

    xhr.addEventListener('load', () => {
      finished = true;
      stopPolling();
      try {
        const responseText = xhr.responseText;
        const parsed = responseText ? JSON.parse(responseText) : {};
        const actual = parsed.data || parsed;

        if ((xhr.status >= 200 && xhr.status < 300) && actual?.success) {
          const imported = actual.imported || actual.processed || 0;
          const total = actual.total || actual.processed || imported;
          emit('processing', 100, `Processing complete: ${imported}/${total} transactions`, {
            processedCount: `${imported}/${total}`
          });
          resolve(actual);
        } else {
          const errorMessage = actual?.error || actual?.message || `Failed to import statement (status ${xhr.status})`;
          emit('processing', 100, errorMessage, { processedCount: 'error' });
          reject(new Error(errorMessage));
        }
      } catch (error) {
        emit('processing', 100, 'Failed to parse import response', { processedCount: 'error' });
        reject(error);
      }
    });

    const handleFailure = (reason) => {
      finished = true;
      stopPolling();
      emit('processing', 100, reason, { processedCount: 'error' });
      reject(new Error(reason));
    };

    xhr.addEventListener('error', () => handleFailure('Import failed - network error'));
    xhr.addEventListener('abort', () => handleFailure('Import cancelled'));

    xhr.open('POST', `${API_BASE_URL}/api/upload-csv`);
    xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
    xhr.send(formData);
  });
};

const getPrimaryCurrencyForMonth = (month = {}) => {
  const eurTotal = Math.abs(month.currency_totals?.EUR || 0);
  const chfTotal = Math.abs(month.currency_totals?.CHF || 0);
  return eurTotal >= chfTotal ? 'EUR' : 'CHF';
};

const getTransactionKey = (transaction) => {
  if (!transaction) return '';
  const {
    date = '',
    account = '',
    recipient = '',
    description = '',
    amount = '',
    currency = ''
  } = transaction;

  return [
    date,
    account,
    recipient,
    description,
    amount.toString(),
    currency
  ].join('|');
};

// Reusable Month Detail Component
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

    const sumTotals = totals.reduce((sum, val) => sum + val, 0);
    return totals.length > 0 ? sumTotals / totals.length : 0;
  }, [allMonthsData, month.month, includeLoanPayments, essentialCategories?.join('|')]);

  const predictedEssentialDifference = Math.max(predictedEssentialAverage - essentialTotal, 0);
  // Use the larger of actual essential or predicted essential average
  const effectiveEssential = predictedEssentialAverage > 0 ? Math.max(essentialTotal, predictedEssentialAverage) : essentialTotal;
  const totalPredictedExpenses = effectiveEssential + nonEssentialTotal;
  const expensesShareOfIncome = month.income > 0 ? (totalTrackedExpenses / month.income) * 100 : 0;
  const predictedExpensesShareOfIncome = month.income > 0 ? (totalPredictedExpenses / month.income) * 100 : 0;
  const predictedEssentialShareOfIncome = month.income > 0 ? (predictedEssentialAverage / month.income) * 100 : 0;
  
  // Calculate predicted savings based on predicted expenses
  // Note: totalPredictedExpenses already excludes loan when includeLoanPayments is true,
  // so predictedSavings already includes the loan implicitly
  const predictedSavings = month.income - totalPredictedExpenses;
  const predictedSavingsRate = month.income > 0 ? (predictedSavings / month.income) * 100 : 0;
  const displayPredictedSavings = predictedSavings;
  const displayPredictedSavingsRate = predictedSavingsRate;

  return (
    <div className="month-section">
      <div className="month-header">
        <h2 className="month-title">{formatMonth(month.month)}</h2>
        {!isCurrentMonth && (
          <div className="saving-info">
            <div className={`saving-amount ${displaySavings >= 0 ? 'positive' : 'negative'}`}>
              {displaySavings >= 0 ? '+' : ''}{formatCurrency(displaySavings, primaryCurrency)}
              {includeLoanPayments && monthlyLoanPayment > 0 && (
                <span style={{ fontSize: '11px', color: '#666', marginLeft: '4px' }}>
                  (incl. loans)
                </span>
              )}
            </div>
            <div className={`saving-rate-small ${displaySavingsRate >= 0 ? 'positive' : 'negative'}`}>
              {displaySavingsRate >= 0 ? '+' : ''}{displaySavingsRate.toFixed(1)}%
            </div>
            <div className={`goal-progress ${displaySavings >= savingsGoal ? 'goal-achieved' : 'goal-pending'}`}>
              {((displaySavings / savingsGoal) * 100).toFixed(0)}% of goal
            </div>
          </div>
        )}
      </div>

      <div className="metrics-bar-charts">
        {/* Income Bar */}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <div className="metric-bar-label">INCOME</div>
            <div className="metric-bar-value positive">+{formatCurrency(month.income, primaryCurrency)}</div>
          </div>
          <div 
            className="metric-bar-container"
            onClick={() => scrollToAndExpandSection('income')}
            style={{ cursor: 'pointer' }}
            title="Click to view income details"
          >
            <div
              className="metric-bar-fill positive"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Expenses Bar - Stacked with Essential/Non-Essential */}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <div className="metric-bar-label">EXPENSES</div>
            <div className="metric-bar-value negative">-{formatCurrency(
              isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses, 
              primaryCurrency
            )}</div>
          </div>
          <div className="metric-bar-container">
            {showEssentialSplit ? (
              <div style={{ display: 'flex', width: `${isCurrentMonth ? predictedExpensesShareOfIncome : expensesShareOfIncome}%`, height: '100%' }}>
                <div
                  className="metric-bar-fill"
                  onClick={() => scrollToAndExpandSection('essential')}
                  style={{ 
                    width: `${(isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses) > 0 ? (essentialTotal / (isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses)) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #991b1b, #dc2626)',
                    borderRadius: '8px 0 0 8px',
                    cursor: 'pointer'
                  }}
                  title={`Essential: ${formatCurrency(essentialTotal, primaryCurrency)} - Click to view details`}
                />
                {isCurrentMonth && predictedEssentialAverage > 0 && (
                  <div
                    style={{ 
                      width: `${totalPredictedExpenses > 0 ? ((predictedEssentialAverage - essentialTotal) / totalPredictedExpenses) * 100 : 0}%`,
                      background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.25), rgba(220, 38, 38, 0.15))',
                      borderRadius: '0',
                      minWidth: predictedEssentialAverage > essentialTotal ? '2px' : '0'
                    }}
                    title={`Essential avg gap: ${formatCurrency(Math.max(0, predictedEssentialAverage - essentialTotal), primaryCurrency)}`}
                  />
                )}
                <div
                  className="metric-bar-fill"
                  onClick={() => scrollToAndExpandSection('non-essential')}
                  style={{ 
                    width: `${(isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses) > 0 ? (nonEssentialTotal / (isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses)) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #f97316, #fb923c)',
                    borderRadius: '0 8px 8px 0',
                    cursor: 'pointer'
                  }}
                  title={`Non-Essential: ${formatCurrency(nonEssentialTotal, primaryCurrency)} - Click to view details`}
                />
              </div>
            ) : (
              <div
                className="metric-bar-fill negative"
                onClick={() => scrollToAndExpandSection('spending-section')}
                style={{ 
                  width: `${isCurrentMonth ? predictedExpensesShareOfIncome : expensesShareOfIncome}%`,
                  cursor: 'pointer'
                }}
                title={`Expenses: ${formatCurrency(isCurrentMonth ? totalPredictedExpenses : totalTrackedExpenses, primaryCurrency)} - Click to view details`}
              />
            )}
          </div>
          {showEssentialSplit && (
            <div className="metric-bar-footer" style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: 'linear-gradient(90deg, #991b1b, #dc2626)', borderRadius: '2px', display: 'inline-block' }}></span>
                Essential: {formatCurrency(essentialTotal, primaryCurrency)} ({essentialShare.toFixed(0)}%)
              </span>
              {isCurrentMonth && predictedEssentialAverage > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.45), rgba(220, 38, 38, 0.15))', borderRadius: '2px', display: 'inline-block' }}></span>
                  Essential avg: {formatCurrency(predictedEssentialAverage, primaryCurrency)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: 'linear-gradient(90deg, #f97316, #fb923c)', borderRadius: '2px', display: 'inline-block' }}></span>
                Non-Essential: {formatCurrency(nonEssentialTotal, primaryCurrency)} ({nonEssentialShare.toFixed(0)}%)
              </span>
            </div>
          )}
        </div>

        {/* Savings Bar */}
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <div className="metric-bar-label">
              SAVINGS {includeLoanPayments && monthlyLoanPayment > 0 && '(INCL. LOANS)'}
            </div>
            <div className="metric-bar-value positive">
              {(isCurrentMonth ? displayPredictedSavings : displaySavings) >= 0 ? '+' : ''}{formatCurrency(isCurrentMonth ? displayPredictedSavings : displaySavings, primaryCurrency)}
              <span className="metric-bar-meta">
                {(isCurrentMonth ? displayPredictedSavingsRate : displaySavingsRate).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="metric-bar-container">
            <div
              className="metric-bar-fill positive"
              style={{ width: `${month.income > 0 ? ((isCurrentMonth ? displayPredictedSavings : displaySavings) / month.income) * 100 : 0}%` }}
            />
          </div>
          <div className="metric-bar-footer">
            {(((isCurrentMonth ? displayPredictedSavings : displaySavings) / savingsGoal) * 100).toFixed(0)}% of goal
          </div>
        </div>

      </div>

      {sortedIncomeCategories.length > 0 && (() => {
        const incomeSectionKey = `${month.month}-income-section`;
        const isIncomeExpanded = expandedSections[incomeSectionKey];
        
        console.log(`💡 Rendering income section for ${month.month}:`, {
          sortedIncomeCategories: sortedIncomeCategories.length,
          isIncomeExpanded,
          incomeSectionKey
        });
        
        return (
        <div className="categories-section" ref={incomeSectionRef}>
          <h3 
            className="categories-title" 
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => toggleSection(incomeSectionKey)}
          >
            <span className="expand-arrow">{isIncomeExpanded ? '▼' : '▶'}</span>
            Income by Category
          </h3>
          <div className="category-list">
            {isIncomeExpanded && sortedIncomeCategories.map(([category, categoryData]) => {
              const categoryKey = `${month.month}-income-${category}`;
              const isExpanded = expandedCategories[categoryKey];

              return (
                <div key={category}>
                  <div
                    className="category-item category-item-income"
                    onClick={() => toggleCategory(month.month, `income-${category}`)}
                    style={{ cursor: 'pointer' }}
                    data-category-key={categoryKey}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="category-name">
                        <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                        {category}
                        <span className="transaction-count">
                          ({categoryData.transactions.length})
                        </span>
                      </div>
                      <div className="category-bar">
                        <div
                          className="category-bar-fill category-bar-income"
                          style={{ width: `${(categoryData.total / maxIncomeAmount) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="category-amount category-amount-income">
                      {formatCurrency(categoryData.total, primaryCurrency)}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="transaction-list-wrapper">
                      <div className="transaction-list-header">
                        <button
                          className="sort-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSort(month.month, `income-${category}`);
                          }}
                        >
                          Sort by: {(categorySorts[categoryKey] || 'amount') === 'amount' ? 'Amount' : 'Date'}
                        </button>
                      </div>
                      <div className="transaction-list">
                        {getSortedTransactions(categoryData.transactions, month.month, `income-${category}`).map((transaction) => {
                          const transactionKey = getTransactionKey(transaction);
                          const isLocked = pendingCategoryChange?.key === transactionKey;
                          const isPending = isLocked && pendingCategoryChange?.stage === 'vanishing';
                          const isPredicted = transaction.is_predicted;
                          const transactionClassList = ['transaction-item'];
                          if (isPredicted) {
                            transactionClassList.push('transaction-item-predicted');
                          }
                          if (isLocked && pendingCategoryChange?.stage === 'pending') {
                            transactionClassList.push('transaction-pending');
                          }
                          if (isPending) {
                            transactionClassList.push('transaction-flip-out');
                          }
                          const transactionClassName = transactionClassList.join(' ');

                          return (
                            <div
                              key={transactionKey}
                              className={transactionClassName}
                              data-transaction-key={transactionKey}
                              onClick={isPredicted ? () => handlePredictionClick(transaction) : undefined}
                              style={isPredicted ? { cursor: 'pointer' } : undefined}
                            >
                              <div className="transaction-date">
                                {formatDate(transaction.date)}
                                {isPredicted ? (
                                  <span className="account-badge account-badge-predicted" title={`${transaction.recurrence_type} prediction - ${(transaction.confidence * 100).toFixed(0)}% confidence. Click to see details.`}>
                                    Predicted
                                  </span>
                                ) : (
                                  <span className={`account-badge account-badge-${transaction.account.toLowerCase().replace(/ /g, '-')}`}>
                                    {transaction.account}
                                  </span>
                                )}
                              </div>
                              <div className="transaction-details">
                                <div className="transaction-recipient">
                                  {transaction.recipient}
                                </div>
                                {isPredicted ? (
                                  <div className="transaction-description" style={{ color: '#6b7eff', fontSize: '12px' }}>
                                    Predicted based on {transaction.based_on?.length || 0} past payment{(transaction.based_on?.length || 0) !== 1 ? 's' : ''}
                                  </div>
                                ) : transaction.description ? (
                                  <div className="transaction-description">
                                    {transaction.description}
                                  </div>
                                ) : null}
                              </div>
                              <div className="transaction-actions">
                                {isPredicted ? (
                                  <button
                                    className="dismiss-prediction-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDismissPrediction(transaction);
                                    }}
                                    title="Dismiss prediction"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                ) : (
                                  <button
                                    className={`category-edit-btn ${
                                      categoryEditModal && 
                                      getTransactionKey(categoryEditModal.transaction) === getTransactionKey(transaction)
                                      ? 'active' : ''
                                    }`}
                                    onClick={() => handleCategoryEdit(transaction, month.month, `income-${category}`)}
                                    disabled={isLocked}
                                    title="Change category"
                                  >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </button>
                                )}
                              </div>
                              <div className="transaction-amount transaction-amount-income">
                                +{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
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
            
            {/* Income Total - At bottom, always visible (informational only) */}
            <div 
              className="category-item category-total-row" 
              style={{ 
                marginTop: '12px', 
                paddingTop: '12px',
                fontWeight: '600',
                borderRadius: '0 0 8px 8px'
              }}>
              <div style={{ flex: 1 }}>
                <div className="category-name" style={{ fontWeight: '600' }}>
                  Total Income
                </div>
              </div>
              <div className="category-amount category-amount-income" style={{ fontWeight: '700', fontSize: '16px' }}>
                {formatCurrency(month.income, primaryCurrency)}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {sortedExpenseCategories.length > 0 && !showEssentialSplit && (() => {
        const spendingSectionKey = `${month.month}-spending-section`;
        const isSpendingExpanded = expandedSections[spendingSectionKey];
        
        console.log(`💡 Rendering expense section for ${month.month}:`, {
          sortedExpenseCategories: sortedExpenseCategories.length,
          isSpendingExpanded,
          spendingSectionKey,
          showEssentialSplit
        });
        
        return (
        <div className="categories-section" ref={spendingSectionRef}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 
              className="categories-title" 
              style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => toggleSection(spendingSectionKey)}
            >
              <span className="expand-arrow">{isSpendingExpanded ? '▼' : '▶'}</span>
              Spending by Category
            </h3>
            <button
              className="edit-categories-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowEssentialCategoriesModal(true);
              }}
              title="Customize essential categories"
            >
              <i className="fa-solid fa-pen-to-square"></i> Customize Essential
            </button>
          </div>
          <div className="category-list">
            {isSpendingExpanded && sortedExpenseCategories.map(([category, categoryData]) => {
              const categoryKey = `${month.month}-${category}`;
              const isExpanded = expandedCategories[categoryKey];

              return (
                <div key={category}>
                  <div
                    className="category-item"
                    onClick={() => toggleCategory(month.month, category)}
                    style={{ cursor: 'pointer' }}
                    data-category-key={categoryKey}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="category-name">
                        <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                        {category}
                        <span className="transaction-count">
                          ({categoryData.transactions.length})
                        </span>
                      </div>
                      <div className="category-bar">
                        <div
                          className="category-bar-fill"
                          style={{ width: `${(categoryData.total / maxExpenseAmount) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="category-amount">
                      {formatCurrency(categoryData.total, primaryCurrency)}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="transaction-list-wrapper">
                      <div className="transaction-list-header">
                        <button
                          className="sort-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSort(month.month, category);
                          }}
                        >
                          Sort by: {(categorySorts[categoryKey] || 'amount') === 'amount' ? 'Amount' : 'Date'}
                        </button>
                      </div>
                      <div className="transaction-list">
                        {getSortedTransactions(categoryData.transactions, month.month, category).map((transaction) => {
                          const transactionKey = getTransactionKey(transaction);
                          const isLocked = pendingCategoryChange?.key === transactionKey;
                          const isPending = isLocked && pendingCategoryChange?.stage === 'vanishing';
                          const isPredicted = transaction.is_predicted;
                          const transactionClassList = ['transaction-item'];
                          if (isPredicted) {
                            transactionClassList.push('transaction-item-predicted');
                          }
                          if (isLocked && pendingCategoryChange?.stage === 'pending') {
                            transactionClassList.push('transaction-pending');
                          }
                          if (isPending) {
                            transactionClassList.push('transaction-flip-out');
                          }
                          const transactionClassName = transactionClassList.join(' ');

                          return (
                            <div
                              key={transactionKey}
                              className={transactionClassName}
                              data-transaction-key={transactionKey}
                              onClick={isPredicted ? () => handlePredictionClick(transaction) : undefined}
                              style={isPredicted ? { cursor: 'pointer' } : undefined}
                            >
                              <div className="transaction-date">
                                {formatDate(transaction.date)}
                                {isPredicted ? (
                                  <span className="account-badge account-badge-predicted" title={`${transaction.recurrence_type} prediction - ${(transaction.confidence * 100).toFixed(0)}% confidence. Click to see details.`}>
                                    Predicted
                                  </span>
                                ) : (
                                  <span className={`account-badge account-badge-${transaction.account.toLowerCase().replace(/ /g, '-')}`}>
                                    {transaction.account}
                                  </span>
                                )}
                              </div>
                              <div className="transaction-details">
                                <div className="transaction-recipient">
                                  {transaction.recipient}
                                </div>
                                {isPredicted ? (
                                  <div className="transaction-description" style={{ color: '#6b7eff', fontSize: '12px' }}>
                                    Predicted based on {transaction.based_on?.length || 0} past payment{(transaction.based_on?.length || 0) !== 1 ? 's' : ''}
                                  </div>
                                ) : transaction.description ? (
                                  <div className="transaction-description">
                                    {transaction.description}
                                  </div>
                                ) : null}
                              </div>
                              <div className="transaction-actions">
                                {isPredicted ? (
                                  <button
                                    className="dismiss-prediction-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDismissPrediction(transaction);
                                    }}
                                    title="Dismiss prediction"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                ) : (
                                  <button
                                    className={`category-edit-btn ${
                                      categoryEditModal && 
                                      getTransactionKey(categoryEditModal.transaction) === getTransactionKey(transaction)
                                      ? 'active' : ''
                                    }`}
                                    onClick={() => handleCategoryEdit(transaction, month.month, category)}
                                    disabled={isLocked}
                                    title="Change category"
                                  >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </button>
                                )}
                              </div>
                              <div className="transaction-amount">
                                -{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
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
            
            {/* Spending Total - At bottom, always visible (informational only) */}
            <div 
              className="category-item" 
              style={{ 
                borderTop: '3px solid #1a1a1a', 
                marginTop: '12px', 
                paddingTop: '12px',
                background: '#f5f5f5',
                fontWeight: '600',
                borderRadius: '0 0 8px 8px'
              }}>
              <div style={{ flex: 1 }}>
                <div className="category-name" style={{ fontWeight: '600' }}>
                  Total Spending
                </div>
              </div>
              <div className="category-amount" style={{ fontWeight: '700', fontSize: '16px' }}>
                {formatCurrency(totalTrackedExpenses, primaryCurrency)}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {showEssentialSplit && sortedExpenseCategories.length > 0 && (() => {
        const essentialCats = sortedExpenseCategories.filter(([category]) => {
          const isLoanPayment = category.toLowerCase().includes('loan payment');
          // If loan payments are counted as savings, exclude them entirely
          if (includeLoanPayments && isLoanPayment) return false;
          // If loan payments are NOT counted as savings, treat them as essential
          if (!includeLoanPayments && isLoanPayment) return true;
          // Check if category is in the essential categories list
          return essentialCategories.includes(category);
        });
        const nonEssentialCats = sortedExpenseCategories.filter(([category]) => {
          const isLoanPayment = category.toLowerCase().includes('loan payment');
          // If loan payments are counted as savings, exclude them entirely
          if (includeLoanPayments && isLoanPayment) return false;
          // If loan payments are NOT counted as savings, they go to essential, not here
          if (!includeLoanPayments && isLoanPayment) return false;
          // Otherwise, everything that's not essential goes here
          return !essentialCategories.includes(category);
        });

        const renderCategorySection = (categories, title, barClassName) => {
          if (categories.length === 0) return null;
          
          const sectionKey = `${month.month}-${title.includes('(Essential)') ? 'essential' : 'non-essential'}-section`;
          const isSectionExpanded = expandedSections[sectionKey];
          const totalAmount = categories.reduce((sum, [, categoryData]) => sum + categoryData.total, 0);
          const sectionRef = title.includes('(Essential)') ? essentialSectionRef : nonEssentialSectionRef;
          const predictedAmount = title.includes('(Essential)') ? predictedEssentialAverage : 0;
          
          return (
            <div className="categories-section" ref={sectionRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 
                  className="categories-title" 
                  style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => toggleSection(sectionKey)}
                >
                  <span className="expand-arrow">{isSectionExpanded ? '▼' : '▶'}</span>
                  {title}
                </h3>
                {title.includes('Essential') && (
                  <button
                    className="edit-categories-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEssentialCategoriesModal(true);
                    }}
                    title="Customize essential categories"
                  >
                    <i className="fa-solid fa-pen-to-square"></i> Customize
                  </button>
                )}
              </div>
              <div className="category-list">
                {isSectionExpanded && categories.map(([category, categoryData]) => {
                  const categoryKey = `${month.month}-${category}`;
                  const isExpanded = expandedCategories[categoryKey];

                  return (
                    <div key={category}>
                      <div
                        className="category-item"
                        onClick={() => toggleCategory(month.month, category)}
                        style={{ cursor: 'pointer' }}
                        data-category-key={categoryKey}
                      >
                        <div style={{ flex: 1 }}>
                          <div className="category-name">
                            <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                            {category}
                            <span className="transaction-count">
                              ({categoryData.transactions.length})
                            </span>
                          </div>
                          <div className="category-bar">
                            <div
                              className={`category-bar-fill ${barClassName}`}
                              style={{ width: `${(categoryData.total / maxExpenseAmount) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="category-amount">
                          {formatCurrency(categoryData.total, primaryCurrency)}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="transaction-list-wrapper">
                          <div className="transaction-list-header">
                            <button
                              className="sort-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSort(month.month, category);
                              }}
                            >
                              Sort by: {(categorySorts[categoryKey] || 'amount') === 'amount' ? 'Amount' : 'Date'}
                            </button>
                          </div>
                          <div className="transaction-list">
                            {getSortedTransactions(categoryData.transactions, month.month, category).map((transaction) => {
                              const transactionKey = getTransactionKey(transaction);
                              const isLocked = pendingCategoryChange?.key === transactionKey;
                              const isPending = isLocked && pendingCategoryChange?.stage === 'vanishing';
                              const isPredicted = transaction.is_predicted;
                              const transactionClassList = ['transaction-item'];
                              if (isPredicted) {
                                transactionClassList.push('transaction-item-predicted');
                              }
                              if (isLocked && pendingCategoryChange?.stage === 'pending') {
                                transactionClassList.push('transaction-pending');
                              }
                              if (isPending) {
                                transactionClassList.push('transaction-flip-out');
                              }
                              const transactionClassName = transactionClassList.join(' ');

                              return (
                                <div
                                  key={transactionKey}
                                  className={transactionClassName}
                                  data-transaction-key={transactionKey}
                                  onClick={isPredicted ? () => handlePredictionClick(transaction) : undefined}
                                  style={isPredicted ? { cursor: 'pointer' } : undefined}
                                >
                                  <div className="transaction-date">
                                    {formatDate(transaction.date)}
                                    {isPredicted ? (
                                      <span className="account-badge account-badge-predicted" title={`${transaction.recurrence_type} prediction - ${(transaction.confidence * 100).toFixed(0)}% confidence. Click to see details.`}>
                                        Predicted
                                      </span>
                                    ) : (
                                      <span className={`account-badge account-badge-${transaction.account.toLowerCase().replace(/ /g, '-')}`}>
                                        {transaction.account}
                                      </span>
                                    )}
                                  </div>
                                  <div className="transaction-details">
                                    <div className="transaction-recipient">
                                      {transaction.recipient}
                                    </div>
                                    {isPredicted ? (
                                      <div className="transaction-description" style={{ color: '#6b7eff', fontSize: '12px' }}>
                                        Predicted based on {transaction.based_on?.length || 0} past payment{(transaction.based_on?.length || 0) !== 1 ? 's' : ''}
                                      </div>
                                    ) : transaction.description ? (
                                      <div className="transaction-description">
                                        {transaction.description}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="transaction-actions">
                                    {isPredicted ? (
                                      <button
                                        className="dismiss-prediction-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDismissPrediction(transaction);
                                        }}
                                        title="Dismiss prediction"
                                      >
                                        <i className="fa-solid fa-xmark"></i>
                                      </button>
                                    ) : (
                                      <button
                                        className={`category-edit-btn ${
                                          categoryEditModal && 
                                          getTransactionKey(categoryEditModal.transaction) === getTransactionKey(transaction)
                                          ? 'active' : ''
                                        }`}
                                        onClick={() => handleCategoryEdit(transaction, month.month, category)}
                                        disabled={isLocked}
                                        title="Change category"
                                      >
                                        <i className="fa-solid fa-pen-to-square"></i>
                                      </button>
                                    )}
                                  </div>
                                  <div className="transaction-amount">
                                    -{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
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
                
                {/* Section Total - At bottom, always visible (informational only) */}
                <div 
                  className="category-item category-total-row" 
                  style={{ 
                    marginTop: '12px', 
                    paddingTop: '12px',
                    fontWeight: '600',
                    borderRadius: '0 0 8px 8px'
                  }}>
                  <div style={{ flex: 1 }}>
                    <div className="category-name" style={{ fontWeight: '600' }}>
                      {title.includes('(Essential)') ? 'Total Essential' : 'Total Non-Essential'}
                    </div>
                    {title.includes('(Essential)') && isCurrentMonth && predictedAmount > 0 && (
                      <div className="category-bar" style={{ marginTop: '8px' }}>
                        <div
                          className="category-bar-fill bar-essential"
                          style={{ 
                            width: `${Math.min((totalAmount / predictedAmount) * 100, 100)}%`,
                            transition: 'width 0.3s ease'
                          }}
                          title={`${((totalAmount / predictedAmount) * 100).toFixed(0)}% of predicted`}
                        />
                      </div>
                    )}
                  </div>
                  <div className="category-amount" style={{ fontWeight: '700', fontSize: '16px' }}>
                    {formatCurrency(totalAmount, primaryCurrency)}
                    {title.includes('(Essential)') && isCurrentMonth && predictedAmount > 0 && (
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '400', 
                        color: 'var(--color-text-tertiary)',
                        marginLeft: '8px'
                      }}>
                        ({formatCurrency(predictedAmount, primaryCurrency)} avg)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        };

        return (
          <>
            {renderCategorySection(essentialCats, 'Spending by Category (Essential)', 'bar-essential')}
            {renderCategorySection(nonEssentialCats, 'Spending by Category (Non-Essential)', 'bar-non-essential')}
          </>
        );
      })()}

      {month.internal_transfers && (
        <div className="categories-section">
          <h3 className="categories-title">Internal Transfers</h3>
          <div className="category-list">
            <div>
              <div
                className="category-item category-item-transfer"
                onClick={() => toggleCategory(month.month, 'internal-transfers')}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <div className="category-name">
                    <span className="expand-arrow">
                      {expandedCategories[`${month.month}-internal-transfers`] ? '▼' : '▶'}
                    </span>
                    Between Accounts
                    <span className="transaction-count">
                      ({month.internal_transfers.transactions.length})
                    </span>
                  </div>
                </div>
                <div className="category-amount category-amount-transfer">
                  {formatCurrency(month.internal_transfers.total, primaryCurrency)}
                </div>
              </div>

              {expandedCategories[`${month.month}-internal-transfers`] && (
                <div className="transaction-list-wrapper">
                  <div className="transaction-list-header">
                    <button
                      className="sort-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSort(month.month, 'internal-transfers');
                      }}
                    >
                      Sort by: {(categorySorts[`${month.month}-internal-transfers`] || 'amount') === 'amount' ? 'Amount' : 'Date'}
                    </button>
                  </div>
                  <div className="transaction-list">
                    {getSortedTransactions(month.internal_transfers.transactions, month.month, 'internal-transfers').map((transaction, idx) => (
                      <div key={idx} className="transaction-item">
                        <div className="transaction-date">
                          {formatDate(transaction.date)}
                          <span className={`account-badge account-badge-${transaction.account.toLowerCase().replace(/ /g, '-')}`}>
                            {transaction.account}
                          </span>
                        </div>
                        <div className="transaction-details">
                          <div className="transaction-recipient">
                            {transaction.recipient}
                          </div>
                          {transaction.description && (
                            <div className="transaction-description">
                              {transaction.description}
                            </div>
                          )}
                        </div>
                        <div className="transaction-amount transaction-amount-transfer">
                          {transaction.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Category Edit Modal Component
const CategoryEditModal = ({ modal, onClose, onUpdate, formatCurrency, isClosing, sessionToken }) => {
  const [availableCategories, setAvailableCategories] = useState([]);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      
      const response = await fetch('http://localhost:5001/api/categories', { headers });
      if (response.status === 401) {
        // Note: handleAuthFailure is not available in CategoryEditModal scope
        // But this will be caught by the parent component's auth check
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        return;
      }
      const wrappedData = await response.json();
      const data = wrappedData.data || wrappedData;

      if (modal) {
        const categories = modal.isIncome ? data.income : data.expense;
        // Ensure categories is always an array, fallback to default if undefined
        if (Array.isArray(categories) && categories.length > 0) {
          setAvailableCategories(categories);
        } else {
          // Use default categories if the API response is invalid
          const defaultCategories = modal.isIncome
            ? ['Salary', 'Income', 'Other']
            : ['Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport', 'Subscriptions', 'Loan Payment', 'Rent', 'Insurance', 'Transfer', 'Other'];
          setAvailableCategories(defaultCategories);
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to default categories
      const defaultCategories = modal?.isIncome
        ? ['Salary', 'Income', 'Other']
        : ['Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport', 'Subscriptions', 'Loan Payment', 'Rent', 'Insurance', 'Transfer', 'Other'];
      setAvailableCategories(defaultCategories);
    }
  }, [modal, sessionToken]);

  useEffect(() => {
    if (modal) {
      setShowCustomInput(false);
      setCustomCategoryName('');
      fetchCategories();
    }
  }, [modal, fetchCategories]);

  const handleCreateCustomCategory = async () => {
    if (!customCategoryName.trim()) return;
    
    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      
      const response = await fetch('http://localhost:5001/api/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: customCategoryName.trim(),
          type: modal.isIncome ? 'income' : 'expense'
        }),
      });

      if (response.status === 401) {
        // Note: handleAuthFailure is not available in CategoryEditModal scope
        // But this will be caught by the parent component's auth check
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        return;
      }

      if (response.ok) {
        // Add the new category to the list
        setAvailableCategories(prev => [...prev, customCategoryName.trim()]);
        setCustomCategoryName('');
        setShowCustomInput(false);
      } else {
        const errorData = await response.json();
        console.error('Category creation failed:', response.status, errorData);
        alert(errorData.error || 'Failed to create category');
      }
    } catch (error) {
      console.error('Error creating custom category:', error);
      alert('Failed to create custom category: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!modal) return null;

  const { transaction, currentCategory, isIncome } = modal;
  
  const currentCategoryName = isIncome 
    ? currentCategory.replace('income-', '')
    : currentCategory;

  const overlayClassName = `modal-overlay ${isClosing ? 'closing' : 'open'}`;
  const contentClassName = `modal-content ${isClosing ? 'closing' : 'open'}`;

  return (
    <div className={overlayClassName} onClick={onClose}>
      <div className={contentClassName} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Change Category</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="transaction-preview">
            <div className="transaction-preview-item">
              <strong>Date:</strong> {new Date(transaction.date).toLocaleDateString()}
            </div>
            <div className="transaction-preview-item">
              <strong>Recipient:</strong> {transaction.recipient}
            </div>
            {transaction.description && (
              <div className="transaction-preview-item">
                <strong>Description:</strong> {transaction.description}
              </div>
            )}
            <div className="transaction-preview-item">
              <strong>Amount:</strong> {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
            </div>
            <div className="transaction-preview-item">
              <strong>Current Category:</strong> {currentCategoryName}
            </div>
          </div>

          <div className="category-selection">
            <h4>Select New Category:</h4>
            <div className="category-grid">
              {(availableCategories || []).map((category) => (
                <button
                  key={category}
                  className={`category-option ${category === currentCategoryName ? 'selected' : ''}`}
                  onClick={() => onUpdate(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            
            <div className="custom-category-section">
              {!showCustomInput ? (
                <button
                  className="create-category-btn"
                  onClick={() => setShowCustomInput(true)}
                >
                  + Create New Category
                </button>
              ) : (
                <div className="custom-category-input">
                  <input
                    type="text"
                    placeholder="Enter category name"
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateCustomCategory()}
                    className="category-input"
                    autoFocus
                  />
                  <div className="custom-category-actions">
                    <button
                      className="save-category-btn"
                      onClick={handleCreateCustomCategory}
                      disabled={!customCategoryName.trim() || loading}
                    >
                      {loading ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      className="cancel-category-btn"
                      onClick={() => {
                        setShowCustomInput(false);
                        setCustomCategoryName('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wealth Projection Calculator Component
// Login/Register Component
const LoginPage = ({ onLogin }) => {
  const [mode, setMode] = useState('login'); // 'login', 'register', 'reset', 'reset-confirm'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'login') {
      const result = await onLogin(email, password);
      if (!result.success) {
        setError(result.error || 'Login failed');
        setLoading(false);
      }
    } else if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        setLoading(false);
        return;
      }
      
      try {
        const response = await fetch('http://localhost:5001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          setSuccess('Registration successful! Please check your email to verify your account.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
          setName('');
        } else {
          // Show the actual error message from the backend
          const errorMsg = data.error || 'Registration failed. Please try again.';
          console.error('Registration error:', errorMsg, data);
          setError(errorMsg);
        }
      } catch (error) {
        console.error('Registration network error:', error);
        setError('Network error. Please try again.');
      }
      setLoading(false);
    } else if (mode === 'reset') {
      try {
        const response = await fetch('http://localhost:5001/api/auth/request-password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          setSuccess('Password reset instructions sent! Check your email.');
          setTimeout(() => setMode('login'), 3000);
        } else {
          setError(data.error || 'Failed to send reset email');
        }
      } catch (error) {
        setError('Network error. Please try again.');
      }
      setLoading(false);
    }
  };

  const getModeTitle = () => {
    switch (mode) {
      case 'register': return 'Create Account';
      case 'reset': return 'Reset Password';
      default: return 'Welcome Back';
    }
  };

  const getModeSubtitle = () => {
    switch (mode) {
      case 'register': return 'Sign up to start tracking your wealth';
      case 'reset': return 'Enter your email to reset your password';
      default: return 'Sign in to your account';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        padding: '3rem',
        borderRadius: '0',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '440px'
      }}>
        <div style={{
          borderBottom: '2px solid #1a1a1a',
          paddingBottom: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '600',
            marginBottom: '0.5rem',
            color: '#1a1a1a',
            textAlign: 'center',
            letterSpacing: '-0.02em'
          }}>Wealth Manager</h1>
          <p style={{
            color: '#64748b',
            textAlign: 'center',
            marginBottom: '0',
            fontSize: '0.95rem'
          }}>{getModeSubtitle()}</p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: '#fafafa',
              color: '#1a1a1a',
              padding: '1rem',
              borderRadius: '0',
              border: '2px solid #1a1a1a',
              borderLeft: '4px solid #1a1a1a',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              background: '#fafafa',
              color: '#1a1a1a',
              padding: '1rem',
              borderRadius: '0',
              border: '2px solid #1a1a1a',
              borderLeft: '4px solid #1a1a1a',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  color: '#1a1a1a'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1a1a1a';
                  e.target.style.boxShadow = '0 0 0 1px #1a1a1a';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
                required
                disabled={loading}
              />
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: '600',
              color: '#1a1a1a',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: '0',
                fontSize: '1rem',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box',
                background: '#ffffff',
                color: '#1a1a1a'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1a1a1a';
                e.target.style.boxShadow = '0 0 0 1px #1a1a1a';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.boxShadow = 'none';
              }}
              required
              disabled={loading}
            />
          </div>

          {mode !== 'reset' && (
            <div style={{ marginBottom: mode === 'login' ? '0.75rem' : '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  color: '#1a1a1a'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1a1a1a';
                  e.target.style.boxShadow = '0 0 0 1px #1a1a1a';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'register' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  color: '#1a1a1a'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1a1a1a';
                  e.target.style.boxShadow = '0 0 0 1px #1a1a1a';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  fontWeight: '500',
                  padding: '0'
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = '#1a1a1a';
                  e.target.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#64748b';
                  e.target.style.textDecoration = 'none';
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#d1d5db' : '#1a1a1a',
              color: loading ? '#64748b' : '#ffffff',
              padding: '1rem',
              borderRadius: '0',
              fontSize: '0.875rem',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginBottom: '1.5rem',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = '#000000')}
            onMouseLeave={(e) => !loading && (e.target.style.background = '#1a1a1a')}
          >
            {loading ? 
              (mode === 'register' ? 'Creating account...' : mode === 'reset' ? 'Sending...' : 'Signing in...') : 
              (mode === 'register' ? 'Create Account' : mode === 'reset' ? 'Send Reset Link' : 'Sign In')}
          </button>
        </form>

        <div style={{ 
          textAlign: 'center',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          {mode === 'login' && (
            <>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: '600',
                    padding: '0'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  Sign up
                </button>
              </p>
              <p style={{ 
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontFamily: 'monospace',
                background: '#fafafa',
                padding: '0.5rem',
                border: '1px solid #e5e7eb'
              }}>
                Demo: <strong style={{color: '#1a1a1a'}}>demo@demo / demo</strong>
              </p>
            </>
          )}
          {(mode === 'register' || mode === 'reset') && (
            <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1a1a1a',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontWeight: '600',
                  padding: '0'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.7'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                ← Back to login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Onboarding Component for new users
const OnboardingComponent = ({ onUploadComplete, onDocumentUpload }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState([]); // Array of status objects for each file
  const [bankType, setBankType] = useState('auto');
  const [uploadsComplete, setUploadsComplete] = useState(false);
  const fileInputRef = useRef(null);

  const inferDocumentType = useCallback((fileName, selectedBankType) => {
    if (selectedBankType === 'dkb') return 'bank_statement_dkb';
    if (selectedBankType === 'yuh') return 'bank_statement_yuh';
    const lower = (fileName || '').toLowerCase();
    if (lower.includes('yuh')) return 'bank_statement_yuh';
    return 'bank_statement_dkb';
  }, []);

  // Debug: Log status changes
  useEffect(() => {
    if (uploadStatuses.length > 0) {
      console.log('🔄 uploadStatuses changed:', uploadStatuses);
      console.log('🔄 Counts:', {
        success: uploadStatuses.filter(s => s.type === 'success').length,
        error: uploadStatuses.filter(s => s.type === 'error').length,
        uploading: uploadStatuses.filter(s => s.type === 'uploading').length
      });
    }
  }, [uploadStatuses]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleMultipleUploads(files);
    }
  };

  const uploadSingleFile = async (file, index, documentType = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bankType', bankType);
    // If documentType is provided, use it; otherwise fall back to bankType-based inference
    if (documentType) {
      formData.append('documentType', documentType);
    }
    
    // Generate unique upload ID for progress tracking
    const uploadId = `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
    formData.append('uploadId', uploadId);

    const token = localStorage.getItem('sessionToken');
    
    // Calculate file size and estimated transactions once (used for both progress and timeout)
    const fileSizeMB = file.size / (1024 * 1024);
    const estimatedTransactions = Math.max(10, Math.floor(fileSizeMB * 100));
    const processingTimePerTransaction = estimatedTransactions > 500 ? 50 : 30;
    
    // Use XMLHttpRequest for upload progress tracking
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      let processingStartTime = null;
      let processingInterval = null;
      let progressPollInterval = null;

      // Track upload progress - Phase 1: Upload (0-100%)
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const uploadProgress = Math.round((e.loaded / e.total) * 100); // Upload phase is 0-100%
          setUploadStatuses(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              uploadProgress: uploadProgress,
              type: 'uploading',
              phase: 'upload',
              message: `Uploading... ${uploadProgress}%`
            };
            return updated;
          });
        }
      });

      // When upload completes, start Phase 2: Processing (0-100%)
      xhr.upload.addEventListener('load', () => {
        processingStartTime = Date.now();
        
        setUploadStatuses(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            uploadProgress: 100, // Upload is complete
            processingProgress: 0,
            type: 'uploading',
            phase: 'processing',
            message: 'Processing transactions...'
          };
          return updated;
        });
        
        // Poll backend for actual progress
        const pollProgress = async () => {
          try {
            console.log(`🔄 Polling progress for ${file.name} (uploadId: ${uploadId})`);
            const response = await fetch(`http://localhost:5001/api/upload-progress/${uploadId}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (response.ok) {
              const responseData = await response.json();
              console.log(`📊 Progress response for ${file.name}:`, responseData);
              
              // Handle signed response format from authenticate_request decorator
              // Response structure: { data: {...}, signature: "...", timestamp: "..." }
              let data = responseData;
              if (responseData.data) {
                data = responseData.data;
              }
              
              console.log(`📊 Progress data for ${file.name}:`, data);
              if (data.success) {
                const progressPercent = data.progress_percent || 0;
                const processed = data.processed || 0;
                const total = data.total || 0;
                
                console.log(`📈 Updating progress: ${processed}/${total} (${progressPercent}%)`);
                
                setUploadStatuses(prev => {
                  const updated = [...prev];
                  if (updated[index] && updated[index].type === 'uploading') {
                    updated[index] = {
                      ...updated[index],
                      processingProgress: Math.min(progressPercent, 99),
                      phase: 'processing',
                      message: `Processing ${processed}/${total} transactions... ${progressPercent}%`
                    };
                  }
                  return updated;
                });
                
                // Continue polling if not complete
                if (data.status !== 'complete' && data.status !== 'error') {
                  console.log(`⏭️ Continuing to poll (status: ${data.status})`);
                  progressPollInterval = setTimeout(pollProgress, 500); // Poll every 500ms
                } else {
                  // Processing complete, stop polling and update final progress
                  console.log(`✅ Processing complete (status: ${data.status}), stopping polls`);
                  if (progressPollInterval) {
                    clearTimeout(progressPollInterval);
                    progressPollInterval = null;
                  }
                  // Update final progress to 100% and mark as success when processing is complete
                  if (data.status === 'complete') {
                    setUploadStatuses(prev => {
                      const updated = [...prev];
                      if (updated[index]) {
                        const imported = data.imported || data.processed || 0;
                        const total = data.total || 0;
                        updated[index] = {
                          ...updated[index],
                          type: 'success', // Now mark as success - processing is complete
                          processingProgress: 100,
                          phase: 'complete',
                          message: `Successfully imported ${imported} transactions!`,
                          imported: imported,
                          skipped: data.skipped || 0,
                          uploadProgress: 100,
                          progress: 100
                        };
                      }
                      return updated;
                    });
                  }
                }
              } else {
                console.warn(`⚠️ Progress response not successful for ${file.name}:`, data);
                // Continue polling even if response indicates error (might be temporary)
                progressPollInterval = setTimeout(pollProgress, 1000);
              }
            } else {
              console.warn(`⚠️ Progress response not OK for ${file.name}: status ${response.status}`);
              // Continue polling even on error (might be temporary network issue)
              progressPollInterval = setTimeout(pollProgress, 1000);
            }
          } catch (error) {
            console.error(`❌ Error polling progress for ${file.name}:`, error);
            // Continue polling even on error (might be temporary network issue)
            progressPollInterval = setTimeout(pollProgress, 1000);
          }
        };
        
        // Start polling immediately
        console.log(`🚀 Starting progress polling for ${file.name} (uploadId: ${uploadId})`);
        progressPollInterval = setTimeout(pollProgress, 500);
      });

      // Add timeout to detect hanging uploads (dynamic based on file size)
      let timeout;
      
      xhr.addEventListener('load', () => {
        // Clear processing interval (not needed anymore since we're using real progress)
        if (processingInterval) {
          clearInterval(processingInterval);
          processingInterval = null;
        }
        
        // DON'T clear progress polling here - let it continue until backend reports complete
        // The polling will stop automatically when status === 'complete' in pollProgress function
        
        if (timeout) clearTimeout(timeout);
        console.log(`📥 Load event for ${file.name}: status=${xhr.status}, readyState=${xhr.readyState}`);
        try {
          const responseText = xhr.responseText;
          console.log(`Upload response for ${file.name} (status ${xhr.status}):`, responseText);
          
          // Handle empty responses
          if (!responseText || responseText.trim() === '') {
            console.error(`Empty response for ${file.name}`);
            setUploadStatuses(prev => {
              const updated = [...prev];
              if (updated[index]) {
                updated[index] = {
                  ...updated[index],
                  type: 'error',
                  message: 'Empty response from server',
                  progress: 100
                };
              }
              return updated;
            });
            resolve({
              index,
              fileName: file.name,
              type: 'error',
              message: 'Empty response from server',
              progress: 100
            });
            return;
          }
          
          const data = JSON.parse(responseText);
          
          // Handle signed response format from authenticate_request decorator
          // Response structure: { data: {...}, signature: "...", timestamp: "..." }
          let actualData = data;
          if (data.data) {
            actualData = data.data;
          }

          console.log(`Parsed data for ${file.name}:`, actualData);
          console.log(`Success check: status=${xhr.status}, actualData.success=${actualData.success}, actualData:`, JSON.stringify(actualData));

          // Check for success - handle both 200 and 400 status codes (400 might be returned for 0 transactions)
          const isSuccess = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 400 && actualData?.success === true);
          
          if (isSuccess && actualData && actualData.success === true) {
            // Don't mark as complete yet - processing might still be ongoing
            // Keep status as 'uploading' until processing is confirmed complete via polling
            let currentProcessingProgress = 0;
            setUploadStatuses(prev => {
              const updated = [...prev];
              if (updated[index]) {
                currentProcessingProgress = updated[index].processingProgress || 0;
                updated[index] = {
                  ...updated[index],
                  uploadProgress: 100, // Upload is complete
                  // Keep processingProgress as is (will be updated by polling)
                  // Keep type as 'uploading' until processing is complete
                  phase: 'processing',
                  message: 'Processing transactions...',
                  imported: actualData.imported || 0,
                  skipped: actualData.skipped || 0,
                  importResult: actualData
                };
              }
              return updated;
            });
            
            // Create result object for resolve, but don't mark as success yet
            const result = {
              index,
              fileName: file.name,
              type: 'uploading', // Keep as uploading until processing completes
              message: 'Processing transactions...',
              imported: actualData.imported || 0,
              skipped: actualData.skipped || 0,
              uploadProgress: 100,
              processingProgress: currentProcessingProgress,
              progress: 50, // Only 50% complete (upload done, processing ongoing)
              importResult: actualData
            };
            console.log(`✅ Upload complete for ${file.name}, processing ongoing...`, result);

            if (typeof onDocumentUpload === 'function') {
              // Use the detected bank type from the backend response
              const detectedType = actualData.detected_bank_type || bankType;
              const docTypeKey = detectedType === 'yuh' ? 'bank_statement_yuh' : 
                                detectedType === 'dkb' ? 'bank_statement_dkb' : 
                                inferDocumentType(file.name, bankType);
              console.log(`📄 Saving document as type: ${docTypeKey} (detected: ${detectedType})`);
              onDocumentUpload(
                docTypeKey,
                file,
                {
                  statementSummary: {
                    startDate: actualData.start_date,
                    endDate: actualData.end_date,
                    imported: actualData.imported,
                    skipped: actualData.skipped
                  }
                },
                null,
                { skipImport: true, importResult: actualData }
              ).catch(err => console.error('Failed to store document copy:', err));
            }
            
            resolve(result);
          } else {
            // Handle both error responses and responses with success: false
            const errorMsg = actualData?.error || actualData?.message || `Upload failed (status: ${xhr.status})`;
            console.error(`Upload failed for ${file.name}:`, errorMsg, actualData);
            
            const errorResult = {
              index,
              fileName: file.name,
              type: 'error',
              message: errorMsg,
              progress: 100,
              imported: actualData?.imported || 0,
              skipped: actualData?.skipped || 0
            };
            
            // Update status immediately
            setUploadStatuses(prev => {
              const updated = [...prev];
              if (updated[index]) {
                updated[index] = errorResult;
              }
              return updated;
            });
            
            resolve(errorResult);
          }
        } catch (error) {
          console.error(`Error parsing response for ${file.name}:`, error, xhr.responseText);
          const errorResult = {
            index,
            fileName: file.name,
            type: 'error',
            message: `Failed to parse response: ${error.message}`,
            progress: 100
          };
          
          // Update status immediately
          setUploadStatuses(prev => {
            const updated = [...prev];
            if (updated[index]) {
              updated[index] = errorResult;
            }
            return updated;
          });
          
          resolve(errorResult);
        }
      });

      xhr.addEventListener('error', () => {
        // Clear processing interval
        if (processingInterval) {
          clearInterval(processingInterval);
          processingInterval = null;
        }
        
        // Clear progress polling
        if (progressPollInterval) {
          clearTimeout(progressPollInterval);
          progressPollInterval = null;
        }
        
        if (timeout) clearTimeout(timeout);
        console.error(`❌ Network error for ${file.name}`);
        const errorResult = {
          index,
          fileName: file.name,
          type: 'error',
          message: 'Upload failed - network error',
          progress: 100
        };
        
        // Update status immediately
        setUploadStatuses(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = errorResult;
          }
          return updated;
        });
        
        resolve(errorResult);
      });

      xhr.addEventListener('abort', () => {
        // Clear processing interval
        if (processingInterval) {
          clearInterval(processingInterval);
          processingInterval = null;
        }
        
        // Clear progress polling
        if (progressPollInterval) {
          clearTimeout(progressPollInterval);
          progressPollInterval = null;
        }
        
        if (timeout) clearTimeout(timeout);
        console.error(`⏹️ Upload aborted for ${file.name}`);
        const errorResult = {
          index,
          fileName: file.name,
          type: 'error',
          message: 'Upload cancelled',
          progress: 100
        };
        
        // Update status immediately
        setUploadStatuses(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = errorResult;
          }
          return updated;
        });
        
        resolve(errorResult);
      });

      xhr.addEventListener('loadend', () => {
        console.log(`🏁 Loadend event for ${file.name}: status=${xhr.status}, readyState=${xhr.readyState}`);
        // If we reach loadend but status is still uploading, something went wrong
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 0) {
          console.error(`⚠️ Loadend with status 0 for ${file.name} - possible CORS or network issue`);
        }
      });

      xhr.open('POST', 'http://localhost:5001/api/upload-csv');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      
      // Calculate dynamic timeout based on file size
      // Base timeout: 30 seconds for upload + processing overhead
      // Add time based on file size: ~2 seconds per MB for upload + processing
      const estimatedProcessingTime = estimatedTransactions * processingTimePerTransaction;
      const uploadTimeEstimate = Math.max(5000, fileSizeMB * 2000); // 2 seconds per MB for upload
      const totalEstimatedTime = uploadTimeEstimate + estimatedProcessingTime;
      
      // Set timeout to 2x the estimated time, with minimum 2 minutes and maximum 10 minutes
      const timeoutDuration = Math.min(
        Math.max(120000, totalEstimatedTime * 2), // Min 2 minutes, 2x estimated time
        600000 // Max 10 minutes
      );
      
      console.log(`⏱️ Timeout for ${file.name}: ${Math.round(timeoutDuration / 1000)}s (file: ${fileSizeMB.toFixed(2)}MB, est. ${estimatedTransactions} transactions)`);
      
      // Start timeout timer (dynamic based on file size)
      timeout = setTimeout(() => {
        // Clear processing interval
        if (processingInterval) {
          clearInterval(processingInterval);
          processingInterval = null;
        }
        
        // Clear progress polling
        if (progressPollInterval) {
          clearTimeout(progressPollInterval);
          progressPollInterval = null;
        }
        
        // Only timeout if request hasn't completed
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          console.error(`⏰ Timeout for ${file.name} after ${Math.round(timeoutDuration / 1000)}s - upload took too long`);
          xhr.abort();
          const timeoutResult = {
            index,
            fileName: file.name,
            type: 'error',
            message: `Upload timeout after ${Math.round(timeoutDuration / 1000)}s - file may be too large. Please try uploading smaller files or contact support.`,
            progress: 100
          };
          
          setUploadStatuses(prev => {
            const updated = [...prev];
            if (updated[index]) {
              updated[index] = timeoutResult;
            }
            return updated;
          });
          
          resolve(timeoutResult);
        } else {
          // Request completed but timeout fired - clear it
          console.log(`✅ Request completed for ${file.name} before timeout`);
        }
      }, timeoutDuration);
      
      xhr.send(formData);
    });
  };

  // Detect document type from file content (for onboarding automatic detection)
  const detectDocumentType = async (file) => {
    if (!file) return null;
    
    try {
      const token = localStorage.getItem('sessionToken');
      if (!token) {
        console.warn('No session token available for document type detection');
        return null;
      }
      
      const formData = new FormData();
      formData.append('file', file, file.name);
      
      const response = await fetch('http://localhost:5001/api/documents/detect-type', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (response.status === 401) {
        // Note: handleAuthFailure is not available in OnboardingComponent scope
        // But this will be caught by the parent component's auth check
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        return null;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error detecting document type:', errorData.error);
        return null;
      }
      
      const responseData = await response.json();
      const data = responseData.data || responseData;
      
      if (data.success && data.documentType) {
        return data.documentType;
      }
      
      return null;
    } catch (error) {
      console.error('Error detecting document type:', error);
      return null;
    }
  };

  const handleMultipleUploads = async (files) => {
    setUploading(true);
    setUploadStatuses([]);

    // Normalize filename for duplicate detection
    const normalizeFileName = (fileName) => {
      if (!fileName) return '';
      // Decode URL encoding
      try {
        fileName = decodeURIComponent(fileName);
      } catch (e) {
        // If decoding fails, use original
      }
      // Remove common browser-added suffixes like " 2", " (1)", " - Copy", etc.
      fileName = fileName.replace(/\s*[-_]?\s*(\(?\d+\)?|Copy|copy)\s*(?=\.[^.]+$)/i, '');
      // Normalize whitespace (multiple spaces to single space, trim)
      fileName = fileName.replace(/\s+/g, ' ').trim();
      // Convert to lowercase for case-insensitive comparison
      return fileName.toLowerCase();
    };

    const computeDocKey = (docName, docSize) => {
      if (!docName || docSize === undefined || docSize === null) {
        return null;
      }
      const normalizedName = normalizeFileName(docName);
      return `${normalizedName}::${Number(docSize)}`;
    };

    // Initialize status array with "uploading" status for each file
    const initialStatuses = files.map((file, index) => ({
      index,
      fileName: file.name,
      type: 'uploading',
      phase: 'detecting',
      message: 'Detecting document type...',
      uploadProgress: 0,
      processingProgress: 0
    }));
    setUploadStatuses(initialStatuses);

    try {
      // Step 1a: Check for duplicates within the current upload batch
      const batchSeenKeys = new Set();
      const batchSeenFiles = new Map();
      const batchDuplicates = [];
      const filesAfterBatchCheck = [];
      
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const fileKey = computeDocKey(file.name, file.size);
        
        if (!fileKey) {
          // File without valid key, skip duplicate check but still process
          filesAfterBatchCheck.push({ file, index });
          continue;
        }
        
        if (batchSeenKeys.has(fileKey)) {
          // This file is a duplicate within the current batch
          const originalIndex = batchSeenFiles.get(fileKey);
          batchDuplicates.push({ file, index, originalIndex });
        } else {
          // First occurrence of this file
          batchSeenKeys.add(fileKey);
          batchSeenFiles.set(fileKey, index);
          filesAfterBatchCheck.push({ file, index });
        }
      }

      // Remove duplicates from batch (keep only first occurrence)
      if (batchDuplicates.length > 0) {
        const duplicateIndices = new Set(batchDuplicates.map(d => d.index));
        const filesToProcess = filesAfterBatchCheck.filter(({ index }) => !duplicateIndices.has(index));
        
        // Update statuses for duplicates
        setUploadStatuses(prev => prev.map((status, idx) => {
          if (duplicateIndices.has(idx)) {
            return {
              ...status,
              type: 'error',
              message: `Duplicate file (already in upload batch)`,
              uploadProgress: 100,
              processingProgress: 100
            };
          }
          return status;
        }));
        
        // Continue with non-duplicate files
        if (filesToProcess.length === 0) {
          setUploading(false);
          return;
        }
        filesAfterBatchCheck.splice(0, filesAfterBatchCheck.length, ...filesToProcess);
      }

      // Step 1b: Detect document types for all remaining files in parallel
      const detectionResults = await Promise.all(
        filesAfterBatchCheck.map(async ({ file, index }) => {
          const detectedType = await detectDocumentType(file);
          // Fallback to bankType-based detection if automatic detection fails
          const finalType = detectedType || inferDocumentType(file.name, bankType);
          return { file, index, detectedType: finalType };
        })
      );

      // Update statuses to show detection complete
      setUploadStatuses(prev => prev.map((status, idx) => {
        // Skip if this was a duplicate
        if (status.type === 'error' && status.message.includes('Duplicate')) {
          return status;
        }
        return {
          ...status,
          phase: 'upload',
          message: 'Preparing upload...'
        };
      }));

      // Step 2: Upload all files to their detected categories (no category mismatch checks)
      // Use the same upload mechanism as DocumentsPage with progress callbacks
      const uploadPromises = detectionResults.map(async ({ file, index, detectedType }) => {
        // Create progress callback for this file (similar to DocumentsPage)
        const PROGRESS_THROTTLE_MS = 100;
        let lastProgressUpdate = 0;
        
        const emitProgress = (phase, progress, message, extra = {}) => {
          const now = Date.now();
          const shouldUpdate = (now - lastProgressUpdate) >= PROGRESS_THROTTLE_MS || 
                                progress === 100 || 
                                progress === 0 ||
                                phase === 'processing';
          
          if (!shouldUpdate && progress !== 100 && progress !== 0) {
            return;
          }
          
          lastProgressUpdate = now;
          
          setUploadStatuses(prev => {
            const updated = [...prev];
            if (updated[index]) {
              const clamped = Math.max(0, Math.min(progress ?? 0, 100));
              if (phase === 'upload') {
                updated[index] = {
                  ...updated[index],
                  uploadProgress: clamped,
                  message: message || updated[index].message,
                  phase: 'upload',
                  ...extra
                };
              } else if (phase === 'processing') {
                updated[index] = {
                  ...updated[index],
                  processingProgress: clamped,
                  message: message || updated[index].message,
                  phase: 'processing',
                  ...extra
                };
                // Mark as success only when processing reaches 100%
                if (clamped === 100) {
                  updated[index] = {
                    ...updated[index],
                    type: 'success',
                    phase: 'complete'
                  };
                }
              }
            }
            return updated;
          });
        };
        
        try {
          // Track if processing completed via progress callback
          let processingCompleted = false;
          
          // Wrap emitProgress to track when processing completes
          const originalEmitProgress = emitProgress;
          const wrappedEmitProgress = (phase, progress, message, extra = {}) => {
            originalEmitProgress(phase, progress, message, extra);
            // Track when processing reaches 100%
            if (phase === 'processing' && progress === 100) {
              processingCompleted = true;
            }
          };
          
          // Use onDocumentUpload with progress callback (same as DocumentsPage)
          await onDocumentUpload(detectedType, file, {}, wrappedEmitProgress, { skipDataFetch: true });
          
          // Don't mark as success here - let the progress callback handle it
          // The progress callback will mark as success when processingProgress reaches 100%
          // Return uploading status - the completion check will wait for processing to complete
          return {
            index,
            fileName: file.name,
            type: 'uploading', // Keep as uploading until processing completes via progress callback
            uploadProgress: 100,
            processingProgress: processingCompleted ? 100 : 0
          };
        } catch (error) {
          console.error(`Upload failed for ${file.name}:`, error);
          setUploadStatuses(prev => {
            const updated = [...prev];
            if (updated[index]) {
              updated[index] = {
                ...updated[index],
                type: 'error',
                message: error.message || 'Upload failed',
                uploadProgress: 100,
                processingProgress: 100
              };
            }
            return updated;
          });
          
          return {
            index,
            fileName: file.name,
            type: 'error',
            message: error.message || 'Upload failed',
            uploadProgress: 100,
            processingProgress: 100
          };
        }
      });
      
      // Don't wait for all uploads to complete - let them update statuses in real-time
      // Instead, set up a periodic check to see when all are done
      Promise.allSettled(uploadPromises).then(() => {
        // All uploads have settled (completed or failed)
        // Check statuses after a brief delay to ensure all state updates have propagated
        // Set up a periodic check to see when all uploads are fully processed
        // A file is considered complete only when it's fully processed, not just uploaded
        const checkCompletion = () => {
          setUploadStatuses(currentStatuses => {
            // Only count as success if type is 'success' AND processingProgress is 100
            // Files with processingProgress < 100 are still processing, even if type is 'success'
            const successCount = currentStatuses.filter(s => 
              s.type === 'success' && s.processingProgress === 100
            ).length;
            const errorCount = currentStatuses.filter(s => 
              s.type === 'error' && 
              (s.processingProgress === 100 || s.processingProgress === undefined) &&
              !s.message?.includes('Duplicate')
            ).length;
            const uploadingCount = currentStatuses.filter(s => {
              // Count as uploading if:
              // 1. Type is explicitly 'uploading'
              // 2. Type is 'success' but processingProgress is not 100 (shouldn't happen, but be safe)
              return s.type === 'uploading' || 
                     (s.type === 'success' && s.processingProgress !== 100 && s.processingProgress !== undefined);
            }).length;
            
            console.log('📊 Status check:', {
              total: currentStatuses.length,
              success: successCount,
              error: errorCount,
              uploading: uploadingCount,
              details: currentStatuses.map(s => ({
                fileName: s.fileName,
                type: s.type,
                uploadProgress: s.uploadProgress,
                processingProgress: s.processingProgress,
                phase: s.phase
              }))
            });
            
            // Only mark as complete if ALL files are fully processed (not just uploaded)
            // A file is fully processed when:
            // - type is 'success' (which means processing is complete)
            // - type is 'error' AND it's a real error (not still processing)
            // Files with type 'uploading' are still being processed
            const allProcessed = currentStatuses.every(s => {
              // If still uploading, not processed
              if (s.type === 'uploading') return false;
              // Success means fully processed
              if (s.type === 'success') return true;
              // Error means failed/processed (including duplicates - they're considered processed/failed)
              if (s.type === 'error') return true;
              return false;
            });
            
            if (allProcessed && uploadingCount === 0) {
      setUploading(false);
              
              const totalImported = currentStatuses.reduce((sum, s) => sum + (s.imported || 0), 0);
              const allSuccessful = currentStatuses.every(s => 
                s.type === 'success' && 
                (s.processingProgress === 100 || s.processingProgress === undefined)
              );
      
      if (allSuccessful && totalImported > 0) {
                console.log('✅ All uploads and processing complete, showing finish button...');
        setTimeout(() => {
          setUploadsComplete(true);
        }, 100);
      } else {
        console.log('⚠️ Some uploads failed or no transactions imported');
      }
            } else {
              // Still processing - check again in 1 second
              console.log(`⏳ Still processing: ${uploadingCount} file(s) in progress`);
              setTimeout(checkCompletion, 1000);
            }
            
            return currentStatuses;
          });
        };
        
        // Start checking after a brief delay to allow initial status updates
        setTimeout(checkCompletion, 1000);
      }).catch(error => {
        console.error('Error in upload promises:', error);
        setUploading(false);
      });
    } catch (error) {
      console.error('Batch upload error:', error);
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.csv') || name.endsWith('.pdf');
    });
    if (files.length > 0) {
      handleMultipleUploads(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Calculate overall progress (combines upload and processing phases)
  const overallProgress = uploadStatuses.length > 0
    ? Math.round(
        uploadStatuses.reduce((sum, status) => {
          if (status.type === 'success' || status.type === 'error') {
            return sum + 100; // Completed (success or error) counts as 100%
          }
          // For uploading: combine upload (0-50%) and processing (50-100%)
          const uploadProgress = (status.uploadProgress || 0) * 0.5; // Upload contributes 0-50%
          const processingProgress = (status.processingProgress || 0) * 0.5; // Processing contributes 50-100%
          return sum + uploadProgress + processingProgress;
        }, 0) / uploadStatuses.length
      )
    : 0;

  // Only count as succeeded if processing is actually 100% complete
  const completedCount = uploadStatuses.filter(s => s.type === 'success' && s.processingProgress === 100).length;
  // Count as failed if status is 'error' (including duplicates)
  // Files with type 'uploading' should never be counted as failed
  const failedCount = uploadStatuses.filter(s => {
    // Don't count if still uploading
    if (s.type === 'uploading') return false;
    // Count all errors as failed, including duplicates
    return s.type === 'error';
  }).length;
  // Count files that are still in progress (uploading or processing)
  const inProgressCount = uploadStatuses.filter(s => {
    // Count as in progress if:
    // 1. Type is 'uploading'
    // 2. Type is 'success' but processingProgress is not 100 (shouldn't happen, but be safe)
    return s.type === 'uploading' || 
           (s.type === 'success' && s.processingProgress !== 100 && s.processingProgress !== undefined);
  }).length;

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        <div className="onboarding-header">
          <h2>Welcome to Wealth Tracker</h2>
          <p>Get started by uploading your bank statements</p>
        </div>

        <div className="onboarding-upload-section">
          <div 
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #e5e7eb',
              borderRadius: '8px',
              padding: '60px 40px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: uploading ? '#f9fafb' : '#ffffff',
              transition: 'all 0.3s',
              opacity: uploading ? 0.6 : 1
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.CSV,.pdf,.PDF"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {uploading || uploadStatuses.length > 0 ? (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  {uploading ? '⏳' : uploadsComplete ? '✓' : completedCount > 0 ? '✓' : '📁'}
                </div>
                <p style={{ fontSize: '18px', color: '#1f2937', fontWeight: '600' }}>
                  {uploading 
                    ? `Uploading ${uploadStatuses.length} file${uploadStatuses.length !== 1 ? 's' : ''}...`
                    : uploadsComplete 
                      ? 'Uploads Complete'
                      : `${completedCount} file${completedCount !== 1 ? 's' : ''} uploaded successfully`
                  }
                </p>
                {/* Overall Progress Bar */}
                {uploadStatuses.length > 0 && (
                  <div style={{ marginTop: '20px', width: '100%', maxWidth: '400px', margin: '20px auto 0' }}>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${overallProgress}%`,
                        height: '100%',
                        backgroundColor: '#1f2937',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
                      {overallProgress}% complete ({completedCount} succeeded{inProgressCount > 0 ? `, ${inProgressCount} in progress` : ''}{failedCount > 0 ? `, ${failedCount} failed` : ''})
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
                <p style={{ fontSize: '18px', color: '#1f2937', fontWeight: '600', marginBottom: '8px' }}>
                  Click to upload or drag and drop
                </p>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                  Supports bank statements, broker reports, and loan documents (CSV and PDF)
                </p>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
                  You can select multiple files at once
                </p>
              </div>
            )}
          </div>

          <div className="bank-type-selector" style={{ marginTop: '24px', textAlign: 'center' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Bank Type (optional - auto-detected if not specified):
            </label>
            <select
              value={bankType}
              onChange={(e) => setBankType(e.target.value)}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                backgroundColor: 'white',
                color: '#1f2937',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="auto">Auto-detect</option>
              <option value="yuh">YUH (Swiss)</option>
              <option value="dkb">DKB (German)</option>
            </select>
          </div>

          {uploadStatuses.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              {uploadStatuses.map((status, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: status.type === 'success' ? '#f9fafb' : status.type === 'error' ? '#fef2f2' : '#ffffff',
                    border: `1px solid ${
                      status.type === 'success' ? '#d1d5db' : 
                      status.type === 'error' ? '#fca5a5' : 
                      '#e5e7eb'
                    }`,
                    color: status.type === 'success' ? '#1f2937' : status.type === 'error' ? '#991b1b' : '#6b7280'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', flex: 1 }}>
                      {status.type === 'uploading' && '⏳ '}
                      {status.type === 'success' && '✅ '}
                      {status.type === 'error' && '❌ '}
                      {status.fileName}
                    </p>
                  </div>
                  
                  {/* Upload Progress Bar */}
                  {status.type === 'uploading' && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          📤 Upload
                        </span>
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>
                          {status.uploadProgress || 0}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${status.uploadProgress || 0}%`,
                          height: '100%',
                          backgroundColor: '#6b7280',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                  
                  {/* Processing Progress Bar */}
                  {status.type === 'uploading' && status.phase === 'processing' && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#1f2937',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          ⚙️ Processing
                        </span>
                        <span style={{ fontSize: '11px', color: '#1f2937', fontWeight: '500' }}>
                          {status.processingProgress || 0}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${status.processingProgress || 0}%`,
                          height: '100%',
                          backgroundColor: '#1f2937',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                  
                  {status.type !== 'uploading' && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                      {status.message}
                      {status.type === 'success' && status.imported > 0 && (
                        <span style={{ display: 'block', marginTop: '4px' }}>
                          Imported: {status.imported} transactions
                          {status.skipped > 0 && ` | Skipped: ${status.skipped} duplicates`}
                        </span>
                      )}
                    </p>
                  )}
                  
                  {/* Show phase message for uploading files */}
                  {status.type === 'uploading' && status.message && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      {status.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {uploadsComplete && (
            <div style={{ marginTop: '32px', textAlign: 'center' }}>
              <div style={{
                padding: '24px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                  Setup Complete
                </h3>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0' }}>
                  Your transactions have been imported successfully. Click the button below to start using Wealth Tracker.
                </p>
              </div>
              <button
                onClick={async () => {
                  console.log('🚀 Finish setup clicked, refreshing data...');
                  if (onUploadComplete) {
                    await onUploadComplete();
                  }
                }}
                style={{
                  padding: '14px 32px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#111827';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#1f2937';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Finish Setup →
              </button>
            </div>
          )}

          <div className="onboarding-info" style={{ marginTop: '32px', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#1f2937' }}>How to get your bank statements:</h3>
            <ul style={{ textAlign: 'left', fontSize: '14px', color: '#6b7280', lineHeight: '1.8', paddingLeft: '20px' }}>
              <li><strong>YUH:</strong> Export your transactions as CSV from the YUH app or website</li>
              <li><strong>DKB:</strong> Download your DKB bank statement as CSV from the DKB online banking portal</li>
              <li>You can upload multiple files at once - duplicate transactions will be automatically skipped</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const WealthProjectionCalculator = ({ projectionData, formatCurrency }) => {
  const [timeframe, setTimeframe] = useState(10); // years
  const [interestRate, setInterestRate] = useState(5.0); // annual interest rate %
  const [customMonthlySavings, setCustomMonthlySavings] = useState(null); // null = use actual savings
  
  // Calculate projections
  const calculateProjections = () => {
    const annualInterestRate = interestRate / 100;
    const monthlyInterestRate = annualInterestRate / 12;
    const months = timeframe * 12;
    
    // Use custom monthly savings if set, otherwise use actual average
    const monthlySavings = customMonthlySavings !== null 
      ? customMonthlySavings
      : projectionData.averageMonthlySavings;
    
    const projections = [];
    let currentNetWorth = projectionData.currentNetWorth;
    
    // Start from current month
    for (let month = 0; month <= months; month++) {
      const year = Math.floor(month / 12);
      
      projections.push({
        year: year,
        month: month,
        netWorth: currentNetWorth,
        savings: month > 0 ? monthlySavings : 0,
        interest: month > 0 ? currentNetWorth * monthlyInterestRate : 0
      });
      
      // Apply compound interest and monthly savings for next iteration
      if (month < months) {
        currentNetWorth = currentNetWorth * (1 + monthlyInterestRate) + monthlySavings;
      }
    }
    
    return projections;
  };
  
  const projections = calculateProjections();
  const finalProjection = projections[projections.length - 1];
  const totalSaved = projections.reduce((sum, p) => sum + p.savings, 0);
  const totalInterest = finalProjection.netWorth - projectionData.currentNetWorth - totalSaved;
  
  // Chart data - show yearly projections
  const chartData = [];
  const currentYear = new Date().getFullYear();
  
  for (let year = 0; year <= timeframe; year++) {
    const yearProjection = projections.find(p => p.year === year);
    if (yearProjection) {
      const actualYear = currentYear + year;
      chartData.push({
        year: year,
        netWorth: yearProjection.netWorth,
        yearLabel: year === 0 ? 'Now' : actualYear.toString()
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>Timeframe</label>
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(parseInt(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value={5}>5 years</option>
            <option value={10}>10 years</option>
            <option value={20}>20 years</option>
            <option value={30}>30 years</option>
            <option value={40}>40 years</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>Annual Interest Rate (%)</label>
          <input 
            type="number" 
            value={interestRate} 
            onChange={(e) => setInterestRate(parseFloat(e.target.value))}
            min="0" 
            max="20" 
            step="0.1"
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100px' }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>Monthly Savings (CHF)</label>
          <input 
            type="number" 
            value={customMonthlySavings || projectionData.averageMonthlySavings} 
            onChange={(e) => setCustomMonthlySavings(parseFloat(e.target.value))}
            min="0" 
            step="100"
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '150px' }}
          />
          <button 
            onClick={() => setCustomMonthlySavings(null)}
            style={{ 
              padding: '4px 8px', 
              fontSize: '12px', 
              background: '#f0f0f0', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Use actual amount
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          border: '1px solid #e9ecef',
          minWidth: '200px'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Projected Net Worth</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
            {formatCurrency(finalProjection.netWorth, 'CHF')}
          </div>
        </div>
        
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          border: '1px solid #e9ecef',
          minWidth: '200px'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Total Saved</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#6366f1' }}>
            {formatCurrency(totalSaved, 'CHF')}
          </div>
        </div>
        
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          border: '1px solid #e9ecef',
          minWidth: '200px'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Interest Earned</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
            {formatCurrency(totalInterest, 'CHF')}
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="yearLabel"
              tick={{ fill: '#666', fontSize: 12 }}
            />
            <YAxis
              tick={{ fill: '#666', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value, 'CHF').replace(/\s/g, '')}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                padding: '12px'
              }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div style={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.yearLabel}</p>
                      <p style={{ margin: 0, color: '#22c55e' }}>
                        Net Worth: {formatCurrency(data.netWorth, 'CHF')}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="#22c55e"
              strokeWidth={3}
              name="Net Worth"
              dot={{ fill: '#22c55e', r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Prediction Detail Modal Component
const PredictionDetailModal = ({ prediction, onClose, onDismiss, formatCurrency, formatDate }) => {
  if (!prediction) return null;

  const isIncome = prediction.type === 'income';

  const historicalPayments = (Array.isArray(prediction.based_on) ? prediction.based_on : [])
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return {
          date: entry,
          amount: null,
          currency: prediction.currency
        };
      }
      const rawAmount = entry.amount;
      const parsedAmount = rawAmount === null || rawAmount === undefined
        ? null
        : typeof rawAmount === 'number'
          ? rawAmount
          : parseFloat(rawAmount);

      return {
        date: entry.date || entry.transaction_date || entry,
        amount: Number.isFinite(parsedAmount) ? parsedAmount : null,
        currency: entry.currency || prediction.currency
      };
    })
    .filter((entry) => entry && entry.date);

  const paymentsDescending = historicalPayments
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const paymentsCount = paymentsDescending.length;
  const highlightCount = prediction.recurrence_type === 'monthly' && paymentsCount >= 3 ? 3 : 0;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-content open" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Prediction Details</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="transaction-preview">
            <div className="transaction-preview-item">
              <strong>Predicted Date:</strong> {formatDate(prediction.date)}
            </div>
            <div className="transaction-preview-item">
              <strong>Recipient:</strong> {prediction.recipient}
            </div>
            <div className="transaction-preview-item">
              <strong>Category:</strong> {prediction.category}
            </div>
            <div className="transaction-preview-item">
              <strong>Amount:</strong> 
              <span style={{ color: isIncome ? '#10b981' : '#ef4444', fontWeight: '600', marginLeft: '8px' }}>
                {isIncome ? '+' : '-'}{formatCurrency(Math.abs(prediction.amount), prediction.currency)}
              </span>
            </div>
            <div className="transaction-preview-item">
              <strong>Recurrence:</strong> {prediction.recurrence_type}
            </div>
            <div className="transaction-preview-item">
              <strong>Confidence:</strong> {(prediction.confidence * 100).toFixed(0)}%
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <h4 style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              marginBottom: '12px',
              color: '#1a1a1a'
            }}>
              Based on {paymentsCount} past payment{paymentsCount !== 1 ? 's' : ''}:
            </h4>
            <div className="prediction-history-container">
              {paymentsDescending.map((payment, index) => {
                const isHighlighted = index < highlightCount;
                const paymentCurrency = payment.currency || prediction.currency;
                const amountValue = payment.amount;
                const formattedAmount = amountValue !== null
                  ? `${isIncome ? '+' : '-'}${formatCurrency(Math.abs(amountValue), paymentCurrency)}`
                  : '—';
                const orderLabel = `${paymentsCount - index} of ${paymentsCount}`;

                return (
                  <div 
                    key={`${payment.date}-${index}`}
                    className={`prediction-history-entry${isHighlighted ? ' highlighted' : ''}`}
                  >
                    <div>
                      <div style={{ fontWeight: '500', color: '#1a1a1a', marginBottom: '2px' }}>
                        {formatDate(payment.date)}
                      </div>
                      {isHighlighted && (
                        <div style={{ fontSize: '11px', color: '#4f5bd5' }}>
                          Used in calculation
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ 
                        fontSize: '13px',
                        fontWeight: '600',
                        color: amountValue !== null
                          ? (isIncome ? '#059669' : '#dc2626')
                          : '#94a3b8'
                      }}>
                        {formattedAmount}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#64748b',
                        minWidth: '64px',
                        textAlign: 'right'
                      }}>
                        {orderLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {prediction.recurrence_type === 'monthly' && paymentsCount >= 3 && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#0369a1'
              }}>
                ℹ️ This prediction uses the average of the last 3 payments for greater accuracy.
              </div>
            )}
          </div>
        </div>
        
        <div
          className="modal-footer"
          style={{ 
            display: 'flex', 
            gap: '12px',
            justifyContent: 'flex-end',
            padding: '16px 24px 24px',
            borderTop: '1px solid #eef2f6',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px'
          }}
        >
          <button
            className="btn-secondary"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Close
          </button>
          <button
            className="btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(prediction);
              onClose();
            }}
            style={{
              padding: '8px 16px',
              background: '#fee',
              border: '1px solid #fcc',
              color: '#dc2626',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Dismiss Prediction
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  console.log('🎬🎬🎬 APP FUNCTION CALLED - Component is rendering!');
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if there's a stored session - if not, definitely not authenticated
    const storedToken = localStorage.getItem('sessionToken');
    console.log('🎬 Initial auth state - has stored token:', !!storedToken);
    return false; // Always start as not authenticated, let useEffect verify
  });
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renderCount, setRenderCount] = useState(0); // Force re-render mechanism
  
  console.log('🎬 RENDER COUNT:', renderCount, 'isAuth:', isAuthenticated, 'authLoad:', authLoading);

  // Centralized function to handle authentication failures
  const handleAuthFailure = useCallback(() => {
    console.log('🔒 Authentication failed - logging out user');
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setSessionToken(null);
    setUser(null);
  }, []);

  // App state
  const [summary, setSummary] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [broker, setBroker] = useState(null);
  const [loans, setLoans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forceShowApp, setForceShowApp] = useState(false); // Force show app after upload
  const uploadsInFlightRef = useRef(0);
  const [expandedCategories, setExpandedCategories] = useState({});
  // Initialize activeTab from localStorage or default to 'monthly-overview'
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('activeTab');
    // Validate that saved tab exists in TAB_ITEMS
    if (savedTab && TAB_ITEMS.some(tab => tab.key === savedTab)) {
      return savedTab;
    }
    return 'monthly-overview';
  });
  const [categorySorts, setCategorySorts] = useState({});
  const [chartView, setChartView] = useState('absolute'); // 'absolute' or 'relative'
  const [timeRange, setTimeRange] = useState('all'); // '3m', '6m', '1y', 'all'
  const [selectedMonth, setSelectedMonth] = useState(null); // For drilldown modal
  const [includeLoanPayments, setIncludeLoanPayments] = useState(true); // Include loan payments in savings calculation
  const [projectionData, setProjectionData] = useState(null); // Wealth projection data
  const [categoryEditModal, setCategoryEditModal] = useState(null); // Category edit modal state
  const [pendingCategoryChange, setPendingCategoryChange] = useState(null); // Track card animation
  const [isCategoryModalClosing, setIsCategoryModalClosing] = useState(false);
  const [predictionDetailModal, setPredictionDetailModal] = useState(null); // Prediction detail modal state
  const [showEssentialSplit, setShowEssentialSplit] = useState(true);
  const [segmentDetail, setSegmentDetail] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState(() => {
    return localStorage.getItem('defaultCurrency') || 'CHF';
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'system';
  });
  const [essentialCategories, setEssentialCategories] = useState(DEFAULT_ESSENTIAL_CATEGORIES);
  const [showEssentialCategoriesModal, setShowEssentialCategoriesModal] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const [categoriesVersion, setCategoriesVersion] = useState(0);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [wipeKeepCategories, setWipeKeepCategories] = useState(true);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeError, setWipeError] = useState(null);
  const [wipeSuccess, setWipeSuccess] = useState(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  const handleToggleIncludeLoanPayments = useCallback(() => {
    setIncludeLoanPayments((prev) => !prev);
  }, []);

  // Get resolved theme (light/dark) based on theme preference and system settings
  const getResolvedTheme = useCallback(() => {
    if (theme === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  // Apply theme class to body
  useEffect(() => {
    const resolvedTheme = getResolvedTheme();
    if (resolvedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [theme, getResolvedTheme]);

  // Listen for system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolvedTheme = getResolvedTheme();
      if (resolvedTheme === 'dark') {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme, getResolvedTheme]);
  
  console.log('🎬 App state defined, about to define refs...');

  const modalCloseTimeoutRef = useRef(null);
  const categoryAnimationTimeoutRef = useRef(null);
  
  console.log('🎬 Refs defined, about to define useEffect for session verification...');

  // Check for existing session on mount and verify with backend
  useEffect(() => {
    let mounted = true;
    
    const verifySession = async () => {
      console.log('🔍 Verifying session...');
      console.log('📊 localStorage contents:', Object.keys(localStorage));
      console.log('📊 sessionStorage contents:', Object.keys(sessionStorage));
      
      const storedToken = localStorage.getItem('sessionToken');
      const storedUser = localStorage.getItem('user');
      
      console.log('🔑 storedToken:', storedToken ? 'EXISTS' : 'NULL');
      console.log('👤 storedUser:', storedUser ? 'EXISTS' : 'NULL');
      
      if (storedToken && storedUser) {
        console.log('📦 Found stored credentials, verifying with backend...');
        // Verify token with backend with timeout
        try {
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch('http://localhost:5001/api/auth/verify', {
            headers: {
              'Authorization': `Bearer ${storedToken}`
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            const actualData = data.data || data;
            
            if (actualData.valid && mounted) {
              console.log('✅ Session valid! Setting authenticated state...');
              setSessionToken(storedToken);
              setUser(JSON.parse(storedUser));
              setIsAuthenticated(true);
              setAuthLoading(false);
              console.log('✅ State updated - should show app');
              return;
            }
          }
          
          console.log('❌ Session invalid, clearing...');
        } catch (error) {
          console.error('⚠️ Session verification failed:', error.message);
        }
        
        // If we get here, session is invalid - clear it
        if (mounted) {
          localStorage.clear();
        }
      } else {
        console.log('📭 No stored credentials found - showing login');
      }
      
      // No valid session - show login page
      if (mounted) {
        console.log('🔓 Setting state to show login page...');
        console.log('🔓 Current isAuthenticated:', isAuthenticated);
        
        // Use functional updates to ensure state is set correctly
        setIsAuthenticated(() => {
          console.log('⚙️ setIsAuthenticated called with: false');
          return false;
        });
        setAuthLoading(() => {
          console.log('⚙️ setAuthLoading called with: false');
          return false;
        });
        setLoading(false);
        console.log('✅ Auth state SET to false, authLoading SET to false');
        
        // Force component to re-render by incrementing render count
        setRenderCount(prev => {
          console.log('🔄 Incrementing render count from', prev, 'to', prev + 1);
          return prev + 1;
        });
        
        // Double-check and force another render after delay
        setTimeout(() => {
          console.log('⏱️ State check after 100ms - forcing another render');
          setRenderCount(prev => {
            console.log('🔄 Second increment from', prev, 'to', prev + 1);
            return prev + 1;
          });
        }, 100);
      }
    };
    
    verifySession();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch functions (defined early to avoid use-before-define issues)
  const fetchSummary = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/summary', { headers });
      
      if (!response.ok) {
        // Handle error responses
        if (response.status === 401) {
          handleAuthFailure();
        }
        setLoading(false);
        setSummary([]);
        return null;
      }
      
      const wrappedData = await response.json();
      // Handle double-wrapped response from authenticated endpoints
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      console.log('📊 fetchSummary response:', {
        wrappedData,
        extractedData: data,
        isArray: Array.isArray(data),
        length: Array.isArray(data) ? data.length : 'not an array'
      });
      
      // Debug: Check for November 2025 data
      if (Array.isArray(data)) {
        const november2025 = data.find(m => m.month === '2025-11');
        console.log('🔍 November 2025 data:', november2025);
        if (november2025) {
          console.log('📥 Income categories:', Object.keys(november2025.income_categories || {}));
          console.log('📤 Expense categories:', Object.keys(november2025.expense_categories || {}));
          
          // Check for predictions
          const allCategories = {...november2025.income_categories, ...november2025.expense_categories};
          Object.entries(allCategories).forEach(([catName, catData]) => {
            const predictions = catData.transactions?.filter(t => t.is_predicted) || [];
            if (predictions.length > 0) {
              console.log(`🔮 Category "${catName}" has ${predictions.length} predictions:`, predictions);
            }
          });
        } else {
          console.warn('⚠️ November 2025 not found in response!');
        }
      }
      
      setSummary(data || []);
      setLoading(false);
      return data;
    } catch (error) {
      console.error('Error fetching summary:', error);
      setLoading(false);
      setSummary([]);
      return null;
    }
  }, [sessionToken]);

  const fetchAccounts = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/accounts', { headers });
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  }, [sessionToken, handleAuthFailure]);

  const fetchBroker = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/broker', { headers });
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setBroker(data);
    } catch (error) {
      console.error('Error fetching broker:', error);
    }
  }, [sessionToken, handleAuthFailure]);

  const fetchLoans = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/loans', { headers });
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setLoans(data);
    } catch (error) {
      console.error('Error fetching loans:', error);
    }
  }, [sessionToken, handleAuthFailure]);

  const fetchProjection = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/projection', { headers });
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      // Ensure all numeric fields are actually numbers
      setProjectionData({
        currentNetWorth: typeof data.currentNetWorth === 'number' ? data.currentNetWorth : parseFloat(data.currentNetWorth) || 0,
        averageMonthlySavings: typeof data.averageMonthlySavings === 'number' ? data.averageMonthlySavings : parseFloat(data.averageMonthlySavings) || 0,
        averageSavingsRate: typeof data.averageSavingsRate === 'number' ? data.averageSavingsRate : parseFloat(data.averageSavingsRate) || 0
      });
    } catch (error) {
      console.error('Error fetching projection:', error);
      setProjectionData({
        currentNetWorth: 0,
        averageMonthlySavings: 0,
        averageSavingsRate: 0
      });
    }
  }, [sessionToken, handleAuthFailure]);

  // Fetch essential categories
  const fetchEssentialCategories = useCallback(async () => {
    if (!sessionToken) return;
    
    try {
      const response = await fetch('http://localhost:5001/api/essential-categories', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        if (data.categories && Array.isArray(data.categories)) {
          setEssentialCategories(data.categories);
        }
      }
    } catch (error) {
      console.error('Error fetching essential categories:', error);
    }
  }, [sessionToken, handleAuthFailure]);

  const fetchDocuments = useCallback(async () => {
    if (!sessionToken) {
      setDocumentTypes([]);
      setDocuments([]);
      setDocumentsLoading(false);
      return null;
    }

    try {
      setDocumentsLoading(true);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      };

      const response = await fetch(`${API_BASE_URL}/api/documents`, { headers });
      const wrappedData = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          handleAuthFailure();
        }
        setDocumentTypes([]);
        setDocuments([]);
        return null;
      }

      const rawData = wrappedData.data?.data || wrappedData.data || wrappedData;
      const docTypes = Array.isArray(rawData.documentTypes) ? rawData.documentTypes : [];
      const docs = Array.isArray(rawData.documents) ? rawData.documents : [];
      const normalizedDocs = docs.map(normalizeDocumentRecord);
      setDocumentTypes(docTypes);
      setDocuments(normalizedDocs);
      return { documentTypes: docTypes, documents: normalizedDocs };
    } catch (error) {
      console.error('Error fetching documents:', error);
      return null;
    } finally {
      setDocumentsLoading(false);
    }
  }, [sessionToken, handleAuthFailure]);

  // Save essential categories
  const saveEssentialCategories = async (categories) => {
    if (!sessionToken) return;
    
    try {
      const response = await fetch('http://localhost:5001/api/essential-categories', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ categories })
      });
      
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      
      if (response.ok) {
        setEssentialCategories(categories);
        setCategoriesVersion(prev => prev + 1); // Force re-render
      } else {
        console.error('Failed to save essential categories');
      }
    } catch (error) {
      console.error('Error saving essential categories:', error);
    }
  };

  const handleDocumentUpload = useCallback(async (documentType, file, metadata = {}, onProgress, options = {}) => {
    if (!sessionToken) {
      throw new Error('Authentication required');
    }

    let normalizedMetadata = {
      ...(metadata || {}),
      documentType
    };
    const progressCallback = typeof onProgress === 'function' ? onProgress : () => {};
    const bankType = BANK_STATEMENT_TYPES[documentType];
    const skipImport = options?.skipImport;
    const shouldImport = bankType && !skipImport;
    let importResult = options?.importResult || null;

    try {
      // Step 1: Save the document first to get its ID
      if (!bankType) {
        progressCallback('upload', 15, 'Preparing file…');
      } else {
        progressCallback('upload', 10, 'Preparing document…');
      }

      const uploadPackage = await createFileUpload(file, sessionToken, normalizedMetadata);
      const formData = uploadPackage.formData;

      formData.append('documentType', documentType);
      if (normalizedMetadata && Object.keys(normalizedMetadata).length > 0) {
        formData.append('documentMetadata', JSON.stringify(normalizedMetadata));
      }

      const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: formData
      });

      if (response.status === 401) {
        handleAuthFailure();
        throw new Error('Authentication failed');
      }

      const wrappedData = await response.json();

      if (!response.ok) {
        const errorMessage = wrappedData.error || wrappedData.message || 'Upload failed';
        throw new Error(errorMessage);
      }

      progressCallback('upload', shouldImport ? 30 : 100, 'Document secured.');

      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      const newDocument = normalizeDocumentRecord(data.document);
      const documentId = newDocument?.id;

      // Step 2: Import transactions with the document ID
      if (shouldImport && documentId) {
        uploadsInFlightRef.current += 1;
        importResult = await uploadBankStatementWithProgress(file, bankType, sessionToken, progressCallback, documentId, handleAuthFailure);
        uploadsInFlightRef.current = Math.max(0, uploadsInFlightRef.current - 1);

        // Update document metadata with import summary
        if (importResult && (importResult.start_date || importResult.end_date)) {
          normalizedMetadata = {
            ...normalizedMetadata,
            statementSummary: {
              startDate: importResult.start_date,
              endDate: importResult.end_date,
              imported: importResult.imported,
              skipped: importResult.skipped
            }
          };
        }
      } else if (options?.statementSummary) {
        normalizedMetadata = {
          ...normalizedMetadata,
          statementSummary: options.statementSummary
        };
      }

      if (newDocument) {
        setDocuments(prev => {
          const filtered = prev.filter(doc => doc.id !== newDocument.id);
          return [newDocument, ...filtered];
        });
      }

      if (!bankType || skipImport) {
        progressCallback('processing', 100, 'Processing complete.');
      }

      // Skip data fetches if this is part of a batch upload (will be fetched once at the end)
      if (!options?.skipDataFetch) {
        await Promise.allSettled([
          fetchSummary(),
          fetchAccounts(),
          fetchBroker(),
          fetchLoans(),
          fetchProjection()
        ]);

        await fetchDocuments();
      }

      if (shouldImport && uploadsInFlightRef.current === 0) {
        const wasForceShown = forceShowApp;
        setForceShowApp(true);
        // Only switch to monthly-overview if user wasn't already using the app
        // (i.e., this is their first upload during onboarding)
        // Don't switch if they're already on the data tab managing files
        if (!wasForceShown && activeTab !== 'data') {
          setActiveTab('monthly-overview');
        }
      }

      return newDocument;
    } catch (error) {
      if (shouldImport) {
        uploadsInFlightRef.current = Math.max(0, uploadsInFlightRef.current - 1);
      }
      console.error(`Error uploading document for type ${documentType}:`, error);
      throw error;
    }
  }, [
    sessionToken,
    fetchSummary,
    fetchAccounts,
    fetchBroker,
    fetchLoans,
    fetchProjection,
    fetchDocuments,
    forceShowApp,
    activeTab,
    handleAuthFailure
  ]);

  const handleDocumentDelete = useCallback(async (documentId, documentType) => {
    if (!sessionToken) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (response.status === 401) {
        handleAuthFailure();
        throw new Error('Authentication failed');
      }

      let responseData = {};
      try {
        responseData = await response.json();
      } catch {
        responseData = {};
      }

      if (!response.ok) {
        const errorMessage = responseData.error || 'Failed to delete document';
        throw new Error(errorMessage);
      }

      setDocuments(prev => prev.filter(doc => doc.id !== documentId));

      // Refresh data if this is a bank statement or broker document
      if (documentType && (BANK_STATEMENT_TYPES[documentType] || BROKER_DOCUMENT_TYPES[documentType])) {
        const refreshTasks = [
          fetchSummary(),
          fetchAccounts(),
          fetchBroker(),
          fetchLoans(),
          fetchProjection()
        ];
        await Promise.allSettled(refreshTasks);
        await fetchDocuments();
        setForceShowApp(true);
        setActiveTab('data');
      } else {
        await fetchDocuments();
      }

      return true;
    } catch (error) {
      console.error(`Error deleting document ${documentId}:`, error);
      throw error;
    }
  }, [sessionToken, fetchSummary, fetchAccounts, fetchBroker, fetchLoans, fetchProjection, fetchDocuments]);

  const handleDocumentDeleteByType = useCallback(async (documentType) => {
    if (!sessionToken) {
      throw new Error('Authentication required');
    }

    const normalizedType = normalizeTypeKey(documentType);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/by-type/${normalizedType}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (response.status === 401) {
        handleAuthFailure();
        throw new Error('Authentication failed');
      }

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage = responseData.error || 'Failed to delete documents';
        throw new Error(errorMessage);
      }

      const deletedCount = responseData.deletedCount || 0;

      if (deletedCount > 0) {
        setDocuments(prev =>
          prev.filter(doc => normalizeTypeKey(doc.documentType || doc.file_type) !== normalizedType)
        );
      }

      if (normalizedType && (normalizedType in BANK_STATEMENT_TYPES || normalizedType in BROKER_DOCUMENT_TYPES)) {
        const refreshTasks = [
          fetchSummary(),
          fetchAccounts(),
          fetchBroker(),
          fetchLoans(),
          fetchProjection()
        ];
        await Promise.allSettled(refreshTasks);
        await fetchDocuments();
        setForceShowApp(true);
        setActiveTab('data');
      } else {
        await fetchDocuments();
      }

      return deletedCount;
    } catch (error) {
      console.error(`Error deleting documents for type ${documentType}:`, error);
      throw error;
    }
  }, [
    sessionToken,
    fetchSummary,
    fetchAccounts,
    fetchBroker,
    fetchLoans,
    fetchProjection,
    fetchDocuments,
    handleAuthFailure
  ]);

  // Extract all unique categories from summary
  useEffect(() => {
    if (summary.length > 0) {
      const categorySet = new Set();
      summary.forEach(month => {
        if (month.expense_categories) {
          Object.keys(month.expense_categories).forEach(cat => categorySet.add(cat));
        }
      });
      setAllCategories(Array.from(categorySet).sort());
    }
  }, [summary]);

  // Fetch data when authenticated and token is available
  useEffect(() => {
    if (isAuthenticated && sessionToken) {
      setLoading(true);
      fetchSummary();
      fetchAccounts();
      fetchBroker();
      fetchLoans();
      fetchProjection();
      fetchEssentialCategories();
      fetchDocuments();
    } else if (isAuthenticated && !sessionToken) {
      // If authenticated but no token, set loading to false to show error state
      setLoading(false);
    }
  }, [isAuthenticated, sessionToken, fetchSummary, fetchAccounts, fetchBroker, fetchLoans, fetchProjection, fetchEssentialCategories, fetchDocuments]);

  useEffect(() => {
    setSegmentDetail(null);
  }, [activeTab, summary]);

  // Persist activeTab to localStorage whenever it changes
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  // Debug: Log summary changes
  useEffect(() => {
    console.log('📊 Summary state changed:', {
      length: summary.length,
      summary: summary,
      isArray: Array.isArray(summary)
    });
  }, [summary]);

  useEffect(() => {
    if (!showSettings) {
      setWipeLoading(false);
      setWipeError(null);
      setWipeSuccess(null);
      setWipeKeepCategories(true);
    }
  }, [showSettings]);

  const closeCategoryModal = useCallback(() => {
    if (!categoryEditModal || isCategoryModalClosing) {
      return;
    }
    if (modalCloseTimeoutRef.current) {
      clearTimeout(modalCloseTimeoutRef.current);
    }
    setIsCategoryModalClosing(true);
    modalCloseTimeoutRef.current = setTimeout(() => {
      setCategoryEditModal(null);
      setIsCategoryModalClosing(false);
      modalCloseTimeoutRef.current = null;
    }, 220);
  }, [categoryEditModal, isCategoryModalClosing]);

  const toggleCategory = (monthKey, category) => {
    const key = `${monthKey}-${category}`;
    setExpandedCategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleSort = (monthKey, category) => {
    const key = `${monthKey}-${category}`;
    setCategorySorts(prev => ({
      ...prev,
      [key]: prev[key] === 'amount' ? 'date' : 'amount'
    }));
  };

  const getSortedTransactions = (transactions, monthKey, category) => {
    const key = `${monthKey}-${category}`;
    const sortBy = categorySorts[key] || 'amount'; // Default to amount

    const sorted = [...transactions];
    if (sortBy === 'amount') {
      sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    } else {
      sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    return sorted;
  };

  const handleCategoryEdit = (transaction, monthKey, currentCategory) => {
    if (modalCloseTimeoutRef.current) {
      clearTimeout(modalCloseTimeoutRef.current);
      modalCloseTimeoutRef.current = null;
    }
    setIsCategoryModalClosing(false);
    setCategoryEditModal({
      transaction,
      monthKey,
      currentCategory,
      isIncome: currentCategory.startsWith('income-')
    });
  };

  const handleDismissPrediction = async (prediction) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/predictions/dismiss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken')}`
        },
        body: JSON.stringify({
          prediction_key: prediction.prediction_key,
          recurrence_type: prediction.recurrence_type
        })
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss prediction');
      }

      // Optimistically remove the prediction from UI
      setSummary(prev => {
        return prev.map(month => {
          if (month.month !== prediction.date.substring(0, 7)) {
            return month;
          }

          const isIncome = prediction.type === 'income';
          const categoriesKey = isIncome ? 'income_categories' : 'expense_categories';
          const updatedCategories = { ...month[categoriesKey] };
          const category = prediction.category;

          if (updatedCategories[category]) {
            const updatedTransactions = updatedCategories[category].transactions.filter(
              t => t.prediction_key !== prediction.prediction_key
            );

            if (updatedTransactions.length === 0) {
              delete updatedCategories[category];
            } else {
              updatedCategories[category] = {
                ...updatedCategories[category],
                transactions: updatedTransactions
              };
            }
          }

          return {
            ...month,
            [categoriesKey]: updatedCategories
          };
        });
      });

      console.log('Prediction dismissed successfully');
    } catch (error) {
      console.error('Error dismissing prediction:', error);
      alert('Failed to dismiss prediction. Please try again.');
    }
  };

  const handlePredictionClick = (prediction) => {
    console.log('Showing prediction details:', prediction);
    setPredictionDetailModal(prediction);
  };

  const closePredictionModal = () => {
    setPredictionDetailModal(null);
  };

 const applyLocalCategoryChange = useCallback(({
    monthKey,
    isIncome,
    normalizedCurrentCategory,
    newCategoryName,
    transaction,
    absoluteAmount,
    shouldKeepSourceExpanded,
    currentKey,
    targetKey
  }) => {
    const transactionKey = getTransactionKey(transaction);
    const categoriesKey = isIncome ? 'income_categories' : 'expense_categories';

    const updateMonth = (monthData) => {
      if (!monthData || monthData.month !== monthKey) {
        return monthData;
      }

      const clonedMonth = { ...monthData };
      const categories = { ...(clonedMonth[categoriesKey] || {}) };

      const sourceCategoryData = categories[normalizedCurrentCategory];
      if (sourceCategoryData) {
        const remainingTransactions = sourceCategoryData.transactions.filter(
          (tx) => getTransactionKey(tx) !== transactionKey
        );
        const removedCount = sourceCategoryData.transactions.length - remainingTransactions.length;
        const updatedTotal = removedCount > 0
          ? Number(Math.max((sourceCategoryData.total || 0) - absoluteAmount, 0).toFixed(2))
          : sourceCategoryData.total || 0;

        if (remainingTransactions.length > 0) {
          categories[normalizedCurrentCategory] = {
            ...sourceCategoryData,
            total: updatedTotal,
            transactions: remainingTransactions
          };
        } else {
          delete categories[normalizedCurrentCategory];
        }
      }

      const destinationCategoryData = categories[newCategoryName] || { total: 0, transactions: [] };
      const filteredDestinationTransactions = destinationCategoryData.transactions.filter(
        (tx) => getTransactionKey(tx) !== transactionKey
      );
      const removedFromDestination = destinationCategoryData.transactions.length - filteredDestinationTransactions.length;
      const baseDestinationTotal = removedFromDestination > 0
        ? Math.max((destinationCategoryData.total || 0) - absoluteAmount, 0)
        : destinationCategoryData.total || 0;

      const destinationTransactions = [
        ...filteredDestinationTransactions,
        { ...transaction }
      ];
      destinationTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

      categories[newCategoryName] = {
        ...destinationCategoryData,
        total: Number((baseDestinationTotal + absoluteAmount).toFixed(2)),
        transactions: destinationTransactions
      };

      clonedMonth[categoriesKey] = categories;
      return clonedMonth;
    };

    setSummary((prevSummary) => prevSummary.map(updateMonth));

    setSelectedMonth((prevMonth) => {
      if (prevMonth && prevMonth.month === monthKey) {
        return updateMonth(prevMonth);
      }
      return prevMonth;
    });

    setExpandedCategories((prev) => {
      const updated = { ...prev };
      if (!shouldKeepSourceExpanded) {
        delete updated[currentKey];
      }
      updated[targetKey] = true;
      return updated;
    });
  }, []);

  const handleWipeDataRequest = useCallback(() => {
    if (!sessionToken) {
      setWipeError('Your session has expired. Please log in again.');
      return;
    }
    setShowWipeConfirm(true);
  }, [sessionToken]);

  const handleWipeDataConfirm = useCallback(async () => {
    setShowWipeConfirm(false);
    setWipeLoading(true);
    setWipeError(null);
    setWipeSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/wipe-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ keepCustomCategories: wipeKeepCategories })
      });

      if (response.status === 401) {
        handleAuthFailure();
        throw new Error('Authentication failed');
      }

      const wrappedData = await response.json();

      if (!response.ok) {
        const errorMessage = wrappedData?.error || wrappedData?.message || 'Failed to wipe data';
        throw new Error(errorMessage);
      }

      setWipeSuccess('All data has been deleted successfully.');
      setForceShowApp(false);
      setSummary([]);
      setAccounts(null);
      setBroker(null);
      setLoans(null);
      setProjectionData(null);
      setDocuments([]);
      setDocumentTypes([]);
      setEssentialCategories(DEFAULT_ESSENTIAL_CATEGORIES);

      await Promise.allSettled([
        fetchSummary(),
        fetchAccounts(),
        fetchBroker(),
        fetchLoans(),
        fetchProjection(),
        fetchDocuments(),
        fetchEssentialCategories()
      ]);
    } catch (error) {
      console.error('Error wiping data:', error);
      setWipeError(error?.message || 'Failed to wipe data');
    } finally {
      setWipeLoading(false);
    }
  }, [
    sessionToken,
    wipeKeepCategories,
    handleAuthFailure,
    fetchSummary,
    fetchAccounts,
    fetchBroker,
    fetchLoans,
    fetchProjection,
    fetchDocuments,
    fetchEssentialCategories
  ]);

  const handleLogin = async (email, password) => {
    console.log('🔑 Login attempt for:', email);
    try {
      const response = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const token = data.session_token;
        const userData = data.user;
        
        console.log('✅ Login successful!');
        // Store in localStorage first
        localStorage.setItem('sessionToken', token);
        localStorage.setItem('user', JSON.stringify(userData));
        
        // Set all state together
        setSessionToken(token);
        setUser(userData);
        setIsAuthenticated(true);
        
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  };

  const handleLogout = () => {
    console.log('🚪 Logging out...');
    
    // Clear ALL storage immediately
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear cookies
      document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });
      
      console.log('✅ Storage cleared');
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
    
    // Force hard reload with cache bust - this bypasses ALL caches
    console.log('🔄 Hard reload with cache bust...');
    window.location.href = window.location.origin + '?logout=' + Date.now();
  };

  const handleCurrencyChange = (currency) => {
    setDefaultCurrency(currency);
    localStorage.setItem('defaultCurrency', currency);
    console.log(`💱 Default currency changed to ${currency}`);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    console.log(`🎨 Theme changed to ${newTheme}`);
  };

  const handleCategoryUpdate = async (newCategory) => {
    if (!categoryEditModal) return;

    const { transaction, monthKey, currentCategory, isIncome } = categoryEditModal;
    const normalizedCurrentCategory = isIncome
      ? currentCategory.replace('income-', '')
      : currentCategory;
    const newCategoryName = newCategory;

    if (normalizedCurrentCategory === newCategoryName) {
      closeCategoryModal();
      return;
    }

    const transactionAmount = transaction.amount;
    const absoluteAmount = Math.abs(transactionAmount);
    const currentKey = `${monthKey}-${currentCategory}`;
    const targetKey = `${monthKey}-${isIncome ? `income-${newCategoryName}` : newCategoryName}`;
    const transactionKey = getTransactionKey(transaction);

    const monthBeforeChange = summary.find((month) => month.month === monthKey);
    const sourceCategoryDataBefore = monthBeforeChange
      ? (isIncome
          ? monthBeforeChange.income_categories?.[normalizedCurrentCategory]
          : monthBeforeChange.expense_categories?.[normalizedCurrentCategory])
      : null;
    const shouldKeepSourceExpanded =
      !!(sourceCategoryDataBefore && (sourceCategoryDataBefore.transactions?.length || 0) > 1);

    closeCategoryModal();
    setPendingCategoryChange({ key: transactionKey, stage: 'pending' });

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      
      const response = await fetch('http://localhost:5001/api/update-category', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transaction,
          newCategory
        }),
      });

      if (response.ok) {
        await response.json();

        const payload = {
          monthKey,
          isIncome,
          normalizedCurrentCategory,
          newCategoryName,
          transaction,
          absoluteAmount,
          shouldKeepSourceExpanded,
          currentKey,
          targetKey
        };

        setPendingCategoryChange({
          key: transactionKey,
          stage: 'vanishing'
        });

        if (categoryAnimationTimeoutRef.current) {
          clearTimeout(categoryAnimationTimeoutRef.current);
        }

        categoryAnimationTimeoutRef.current = setTimeout(() => {
          applyLocalCategoryChange(payload);
          setPendingCategoryChange(null);
          fetchSummary();
          categoryAnimationTimeoutRef.current = null;
        }, 500);
      } else {
        const errorData = await response.json();
        console.error('Failed to update category:', errorData);
        alert('Failed to update category: ' + (errorData.error || 'Unknown error'));
        if (categoryAnimationTimeoutRef.current) {
          clearTimeout(categoryAnimationTimeoutRef.current);
          categoryAnimationTimeoutRef.current = null;
        }
        setPendingCategoryChange(null);
      }
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Error updating category: ' + error.message);
      if (categoryAnimationTimeoutRef.current) {
        clearTimeout(categoryAnimationTimeoutRef.current);
        categoryAnimationTimeoutRef.current = null;
      }
      setPendingCategoryChange(null);
    }
  };

  useEffect(() => {
    if (!selectedMonth) {
      return;
    }

    const updatedMonth = summary.find((month) => month.month === selectedMonth.month);
    if (updatedMonth && updatedMonth !== selectedMonth) {
      setSelectedMonth(updatedMonth);
    }
  }, [summary, selectedMonth]);

  useEffect(() => {
    return () => {
      if (modalCloseTimeoutRef.current) {
        clearTimeout(modalCloseTimeoutRef.current);
        modalCloseTimeoutRef.current = null;
      }
      if (categoryAnimationTimeoutRef.current) {
        clearTimeout(categoryAnimationTimeoutRef.current);
        categoryAnimationTimeoutRef.current = null;
      }
    };
  }, []);

  const formatCurrency = (amount, currency) => {
    // Use provided currency, otherwise fall back to user's default currency
    const displayCurrency = currency || defaultCurrency;
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: displayCurrency,
    }).format(amount);
  };

  const getSavingsGoal = () => {
    switch (defaultCurrency) {
      case 'CHF':
        return SAVINGS_GOAL_CHF;
      case 'EUR':
        return SAVINGS_GOAL_EUR;
      case 'USD':
        return SAVINGS_GOAL_CHF * 1.1; // Approximate USD conversion
      default:
        return SAVINGS_GOAL_CHF;
    }
  };

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderSidebar = () => (
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <nav className="sidebar-nav">
        {TAB_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            className={`sidebar-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(key);
              setSidebarOpen(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div style={{
        marginTop: 'auto',
        padding: '20px 24px',
        borderTop: '1px solid rgba(0,0,0,0.06)'
      }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 14px',
            backgroundColor: 'rgba(0,0,0,0.04)',
            color: '#424245',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '500',
            transition: 'background-color 0.15s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.08)'}
          onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.04)'}
        >
          Logout
        </button>
      </div>
    </aside>
  );

  console.log('🔥🔥🔥 REACHED END OF FUNCTIONS! About to do auth check...');
  console.log('🔥 Current state - isAuth:', isAuthenticated, 'authLoad:', authLoading);

  if (!isAuthenticated) {
    console.log('🎬 AUTH CHECK - user not authenticated, authLoad:', authLoading);
    if (authLoading) {
      console.log('⏳⏳⏳ Not authenticated (still loading) - showing loading screen');
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#fafafa'
        }}>
          <div style={{ color: '#1a1a1a', fontSize: '20px' }}>Loading...</div>
        </div>
      );
    }

    console.log('🎯🎯🎯 Not authenticated (auth loaded) - returning LoginPage!');
    return <LoginPage onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading your financial data...</div>
      </div>
    );
  }

  if (summary.length === 0 && !forceShowApp) {
    return (
      <div className="app">
        <div className="app-layout" style={{ justifyContent: 'center' }}>
          <main className="main-content" style={{ maxWidth: '800px', width: '100%' }}>
            <OnboardingComponent
              onUploadComplete={async () => {
              console.log('🚀 Finish setup clicked, fetching data...');
              setLoading(true);
              try {
                // Small delay to ensure backend has finished processing
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const summaryData = await fetchSummary();
                await fetchAccounts();
                await fetchDocuments();
                console.log('✅ Data fetched successfully');
                console.log('📊 Summary data:', summaryData);
                console.log('📊 Summary length:', summaryData?.length || 0);
                
                // Check if we have accounts even if summary is empty
                const token = localStorage.getItem('sessionToken');
                
                // Also check transactions directly to debug
                const transactionsResponse = await fetch('http://localhost:5001/api/transactions', {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                }).then(r => {
                  if (r.status === 401) {
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('user');
                    return null;
                  }
                  return r.json();
                }).then(d => d?.data?.data || d?.data || d).catch(() => null);
                
                console.log('📊 Transactions data:', transactionsResponse);
                console.log('📊 Transactions length:', Array.isArray(transactionsResponse) ? transactionsResponse.length : 'not an array');
                
                const accountsData = await fetch('http://localhost:5001/api/accounts', {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                }).then(r => r.json()).then(d => d.data?.data || d.data || d).catch(() => null);
                
                console.log('📊 Accounts data:', accountsData);
                console.log('📊 Accounts length:', accountsData?.accounts?.length || 0);
                
                // If we have transactions but no summary, there might be a grouping issue
                if (Array.isArray(transactionsResponse) && transactionsResponse.length > 0 && (!summaryData || summaryData.length === 0)) {
                  console.warn('⚠️ Found transactions but no summary - this might be a backend grouping issue');
                }
                
                // If summary is still empty, wait a bit more and retry once
                if (!summaryData || summaryData.length === 0) {
                  console.warn('⚠️ No summary data returned, retrying after delay...');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const retryData = await fetchSummary();
                  console.log('📊 Retry summary data:', retryData);
                  console.log('📊 Retry summary length:', retryData?.length || 0);
                  
                  if (!retryData || retryData.length === 0) {
                    console.error('❌ Still no data after retry');
                    // Even if summary is empty, show app if we have accounts
                    if (accountsData?.accounts && accountsData.accounts.length > 0) {
                      console.log('✅ Found accounts, showing app anyway');
                      setForceShowApp(true);
                    }
                    setLoading(false);
                  } else {
                    setForceShowApp(true);
                    setLoading(false);
                  }
                } else {
                  // We have data, force show app
                  setForceShowApp(true);
                  setLoading(false);
                }
              } catch (error) {
                console.error('❌ Error fetching data after upload:', error);
                setLoading(false);
                // Even on error, try to show app if accounts exist
                setForceShowApp(true);
              }
            }}
              onDocumentUpload={handleDocumentUpload}
            />
          </main>
        </div>
      </div>
    );
  }

  // Prepare data for the chart (reverse to show oldest to newest)
  const chartData = summary && summary.length > 0 ? [...summary].reverse().map(month => {
    // Calculate actual loan payments for this month from transaction data
    let monthlyLoanPayment = 0;
    if (includeLoanPayments && summary) {
      // Find the month data to get actual loan payment transactions
      const monthData = summary.find(m => m.month === month.month);
      if (monthData && monthData.expense_categories && monthData.expense_categories['Loan Payment']) {
        // Get the actual loan payment amount from transactions
        const loanPaymentData = monthData.expense_categories['Loan Payment'];
        monthlyLoanPayment = loanPaymentData.total * EUR_TO_CHF_RATE; // Convert EUR to CHF
      }
    }

    // Calculate adjusted savings and savings rate
    const adjustedSavings = month.savings + monthlyLoanPayment;
    const adjustedSavingsRate = month.income > 0 ? ((adjustedSavings / month.income) * 100) : 0;

    return {
      month: formatMonth(month.month),
      savingRate: includeLoanPayments ? adjustedSavingsRate : month.saving_rate,
      income: month.income,
      expenses: month.expenses,
      savings: adjustedSavings * EUR_TO_CHF_RATE, // Convert to CHF
      savingsEUR: adjustedSavings,
      monthData: month,
      loanPayment: monthlyLoanPayment
    };
  }) : [];
  console.log('✅✅✅ Authenticated - showing main app');

  const activeTabConfig = TAB_ITEMS.find(tab => tab.key === activeTab);
  const tabDescription = TAB_DESCRIPTIONS[activeTab] || '';

  return (
    <div>
      {/* Top Header Bar */}
      <header className="top-header">
        <button
          className={`sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <div className="sidebar-toggle-icon">
            <span></span>
          </div>
        </button>
        <h1 className="top-header-title">Wealth Tracker</h1>
        <button
          className="settings-button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <i className="fa-solid fa-gear"></i>
        </button>
      </header>

      <div className="app">
        {/* Sidebar Overlay */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {renderSidebar()}

        <div className="app-layout">
        <main className="main-content">
          {activeTab !== 'data' && (
            <div className="content-header">
              <h2>{activeTabConfig?.label || ''}</h2>
              {tabDescription && <p>{tabDescription}</p>}
            </div>
          )}
          <div className="tab-content">
            {activeTab === 'monthly-overview' && (
              <MonthlyOverviewPage
                summary={summary}
                categoriesVersion={categoriesVersion}
                expandedCategories={expandedCategories}
                toggleCategory={toggleCategory}
                categorySorts={categorySorts}
                toggleSort={toggleSort}
                getSortedTransactions={getSortedTransactions}
                formatCurrency={formatCurrency}
                formatMonth={formatMonth}
                formatDate={formatDate}
                handleCategoryEdit={handleCategoryEdit}
                pendingCategoryChange={pendingCategoryChange}
                showEssentialSplit={showEssentialSplit}
                onToggleEssentialSplit={setShowEssentialSplit}
                includeLoanPayments={includeLoanPayments}
                onToggleIncludeLoanPayments={handleToggleIncludeLoanPayments}
                essentialCategories={essentialCategories}
                categoryEditModal={categoryEditModal}
                handlePredictionClick={handlePredictionClick}
                handleDismissPrediction={handleDismissPrediction}
                setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
                defaultCurrency={defaultCurrency}
                getTransactionKey={getTransactionKey}
                MonthDetailComponent={MonthDetail}
              />
            )}
            {activeTab === 'charts' && (
              <ChartsPage
                chartData={chartData}
                timeRange={timeRange}
                onChangeTimeRange={setTimeRange}
                chartView={chartView}
                onChangeChartView={setChartView}
                includeLoanPayments={includeLoanPayments}
                onToggleIncludeLoanPayments={handleToggleIncludeLoanPayments}
                summary={summary}
                formatMonth={formatMonth}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
                expandedCategories={expandedCategories}
                toggleCategory={toggleCategory}
                categorySorts={categorySorts}
                toggleSort={toggleSort}
                getSortedTransactions={getSortedTransactions}
                handleCategoryEdit={handleCategoryEdit}
                pendingCategoryChange={pendingCategoryChange}
                showEssentialSplit={showEssentialSplit}
                essentialCategories={essentialCategories}
                categoryEditModal={categoryEditModal}
                handlePredictionClick={handlePredictionClick}
                handleDismissPrediction={handleDismissPrediction}
                setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
                defaultCurrency={defaultCurrency}
                getTransactionKey={getTransactionKey}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                MonthDetailComponent={MonthDetail}
              />
            )}
            {activeTab === 'accounts' && (
              <AccountsPage
                accounts={accounts}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            )}
            {activeTab === 'broker' && (
              <BrokerPage
                broker={broker}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
                sessionToken={sessionToken}
              />
            )}
            {activeTab === 'loans' && (
              <LoansPage
                loans={loans}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            )}
            {activeTab === 'data' && (
              <DocumentsPage
                documentTypes={documentTypes}
                documents={documents}
                loading={documentsLoading}
                onUpload={handleDocumentUpload}
                onDelete={handleDocumentDelete}
                onDeleteAll={handleDocumentDeleteByType}
                onRefresh={async () => {
                  await fetchDocuments();
                  // Also refresh broker data when documents are refreshed
                  // This ensures broker page shows updated data after broker document uploads
                  await fetchBroker();
                }}
                onWipeData={handleWipeDataRequest}
                onWipeDataConfirm={handleWipeDataConfirm}
                wipeState={{
                  keepCustomCategories: wipeKeepCategories,
                  setKeepCustomCategories: setWipeKeepCategories,
                  loading: wipeLoading,
                  error: wipeError,
                  success: wipeSuccess,
                  showConfirm: showWipeConfirm,
                  setShowConfirm: setShowWipeConfirm
                }}
              />
            )}
            {activeTab === 'projection' && (
              <ProjectionPage
                projectionData={projectionData}
                formatCurrency={formatCurrency}
              />
            )}
          </div>
        </main>
      </div>

      {/* Category Edit Modal */}
      <CategoryEditModal
        modal={categoryEditModal}
        onClose={closeCategoryModal}
        onUpdate={handleCategoryUpdate}
        formatCurrency={formatCurrency}
        isClosing={isCategoryModalClosing}
        sessionToken={sessionToken}
      />

      {/* Prediction Detail Modal */}
      <PredictionDetailModal
        prediction={predictionDetailModal}
        onClose={closePredictionModal}
        onDismiss={handleDismissPrediction}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay open" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal open" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <h3 className="settings-section-title">Default Currency</h3>
                <p className="settings-section-description">
                  Select your preferred currency for displaying amounts throughout the app.
                </p>
                <div className="currency-selector">
                  <button
                    className={`currency-option ${defaultCurrency === 'CHF' ? 'active' : ''}`}
                    onClick={() => handleCurrencyChange('CHF')}
                  >
                    <span className="currency-code">CHF</span>
                    <span className="currency-name">Swiss Franc</span>
                  </button>
                  <button
                    className={`currency-option ${defaultCurrency === 'EUR' ? 'active' : ''}`}
                    onClick={() => handleCurrencyChange('EUR')}
                  >
                    <span className="currency-code">EUR</span>
                    <span className="currency-name">Euro</span>
                  </button>
                  <button
                    className={`currency-option ${defaultCurrency === 'USD' ? 'active' : ''}`}
                    onClick={() => handleCurrencyChange('USD')}
                  >
                    <span className="currency-code">USD</span>
                    <span className="currency-name">US Dollar</span>
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3 className="settings-section-title">Color Theme</h3>
                <p className="settings-section-description">
                  Choose your preferred color theme. "Use system settings" will follow your device's theme preference.
                </p>
                <div className="currency-selector">
                  <button
                    className={`currency-option ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    <span className="currency-code">Light Mode</span>
                    <span className="currency-name">Light theme</span>
                  </button>
                  <button
                    className={`currency-option ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    <span className="currency-code">Dark Mode</span>
                    <span className="currency-name">Dark theme</span>
                  </button>
                  <button
                    className={`currency-option ${theme === 'system' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                  >
                    <span className="currency-code">Use system settings</span>
                    <span className="currency-name">Follow device preference</span>
                  </button>
                </div>
              </div>
                  </div>
          </div>
        </div>
      )}

      {/* Essential Categories Modal */}
      {showEssentialCategoriesModal && (
        <div className="modal-overlay open" onClick={() => setShowEssentialCategoriesModal(false)}>
          <div className="modal-content settings-modal open" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Customize Essential Categories</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowEssentialCategoriesModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <p className="settings-section-description">
                  Select which expense categories should be considered essential. Essential categories are used to track your essential vs. non-essential spending.
                </p>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '12px',
                  marginTop: '20px'
                }}>
                  {allCategories.map(category => {
                    const isEssential = essentialCategories.includes(category);
                    
                    return (
                      <label
                        key={category}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px',
                          background: isEssential ? '#1a1a1a' : '#f5f5f5',
                          color: isEssential ? '#ffffff' : '#1a1a1a',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          border: `2px solid ${isEssential ? '#1a1a1a' : '#e5e7eb'}`
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isEssential}
                          onChange={(e) => {
                            if (e.target.checked) {
                              saveEssentialCategories([...essentialCategories, category]);
                            } else {
                              saveEssentialCategories(essentialCategories.filter(c => c !== category));
                            }
                          }}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: isEssential ? '600' : '500' }}>
                          {category}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {allCategories.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px', 
                    color: '#999',
                    fontSize: '14px'
                  }}>
                    No expense categories found. Categories will appear here once you have transaction data.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default App;
