import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell } from 'recharts';
import './App.css';

const SAVINGS_GOAL_CHF = 3000; // Monthly savings goal in CHF
const SAVINGS_GOAL_EUR = 3000 / 0.9355; // Monthly savings goal in EUR (converted from CHF)
const SAVINGS_RATE_GOAL = 20; // Target savings rate percentage
const EUR_TO_CHF_RATE = 0.9355; // Exchange rate: 1 EUR = 0.9355 CHF (update as needed)
const ESSENTIAL_CATEGORIES = ['Rent', 'Insurance', 'Groceries'];
const TAB_ITEMS = [
  { key: 'current-month', label: 'Current Month' },
  { key: 'details', label: 'Details' },
  { key: 'charts', label: 'Savings Statistics' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'broker', label: 'Broker' },
  { key: 'loans', label: 'Loans' },
  { key: 'projection', label: 'Wealth Projection' }
];
const TAB_DESCRIPTIONS = {
  details: 'Drill into categories, transactions, and internal transfers',
  charts: 'Track savings progress and rates over time',
  accounts: 'Review balances across cash and savings accounts',
  broker: 'Inspect performance of your investment accounts',
  loans: 'Stay on top of loan balances and payments',
  'current-month': 'Track progress against your monthly savings target',
  projection: 'Model future net worth using your current savings rate'
};

const getPrimaryCurrencyForMonth = (month = {}) => {
  const eurTotal = Math.abs(month.currency_totals?.EUR || 0);
  const chfTotal = Math.abs(month.currency_totals?.CHF || 0);
  return eurTotal >= chfTotal ? 'EUR' : 'CHF';
};

const convertAmountToCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) return 0;
  if (currency === 'CHF') {
    return amount * EUR_TO_CHF_RATE;
  }
  return amount;
};

// Function to get color based on percentage of goal achieved
const getColorForPercentage = (percentage) => {
  // Clamp percentage between 0 and 150 (allowing for over-achievement to still be green)
  const clampedPercentage = Math.min(Math.max(percentage, 0), 150);

  if (clampedPercentage < 50) {
    // Red to Orange (0-50%)
    const ratio = clampedPercentage / 50;
    return `rgb(${239}, ${Math.round(68 + ratio * (251 - 68))}, ${Math.round(68 + ratio * (146 - 68))})`;
  } else if (clampedPercentage < 100) {
    // Orange to Yellow (50-100%)
    const ratio = (clampedPercentage - 50) / 50;
    return `rgb(${Math.round(251 - ratio * (251 - 234))}, ${Math.round(146 + ratio * (179 - 146))}, ${Math.round(146 - ratio * 146)})`;
  } else {
    // Yellow to Green (100-150%)
    const ratio = Math.min((clampedPercentage - 100) / 50, 1);
    return `rgb(${Math.round(234 - ratio * (234 - 16))}, ${Math.round(179 + ratio * (185 - 179))}, ${Math.round(0 + ratio * 129)})`;
  }
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
  essentialCategories
}) => {
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

  // Determine primary currency (the one with most activity)
  const primaryCurrency = getPrimaryCurrencyForMonth(month);

  const essentialCategorySet = new Set(essentialCategories || []);
  const essentialCategoryLabel = (essentialCategories && essentialCategories.length > 0)
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

  return (
    <div className="month-section">
      <div className="month-header">
        <h2 className="month-title">{formatMonth(month.month)}</h2>
        <div className="saving-info">
          <div className={`saving-amount ${month.savings >= 0 ? 'positive' : 'negative'}`}>
            {month.savings >= 0 ? '+' : ''}{formatCurrency(month.savings, primaryCurrency)}
          </div>
          <div className={`saving-rate-small ${month.saving_rate >= 0 ? 'positive' : 'negative'}`}>
            {month.saving_rate >= 0 ? '+' : ''}{month.saving_rate.toFixed(1)}%
          </div>
          <div className={`goal-progress ${month.savings >= SAVINGS_GOAL_EUR ? 'goal-achieved' : 'goal-pending'}`}>
            {((month.savings / SAVINGS_GOAL_EUR) * 100).toFixed(0)}% of goal
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Income</div>
          <div className="stat-value income">
            +{formatCurrency(month.income, primaryCurrency)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Expenses</div>
          <div className="stat-value expense">
            -{formatCurrency(month.expenses, primaryCurrency)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Savings</div>
          <div className="stat-value">
            {month.savings >= 0 ? '+' : ''}{formatCurrency(month.savings, primaryCurrency)}
          </div>
        </div>

        {showEssentialSplit && totalTrackedExpenses > 0 && (
          <>
            <div className="stat-card">
              <div className="stat-label">Essential Spend</div>
              <div className="stat-value expense">
                -{formatCurrency(essentialTotal, primaryCurrency)}
              </div>
              <div className="stat-footnote">
                Includes {essentialCategoryLabel}; {essentialTransactionCount} tx; {essentialShare.toFixed(0)}% of spend
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Non-Essential Spend</div>
              <div className="stat-value expense">
                -{formatCurrency(nonEssentialTotal, primaryCurrency)}
              </div>
              <div className="stat-footnote">
                Remaining categories; {nonEssentialTransactionCount} tx; {nonEssentialShare.toFixed(0)}% of spend
              </div>
            </div>
          </>
        )}

        {month.currency_totals.EUR !== 0 && month.currency_totals.CHF !== 0 && (
          <div className="stat-card">
            <div className="stat-label">Multi-Currency</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              <div>EUR: {month.currency_totals.EUR >= 0 ? '+' : ''}{formatCurrency(month.currency_totals.EUR, 'EUR')}</div>
              <div style={{ marginTop: '4px' }}>
                CHF: {month.currency_totals.CHF >= 0 ? '+' : ''}{formatCurrency(month.currency_totals.CHF, 'CHF')}
              </div>
            </div>
          </div>
        )}
      </div>

      {sortedIncomeCategories.length > 0 && (
        <div className="categories-section">
          <h3 className="categories-title">Income by Category</h3>
          <div className="category-list">
            {sortedIncomeCategories.map(([category, categoryData]) => {
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
                          const transactionClassList = ['transaction-item'];
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
                            >
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
                              <div className="transaction-actions">
                                <button
                                  className="category-edit-btn"
                                  onClick={() => handleCategoryEdit(transaction, month.month, `income-${category}`)}
                                  disabled={isLocked}
                                  title="Change category"
                                >
                                  ✏️
                                </button>
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
          </div>
        </div>
      )}

      {sortedExpenseCategories.length > 0 && (
        <div className="categories-section">
          <h3 className="categories-title">Spending by Category</h3>
          <div className="category-list">
            {sortedExpenseCategories.map(([category, categoryData]) => {
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
                          const transactionClassList = ['transaction-item'];
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
                            >
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
                              <div className="transaction-actions">
                                <button
                                  className="category-edit-btn"
                                  onClick={() => handleCategoryEdit(transaction, month.month, category)}
                                  disabled={isLocked}
                                  title="Change category"
                                >
                                  ✏️
                                </button>
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
          </div>
        </div>
      )}

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
const CategoryEditModal = ({ modal, onClose, onUpdate, formatCurrency, isClosing }) => {
  const [availableCategories, setAvailableCategories] = useState([]);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5001/api/categories');
      const wrappedData = await response.json();
      const data = wrappedData.data || wrappedData;

      if (modal) {
        const categories = modal.isIncome ? data.income : data.expense;
        setAvailableCategories(categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to default categories
      const defaultCategories = modal?.isIncome
        ? ['Salary', 'Income', 'Other']
        : ['Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport', 'Subscriptions', 'Loan Payment', 'Rent', 'Insurance', 'Transfer', 'Other'];
      setAvailableCategories(defaultCategories);
    }
  }, [modal]);

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
      const response = await fetch('http://localhost:5001/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: customCategoryName.trim(),
          type: modal.isIncome ? 'income' : 'expense'
        }),
      });

      if (response.ok) {
        // Add the new category to the list
        setAvailableCategories(prev => [...prev, customCategoryName.trim()]);
        setCustomCategoryName('');
        setShowCustomInput(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create category');
      }
    } catch (error) {
      console.error('Error creating custom category:', error);
      alert('Failed to create custom category');
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
              {availableCategories.map((category) => (
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '2.5rem',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#1a202c',
          textAlign: 'center'
        }}>Wealth Manager</h1>
        <p style={{
          color: '#718096',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>{getModeSubtitle()}</p>

        {error && (
          <div
            role="alert"
            style={{
              background: '#FED7D7',
              color: '#822727',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid #FEB2B2',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              background: '#C6F6D5',
              color: '#22543D',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid #9AE6B4',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#4a5568',
                marginBottom: '0.5rem'
              }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                required
                disabled={loading}
              />
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#4a5568',
              marginBottom: '0.5rem'
            }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              required
              disabled={loading}
            />
          </div>

          {mode !== 'reset' && (
            <div style={{ marginBottom: mode === 'login' ? '0.5rem' : '1rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#4a5568',
                marginBottom: '0.5rem'
              }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'register' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#4a5568',
                marginBottom: '0.5rem'
              }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#667eea',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  textDecoration: 'none'
                }}
                onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
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
              background: loading ? '#a0aec0' : '#667eea',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              marginBottom: '1rem',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = '#5568d3')}
            onMouseLeave={(e) => !loading && (e.target.style.background = '#667eea')}
          >
            {loading ? 
              (mode === 'register' ? 'Creating account...' : mode === 'reset' ? 'Sending...' : 'Signing in...') : 
              (mode === 'register' ? 'Create Account' : mode === 'reset' ? 'Send Reset Link' : 'Sign In')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          {mode === 'login' && (
            <>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    fontWeight: '600'
                  }}
                  onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                >
                  Sign up
                </button>
              </p>
              <p style={{ fontSize: '0.875rem', color: '#718096' }}>
                Demo: <strong>demo@demo / demo</strong>
              </p>
            </>
          )}
          {(mode === 'register' || mode === 'reset') && (
            <p style={{ fontSize: '0.875rem', color: '#718096' }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#667eea',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  fontWeight: '600'
                }}
                onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
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
const OnboardingComponent = ({ onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState([]); // Array of status objects for each file
  const [bankType, setBankType] = useState('auto');
  const [uploadsComplete, setUploadsComplete] = useState(false);
  const fileInputRef = useRef(null);

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

  const uploadSingleFile = async (file, index) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bankType', bankType);
    
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
                  // Update final progress to 100%
                  if (data.status === 'complete') {
                    setUploadStatuses(prev => {
                      const updated = [...prev];
                      if (updated[index] && updated[index].type === 'uploading') {
                        updated[index] = {
                          ...updated[index],
                          processingProgress: 100,
                          phase: 'processing',
                          message: `Processing complete: ${data.processed}/${data.total} transactions`
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
            const result = {
              index,
              fileName: file.name,
              type: 'success',
              message: `Successfully imported ${actualData.imported || 0} transactions!`,
              imported: actualData.imported || 0,
              skipped: actualData.skipped || 0,
              uploadProgress: 100,
              processingProgress: 100,
              progress: 100
            };
            console.log(`✅ Upload success for ${file.name}:`, result);
            
            // Update status immediately
            setUploadStatuses(prev => {
              const updated = [...prev];
              if (updated[index]) {
                updated[index] = result;
              }
              return updated;
            });
            
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

  const handleMultipleUploads = async (files) => {
    setUploading(true);
    setUploadStatuses([]);

    // Initialize status array with "uploading" status for each file
    const initialStatuses = files.map((file, index) => ({
      index,
      fileName: file.name,
      type: 'uploading',
      phase: 'upload',
      message: 'Preparing upload...',
      uploadProgress: 0,
      processingProgress: 0
    }));
    setUploadStatuses(initialStatuses);

    try {
      // Upload all files in parallel
      const uploadPromises = files.map((file, index) => uploadSingleFile(file, index));
      const results = await Promise.all(uploadPromises);

      console.log('📊 All uploads completed:', results);
      console.log('📊 Results summary:', {
        total: results.length,
        success: results.filter(r => r.type === 'success').length,
        error: results.filter(r => r.type === 'error').length,
        uploading: results.filter(r => r.type === 'uploading').length
      });
      console.log('📊 Full results array:', JSON.stringify(results, null, 2));

      // Statuses are already updated in the individual upload handlers
      // Just ensure we have the final state (in case of any race conditions)
      setUploadStatuses(results);
      
      // Check if all uploads succeeded
      const allSuccessful = results.every(result => result.type === 'success');
      const totalImported = results.reduce((sum, result) => sum + (result.imported || 0), 0);
      const totalSkipped = results.reduce((sum, result) => sum + (result.skipped || 0), 0);

      console.log(`📊 Upload summary: allSuccessful=${allSuccessful}, totalImported=${totalImported}, totalSkipped=${totalSkipped}`);

      // Set uploading to false and mark as complete
      setUploading(false);
      
      if (allSuccessful && totalImported > 0) {
        console.log('✅ All uploads successful, showing finish button...');
        // Use setTimeout to ensure state updates are processed
        setTimeout(() => {
          setUploadsComplete(true);
        }, 100);
      } else {
        console.log('⚠️ Some uploads failed or no transactions imported');
      }
    } catch (error) {
      console.error('Batch upload error:', error);
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.name.endsWith('.csv') || file.name.endsWith('.CSV')
    );
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

  const completedCount = uploadStatuses.filter(s => s.type === 'success').length;
  const failedCount = uploadStatuses.filter(s => s.type === 'error').length;

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        <div className="onboarding-header">
          <h2>Welcome to Wealth Tracker! 👋</h2>
          <p>Get started by uploading your bank statements</p>
        </div>

        <div className="onboarding-upload-section">
          <div 
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #667eea',
              borderRadius: '12px',
              padding: '60px 40px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: uploading ? '#f7fafc' : '#fafbfc',
              transition: 'all 0.3s',
              opacity: uploading ? 0.6 : 1
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.CSV"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {uploading || uploadStatuses.length > 0 ? (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  {uploading ? '⏳' : uploadsComplete ? '🎉' : completedCount > 0 ? '✅' : '📁'}
                </div>
                <p style={{ fontSize: '18px', color: '#667eea', fontWeight: '600' }}>
                  {uploading 
                    ? `Uploading ${uploadStatuses.length} file${uploadStatuses.length !== 1 ? 's' : ''}...`
                    : uploadsComplete 
                      ? 'Uploads Complete!'
                      : `${completedCount} file${completedCount !== 1 ? 's' : ''} uploaded successfully`
                  }
                </p>
                {/* Overall Progress Bar */}
                {uploadStatuses.length > 0 && (
                  <div style={{ marginTop: '20px', width: '100%', maxWidth: '400px', margin: '20px auto 0' }}>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: '#e2e8f0',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${overallProgress}%`,
                        height: '100%',
                        backgroundColor: uploadsComplete ? '#22c55e' : '#667eea',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#4a5568' }}>
                      {overallProgress}% complete ({completedCount} succeeded{failedCount > 0 ? `, ${failedCount} failed` : ''})
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
                <p style={{ fontSize: '18px', color: '#667eea', fontWeight: '600', marginBottom: '8px' }}>
                  Click to upload or drag and drop
                </p>
                <p style={{ fontSize: '14px', color: '#718096', marginTop: '8px' }}>
                  Supports YUH and DKB bank statement CSV files
                </p>
                <p style={{ fontSize: '12px', color: '#a0aec0', marginTop: '8px' }}>
                  You can select multiple files at once
                </p>
              </div>
            )}
          </div>

          <div className="bank-type-selector" style={{ marginTop: '24px', textAlign: 'center' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>
              Bank Type (optional - auto-detected if not specified):
            </label>
            <select
              value={bankType}
              onChange={(e) => setBankType(e.target.value)}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
                backgroundColor: 'white',
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
                    backgroundColor: status.type === 'success' ? '#f0fdf4' : status.type === 'error' ? '#fef2f2' : '#f7fafc',
                    border: `1px solid ${
                      status.type === 'success' ? '#86efac' : 
                      status.type === 'error' ? '#fca5a5' : 
                      '#cbd5e0'
                    }`,
                    color: status.type === 'success' ? '#166534' : status.type === 'error' ? '#991b1b' : '#4a5568'
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
                          color: '#667eea',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          📤 Upload
                        </span>
                        <span style={{ fontSize: '11px', color: '#667eea', fontWeight: '500' }}>
                          {status.uploadProgress || 0}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: '#e2e8f0',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${status.uploadProgress || 0}%`,
                          height: '100%',
                          backgroundColor: '#667eea',
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
                          color: '#22c55e',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          ⚙️ Processing
                        </span>
                        <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: '500' }}>
                          {status.processingProgress || 0}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: '#e2e8f0',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${status.processingProgress || 0}%`,
                          height: '100%',
                          backgroundColor: '#22c55e',
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
                backgroundColor: '#f0fdf4',
                borderRadius: '12px',
                border: '2px solid #86efac',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
                  Setup Complete!
                </h3>
                <p style={{ fontSize: '14px', color: '#166534', marginBottom: '0' }}>
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
                  backgroundColor: '#667eea',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#5568d3';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#667eea';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
              >
                Finish Setup →
              </button>
            </div>
          )}

          <div className="onboarding-info" style={{ marginTop: '32px', padding: '20px', backgroundColor: '#f7fafc', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#2d3748' }}>How to get your bank statements:</h3>
            <ul style={{ textAlign: 'left', fontSize: '14px', color: '#4a5568', lineHeight: '1.8', paddingLeft: '20px' }}>
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
  const [renderCount, setRenderCount] = useState(0); // Force re-render mechanism
  
  console.log('🎬 RENDER COUNT:', renderCount, 'isAuth:', isAuthenticated, 'authLoad:', authLoading);

  // App state
  const [summary, setSummary] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [broker, setBroker] = useState(null);
  const [loans, setLoans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forceShowApp, setForceShowApp] = useState(false); // Force show app after upload
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeTab, setActiveTab] = useState('current-month');
  const [categorySorts, setCategorySorts] = useState({});
  const [chartView, setChartView] = useState('absolute'); // 'absolute' or 'relative'
  const [timeRange, setTimeRange] = useState('all'); // '3m', '6m', '1y', 'all'
  const [selectedMonth, setSelectedMonth] = useState(null); // For drilldown modal
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false); // Include loan payments in savings calculation
  const [projectionData, setProjectionData] = useState(null); // Wealth projection data
  const [categoryEditModal, setCategoryEditModal] = useState(null); // Category edit modal state
  const [pendingCategoryChange, setPendingCategoryChange] = useState(null); // Track card animation
  const [isCategoryModalClosing, setIsCategoryModalClosing] = useState(false);
  const [showEssentialSplit, setShowEssentialSplit] = useState(false);
  const [segmentDetail, setSegmentDetail] = useState(null);
  
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
          // Authentication failed, clear session and show login
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
          setSessionToken(null);
          setUser(null);
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
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  }, [sessionToken]);

  const fetchBroker = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/broker', { headers });
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setBroker(data);
    } catch (error) {
      console.error('Error fetching broker:', error);
    }
  }, [sessionToken]);

  const fetchLoans = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/loans', { headers });
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setLoans(data);
    } catch (error) {
      console.error('Error fetching loans:', error);
    }
  }, [sessionToken]);

  const fetchProjection = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('http://localhost:5001/api/projection', { headers });
      const wrappedData = await response.json();
      const data = wrappedData.data?.data || wrappedData.data || wrappedData;
      setProjectionData(data);
    } catch (error) {
      console.error('Error fetching projection:', error);
      setProjectionData({
        currentNetWorth: 0,
        averageMonthlySavings: 0,
        averageSavingsRate: 0
      });
    }
  }, [sessionToken]);

  // Fetch data when authenticated and token is available
  useEffect(() => {
    if (isAuthenticated && sessionToken) {
      setLoading(true);
      fetchSummary();
      fetchAccounts();
      fetchBroker();
      fetchLoans();
      fetchProjection();
    } else if (isAuthenticated && !sessionToken) {
      // If authenticated but no token, set loading to false to show error state
      setLoading(false);
    }
  }, [isAuthenticated, sessionToken, fetchSummary, fetchAccounts, fetchBroker, fetchLoans, fetchProjection]);

  useEffect(() => {
    setSegmentDetail(null);
  }, [activeTab, summary]);

  // Debug: Log summary changes
  useEffect(() => {
    console.log('📊 Summary state changed:', {
      length: summary.length,
      summary: summary,
      isArray: Array.isArray(summary)
    });
  }, [summary]);

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
      const response = await fetch('http://localhost:5001/api/update-category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  const formatCurrency = (amount, currency = 'EUR') => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
    }).format(amount);
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
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1 className="sidebar-title">Wealth Tracker</h1>
        <p className="sidebar-tagline">Your monthly savings and spending dashboard</p>
      </div>
      <nav className="sidebar-nav">
        {TAB_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            className={`sidebar-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div style={{ 
        marginTop: 'auto', 
        padding: '20px', 
        borderTop: '1px solid rgba(255,255,255,0.1)' 
      }}>
        {user && (
          <div style={{ 
            color: 'rgba(255,255,255,0.7)', 
            fontSize: '14px', 
            marginBottom: '12px' 
          }}>
            Logged in as <strong style={{ color: 'white' }}>{user.id}</strong>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
          onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
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
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ color: 'white', fontSize: '20px' }}>Loading...</div>
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
            <OnboardingComponent onUploadComplete={async () => {
              console.log('🚀 Finish setup clicked, fetching data...');
              setLoading(true);
              try {
                // Small delay to ensure backend has finished processing
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const summaryData = await fetchSummary();
                await fetchAccounts();
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
                }).then(r => r.json()).then(d => d.data?.data || d.data || d).catch(() => null);
                
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
            }} />
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

  const renderDetailsTab = () => (
    <>
      <div className="details-controls">
        <div className="chart-toggle">
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? '' : 'active'}`}
            onClick={() => setShowEssentialSplit(false)}
          >
            All Categories
          </button>
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? 'active' : ''}`}
            onClick={() => setShowEssentialSplit(true)}
          >
            Essentials Split
          </button>
        </div>
      </div>
      {summary.map((month) => (
        <MonthDetail
          key={month.month}
          month={month}
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
          essentialCategories={ESSENTIAL_CATEGORIES}
        />
      ))}
    </>
  );

  const renderCurrentMonthTab = () => {
    if (!summary.length) {
      return (
        <div className="current-month-container">
          <div className="loading">No transaction data available.</div>
        </div>
      );
    }

    const latestMonth = summary.reduce((latest, month) => {
      if (!latest) return month;
      return new Date(month.month) > new Date(latest.month) ? month : latest;
    }, null);

    if (!latestMonth) {
      return (
        <div className="current-month-container">
          <div className="loading">Unable to determine the current month summary.</div>
        </div>
      );
    }

    const primaryCurrency = getPrimaryCurrencyForMonth(latestMonth);
    const formatForPrimary = (amount) => formatCurrency(convertAmountToCurrency(amount, primaryCurrency), primaryCurrency);
    const monthLabel = formatMonth(latestMonth.month);
    const targetSavings = SAVINGS_GOAL_EUR;
    const income = latestMonth.income || 0;
    const essentialTransactions = [];
    const nonEssentialTransactions = [];
    const essentialTxKeys = new Set();
    const nonEssentialTxKeys = new Set();
    let essentialSpend = 0;
    let nonEssentialSpend = 0;
    let essentialCount = 0;
    let nonEssentialCount = 0;

    Object.entries(latestMonth.expense_categories || {}).forEach(([category, categoryData]) => {
      const total = categoryData?.total || 0;
      const count = categoryData?.transactions?.length || 0;
      const transactions = categoryData?.transactions || [];
      if (ESSENTIAL_CATEGORIES.includes(category)) {
        essentialSpend += total;
        essentialCount += count;
        transactions.forEach((tx) => {
          const txKey = getTransactionKey(tx);
          if (!essentialTxKeys.has(txKey)) {
            essentialTxKeys.add(txKey);
            essentialTransactions.push({ ...tx, category });
          }
        });
      } else {
        nonEssentialSpend += total;
        nonEssentialCount += count;
        transactions.forEach((tx) => {
          const txKey = getTransactionKey(tx);
          if (!nonEssentialTxKeys.has(txKey)) {
            nonEssentialTxKeys.add(txKey);
            nonEssentialTransactions.push({ ...tx, category });
          }
        });
      }
    });

    const totalTrackedExpenses = essentialSpend + nonEssentialSpend;
    const spendableBudget = Math.max(income - targetSavings, 0);
    const overspendAmount = Math.max(totalTrackedExpenses - spendableBudget, 0);
    const actualSavings = Math.max(latestMonth.savings, 0);
    const totalPlanned = totalTrackedExpenses + targetSavings;
    const isOverBudget = totalPlanned > income + 0.01;
    // Savings gap calculation (for future use)
    // const savingsGap = Math.max(targetSavings - actualSavings, 0);
    const savingsProgressPercentage = targetSavings > 0
      ? Math.min(Math.max((actualSavings / targetSavings) * 100, 0), 200)
      : 0;
    const unusedCapital = Math.max(income - totalPlanned, 0);
    const hasUnusedCapital = unusedCapital > 0.01;
    const essentialRadius = [12, 0, 0, 12];
    const middleRadius = [0, 0, 0, 0];
    const savingsRadius = hasUnusedCapital ? middleRadius : [0, 12, 12, 0];
    const unusedRadius = hasUnusedCapital ? [0, 12, 12, 0] : middleRadius;

    const sortTransactionsByAmount = (transactions) => [...transactions].sort((a, b) => {
      const diff = Math.abs(b.amount) - Math.abs(a.amount);
      if (diff !== 0) return diff;
      return new Date(b.date) - new Date(a.date);
    });

    const handleSegmentSelect = (segment) => {
      if (segment === 'essential') {
        const meta = essentialTransactions.length
          ? `${essentialTransactions.length} transaction${essentialTransactions.length === 1 ? '' : 's'}`
          : 'No transactions found in essential categories.';
        setSegmentDetail({
          month: latestMonth.month,
          segment,
          label: 'Essential spend',
          total: essentialSpend,
          type: 'expense',
          transactions: sortTransactionsByAmount(essentialTransactions),
          meta,
          message: essentialTransactions.length ? '' : 'Add more categorised essential expenses to see them here.'
        });
      } else if (segment === 'nonEssential') {
        const meta = nonEssentialTransactions.length
          ? `${nonEssentialTransactions.length} transaction${nonEssentialTransactions.length === 1 ? '' : 's'}`
          : 'No transactions found in non-essential categories.';
        setSegmentDetail({
          month: latestMonth.month,
          segment,
          label: 'Non-essential spend',
          total: nonEssentialSpend,
          type: 'expense',
          transactions: sortTransactionsByAmount(nonEssentialTransactions),
          meta,
          message: nonEssentialTransactions.length ? '' : 'Add more categorised non-essential expenses to see them here.'
        });
      } else if (segment === 'savings') {
        const gap = Math.max(targetSavings - actualSavings, 0);
        const meta = gap > 0
          ? `Target ${formatForPrimary(targetSavings)} · saved ${formatForPrimary(actualSavings)} · gap ${formatForPrimary(gap)}`
          : `Target ${formatForPrimary(targetSavings)} · saved ${formatForPrimary(actualSavings)}`;
        setSegmentDetail({
          month: latestMonth.month,
          segment,
          label: 'Savings goal',
          total: targetSavings,
          type: 'info',
          transactions: [],
          meta,
          message: 'Savings goal is derived from income minus spending, so there are no individual transactions.'
        });
      } else if (segment === 'unused' && hasUnusedCapital) {
        setSegmentDetail({
          month: latestMonth.month,
          segment,
          label: 'Unused capital',
          total: unusedCapital,
          type: 'info',
          transactions: [],
          meta: `Remaining after planned spending: ${formatForPrimary(unusedCapital)}`,
          message: 'Unused capital represents income that has not been assigned to savings or spending categories.'
        });
      }
    };

    const currentSegmentDetail = segmentDetail && segmentDetail.month === latestMonth.month ? segmentDetail : null;
    const essentialShare = totalTrackedExpenses > 0 ? (essentialSpend / totalTrackedExpenses) * 100 : 0;
    const nonEssentialShare = totalTrackedExpenses > 0 ? (nonEssentialSpend / totalTrackedExpenses) * 100 : 0;

    return (
      <div className="current-month-container">
        <div className="current-month-header">
          <div>
            <h3>{monthLabel}</h3>
            <p>
              Income {formatForPrimary(latestMonth.income)} • Expenses {formatForPrimary(latestMonth.expenses)}
            </p>
          </div>
        </div>

        {income > 0 ? (
          <div className="current-month-chart">
            <div className="chart-header">
              <span>Income allocation</span>
              <strong>{formatForPrimary(income)}</strong>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={[
                  {
                    name: 'Allocation',
                    essential: essentialSpend,
                    nonEssential: nonEssentialSpend,
                    savings: targetSavings,
                    unused: unusedCapital
                  }
                ]}
                layout="vertical"
                margin={{ top: 20, right: 40, left: 20, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  domain={[0, Math.max(income, totalPlanned)]}
                  tickFormatter={(value) => formatForPrimary(value)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  formatter={(value, key) => {
                    const label =
                      key === 'essential'
                        ? 'Essential spend'
                        : key === 'nonEssential'
                          ? 'Non-essential spend'
                          : key === 'savings'
                            ? 'Savings goal'
                            : 'Unused capital';
                    return [formatForPrimary(value), label];
                  }}
                />
                <ReferenceLine
                  x={income}
                  stroke="#0f172a"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Income ${formatForPrimary(income)}`,
                    position: 'top',
                    fill: '#0f172a',
                    fontSize: 12
                  }}
                />
                <defs>
                  <linearGradient id="segmentEssential" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="segmentNonEssential" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#fb923c" />
                  </linearGradient>
                  <linearGradient id="segmentSavings" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2db14c" />
                    <stop offset="100%" stopColor="#3ad364" />
                  </linearGradient>
                  <linearGradient id="segmentSavingsOver" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e0453a" />
                    <stop offset="100%" stopColor="#f0624f" />
                  </linearGradient>
                  <linearGradient id="segmentUnused" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d1d5db" />
                    <stop offset="100%" stopColor="#e5e7eb" />
                  </linearGradient>
                </defs>
                <Bar
                  dataKey="essential"
                  stackId="allocation"
                  fill="url(#segmentEssential)"
                  barSize={24}
                  radius={essentialRadius}
                  cursor={essentialTransactions.length ? 'pointer' : 'default'}
                  onClick={() => {
                    if (essentialTransactions.length) {
                      handleSegmentSelect('essential');
                    }
                  }}
                />
                <Bar
                  dataKey="nonEssential"
                  stackId="allocation"
                  fill="url(#segmentNonEssential)"
                  radius={middleRadius}
                  cursor={nonEssentialTransactions.length ? 'pointer' : 'default'}
                  onClick={() => {
                    if (nonEssentialTransactions.length) {
                      handleSegmentSelect('nonEssential');
                    }
                  }}
                />
                <Bar
                  dataKey="savings"
                  stackId="allocation"
                  fill={isOverBudget ? 'url(#segmentSavingsOver)' : 'url(#segmentSavings)'}
                  radius={savingsRadius}
                  cursor="pointer"
                  onClick={() => handleSegmentSelect('savings')}
                />
                <Bar
                  dataKey="unused"
                  stackId="allocation"
                  fill="url(#segmentUnused)"
                  radius={unusedRadius}
                  cursor={hasUnusedCapital ? 'pointer' : 'default'}
                  onClick={() => {
                    if (hasUnusedCapital) {
                      handleSegmentSelect('unused');
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-summary">
              <div
                className="chart-summary-item chart-summary-item-clickable"
                onClick={() => {
                  if (essentialTransactions.length) {
                    handleSegmentSelect('essential');
                  }
                }}
                role="button"
                tabIndex={essentialTransactions.length ? 0 : -1}
                onKeyDown={(event) => {
                  if (essentialTransactions.length && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleSegmentSelect('essential');
                  }
                }}
              >
                <span className="summary-dot essential" />
                Essential spend: {formatForPrimary(-essentialSpend)}
              </div>
              <div
                className="chart-summary-item chart-summary-item-clickable"
                onClick={() => {
                  if (nonEssentialTransactions.length) {
                    handleSegmentSelect('nonEssential');
                  }
                }}
                role="button"
                tabIndex={nonEssentialTransactions.length ? 0 : -1}
                onKeyDown={(event) => {
                  if (nonEssentialTransactions.length && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleSegmentSelect('nonEssential');
                  }
                }}
              >
                <span className="summary-dot non-essential" />
                Non-essential spend: {formatForPrimary(-nonEssentialSpend)}
              </div>
              <div
                className="chart-summary-item chart-summary-item-clickable"
                onClick={() => handleSegmentSelect('savings')}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSegmentSelect('savings');
                  }
                }}
              >
                <span className="summary-dot savings" style={{ background: isOverBudget ? '#ef4444' : '#10b981' }} />
                Savings goal: {formatForPrimary(targetSavings)} (saved {formatForPrimary(actualSavings)})
              </div>
              <div
                className={`chart-summary-item ${hasUnusedCapital ? 'chart-summary-item-clickable' : ''}`}
                onClick={() => {
                  if (hasUnusedCapital) {
                    handleSegmentSelect('unused');
                  }
                }}
                role="button"
                tabIndex={hasUnusedCapital ? 0 : -1}
                onKeyDown={(event) => {
                  if (hasUnusedCapital && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleSegmentSelect('unused');
                  }
                }}
              >
                <span className={`summary-dot ${overspendAmount > 0 ? 'negative' : 'unused'}`} />
                {overspendAmount > 0
                  ? `Overspend: ${formatForPrimary(overspendAmount)}`
                  : `Unused capital: ${formatForPrimary(unusedCapital)}`}
              </div>
            </div>
            {currentSegmentDetail && (
              <div className="segment-detail">
                <div className="segment-detail-header">
                  <div>
                    <h4>{currentSegmentDetail.label}</h4>
                    <div className="segment-detail-meta">
                      {currentSegmentDetail.type === 'expense'
                        ? formatForPrimary(-currentSegmentDetail.total)
                        : formatForPrimary(currentSegmentDetail.total)}
                      <span className="segment-detail-divider">·</span>
                      {currentSegmentDetail.meta}
                    </div>
                  </div>
                  <button
                    className="segment-detail-close"
                    onClick={() => setSegmentDetail(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                {currentSegmentDetail.transactions.length > 0 ? (
                  <div className="transaction-list segment-transaction-list">
                    {currentSegmentDetail.transactions.map((transaction, index) => {
                      const transactionKey = `${currentSegmentDetail.segment}-${getTransactionKey(transaction)}-${index}`;
                      const amountIsExpense = transaction.amount < 0;
                      const amountDisplay = `${amountIsExpense ? '-' : '+'}${formatCurrency(Math.abs(transaction.amount), transaction.currency)}`;
                      const accountClass = transaction.account
                        ? `account-badge account-badge-${transaction.account.toLowerCase().replace(/ /g, '-')}`
                        : 'account-badge';
                      return (
                        <div key={transactionKey} className="transaction-item">
                          <div className="transaction-date">
                            {formatDate(transaction.date)}
                            {transaction.account && (
                              <span className={accountClass}>{transaction.account}</span>
                            )}
                          </div>
                          <div className="transaction-details">
                            <div className="transaction-recipient">
                              {transaction.recipient || 'Unknown recipient'}
                            </div>
                            {transaction.description && (
                              <div className="transaction-description">
                                {transaction.description}
                              </div>
                            )}
                            <div className="transaction-category-tag">
                              {transaction.category}
                            </div>
                          </div>
                          <div className={`transaction-amount ${amountIsExpense ? '' : 'transaction-amount-income'}`}>
                            {amountDisplay}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="segment-empty">
                    {currentSegmentDetail.message || 'No transaction details available for this segment.'}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="current-month-highlight">
            <div className="current-month-remaining negative">
              <span>No income recorded for this month</span>
              <strong>{formatForPrimary(0)}</strong>
            </div>
          </div>
        )}

        <div className="current-month-grid">
          <div className="current-month-card">
            <div className="card-label">Savings progress</div>
            <div className="progress-value">
              {latestMonth.savings >= 0 ? '+' : ''}{formatForPrimary(latestMonth.savings)}
              <span className="progress-percentage">
                ({savingsProgressPercentage.toFixed(0)}% of goal)
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(savingsProgressPercentage, 200)}%` }}
              />
            </div>
          </div>

          <div className="current-month-card">
            <div className="card-label">Essential spend</div>
            <div className="card-value">
              -{formatForPrimary(essentialSpend)}
            </div>
            <div className="card-meta">
              {ESSENTIAL_CATEGORIES.join(', ')} • {essentialCount} tx • {essentialShare.toFixed(0)}% of spend
            </div>
          </div>

          <div className="current-month-card">
            <div className="card-label">Non-essential spend</div>
            <div className="card-value">
              -{formatForPrimary(nonEssentialSpend)}
            </div>
            <div className="card-meta">
              Remaining categories • {nonEssentialCount} tx • {nonEssentialShare.toFixed(0)}% of spend
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChartsTab = () => {
    // Filter data based on time range
    const getFilteredData = () => {
      if (timeRange === 'all') return chartData;

      const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
      return chartData.slice(-months);
    };

    const filteredData = getFilteredData();

    // Calculate averages and totals
    const totalSavings = filteredData.reduce((sum, month) => sum + month.savings, 0);
    const avgSavings = totalSavings / filteredData.length;
    const totalSavingRate = filteredData.reduce((sum, month) => sum + month.savingRate, 0);
    const avgSavingRate = totalSavingRate / filteredData.length;

    return (
      <div className="charts-container" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="chart-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 className="chart-title" style={{ marginBottom: '4px' }}>Savings Over Time</h3>
              <div style={{ fontSize: '14px', color: '#666', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {chartView === 'absolute' ? (
                  <>
                    <div>
                      Average: <span style={{ fontWeight: 600, color: getColorForPercentage((avgSavings / SAVINGS_GOAL_CHF) * 100) }}>
                        {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(avgSavings)}
                      </span>
                      <span style={{ marginLeft: '8px', color: '#999' }}>
                        ({((avgSavings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal)
                      </span>
                      {includeLoanPayments && (
                        <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>
                          (incl. actual loan payments)
                        </span>
                      )}
                    </div>
                    <div>
                      Total: <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                        {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(totalSavings)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      Average: <span style={{ fontWeight: 600, color: getColorForPercentage((avgSavingRate / SAVINGS_RATE_GOAL) * 100) }}>
                        {avgSavingRate.toFixed(1)}%
                      </span>
                      <span style={{ marginLeft: '8px', color: '#999' }}>
                        ({((avgSavingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal)
                      </span>
                      {includeLoanPayments && (
                        <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>
                          (incl. actual loan payments)
                        </span>
                      )}
                    </div>
                    <div>
                      Total: <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                        {totalSavingRate.toFixed(1)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="time-range-selector">
                <button
                  className={`time-range-btn ${timeRange === '3m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('3m')}
                >
                  3M
                </button>
                <button
                  className={`time-range-btn ${timeRange === '6m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('6m')}
                >
                  6M
                </button>
                <button
                  className={`time-range-btn ${timeRange === '1y' ? 'active' : ''}`}
                  onClick={() => setTimeRange('1y')}
                >
                  1Y
                </button>
                <button
                  className={`time-range-btn ${timeRange === 'all' ? 'active' : ''}`}
                  onClick={() => setTimeRange('all')}
                >
                  All
                </button>
              </div>
              <div className="chart-toggle">
                <button
                  className={`chart-toggle-btn ${chartView === 'absolute' ? 'active' : ''}`}
                  onClick={() => setChartView('absolute')}
                >
                  Absolute
                </button>
                <button
                  className={`chart-toggle-btn ${chartView === 'relative' ? 'active' : ''}`}
                  onClick={() => setChartView('relative')}
                >
                  Rate
                </button>
              </div>
              <div className="loan-payment-toggle">
                <button
                  className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
                  onClick={() => setIncludeLoanPayments(!includeLoanPayments)}
                  title="Include monthly loan payments in savings calculation"
                >
                  Include Loans
                </button>
              </div>
            </div>
          </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={filteredData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={(data) => {
                if (data && data.activePayload && data.activePayload[0]) {
                  const clickedData = data.activePayload[0].payload;
                  // Find the full month data from summary
                  const monthData = summary.find(m => formatMonth(m.month) === clickedData.month);
                  if (monthData) {
                    setSelectedMonth(monthData);
                    // Scroll to drilldown details after a short delay to allow rendering
                    setTimeout(() => {
                      const element = document.getElementById('drilldown-details');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 100);
                  }
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#666', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: '#666', fontSize: 12 }}
                label={{
                  value: chartView === 'absolute' ? 'Savings (CHF)' : 'Savings Rate (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#666' }
                }}
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
                        <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.month}</p>
                        {chartView === 'absolute' ? (
                          <>
                            <p style={{ margin: 0, color: getColorForPercentage((data.savings / SAVINGS_GOAL_CHF) * 100) }}>
                              Savings: {new Intl.NumberFormat('de-CH', {
                                style: 'currency',
                                currency: 'CHF',
                                minimumFractionDigits: 2
                              }).format(data.savings)}
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes {new Intl.NumberFormat('de-CH', {
                                  style: 'currency',
                                  currency: 'CHF',
                                  minimumFractionDigits: 2
                                }).format(data.loanPayment)} loan payment)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: '#666', fontSize: '12px' }}>
                              {((data.savings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        ) : (
                          <>
                            <p style={{ margin: 0, color: getColorForPercentage((data.savingRate / SAVINGS_RATE_GOAL) * 100) }}>
                              Savings Rate: {data.savingRate.toFixed(1)}%
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes loan payments)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: '#666', fontSize: '12px' }}>
                              {((data.savingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
              {chartView === 'absolute' && (
                <ReferenceLine
                  y={SAVINGS_GOAL_CHF}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `Goal: ${new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(SAVINGS_GOAL_CHF)}`,
                    position: 'insideTopLeft',
                    fill: '#f59e0b',
                    fontSize: 12,
                    fontWeight: 600,
                    offset: 10
                  }}
                />
              )}
              {chartView === 'absolute' ? (
                <Bar
                  dataKey="savings"
                  radius={[8, 8, 0, 0]}
                  name="Savings"
                >
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savings / SAVINGS_GOAL_CHF) * 100;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={getColorForPercentage(percentage)}
                      />
                    );
                  })}
                </Bar>
              ) : (
                <Bar
                  dataKey="savingRate"
                  radius={[8, 8, 0, 0]}
                  name="Savings Rate (%)"
                >
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savingRate / SAVINGS_RATE_GOAL) * 100;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={getColorForPercentage(percentage)}
                      />
                    );
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drilldown Details */}
      {selectedMonth && (
        <div id="drilldown-details" style={{ position: 'relative', scrollMarginTop: '100px' }}>
          <button
            className="drilldown-close"
            onClick={() => setSelectedMonth(null)}
            title="Close details"
          >
            ✕
          </button>
          <MonthDetail
            month={selectedMonth}
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
          />
        </div>
      )}
    </div>
    );
  };

  const renderAccountsTab = () => {
    if (!accounts) {
      return (
        <div className="accounts-container">
          <div className="loading">Loading account data...</div>
        </div>
      );
    }

    // Categorize accounts into cash, broker, and loans
    const isBrokerAccount = (accountName) => {
      const brokerKeywords = ['ing diba', 'viac', 'broker', 'depot'];
      return brokerKeywords.some(keyword => accountName.toLowerCase().includes(keyword));
    };

    const isLoanAccount = (accountName) => {
      const loanKeywords = ['kfw', 'loan', 'credit', 'debt'];
      return loanKeywords.some(keyword => accountName.toLowerCase().includes(keyword));
    };

    // Split accounts into three categories
    const brokerAccounts = accounts.accounts.filter(acc => isBrokerAccount(acc.account));
    const loanAccounts = accounts.accounts.filter(acc => isLoanAccount(acc.account));
    const cashAccounts = accounts.accounts.filter(acc => !isBrokerAccount(acc.account) && !isLoanAccount(acc.account));

    // Calculate cash totals (includes Tagesgeld and all non-broker, non-loan accounts)
    const cashTotals = { EUR: 0, CHF: 0 };
    cashAccounts.forEach(acc => {
      cashTotals[acc.currency] += acc.balance;
    });
    const cashTotalInChf = cashTotals.CHF + (cashTotals.EUR * EUR_TO_CHF_RATE);

    // Calculate broker totals
    const brokerTotals = { EUR: 0, CHF: 0 };
    brokerAccounts.forEach(acc => {
      brokerTotals[acc.currency] += acc.balance;
    });
    const brokerTotalInChf = brokerTotals.CHF + (brokerTotals.EUR * EUR_TO_CHF_RATE);

    // Calculate loan totals (negative balances)
    const loanTotals = { EUR: 0, CHF: 0 };
    loanAccounts.forEach(acc => {
      loanTotals[acc.currency] += acc.balance; // Already negative
    });
    const loanTotalInChf = loanTotals.CHF + (loanTotals.EUR * EUR_TO_CHF_RATE);

    // Calculate overall total (cash + broker + loans)
    const totalInChf = cashTotalInChf + brokerTotalInChf + loanTotalInChf;

    return (
      <div className="accounts-container">
        <div className="accounts-summary">
          <h3 className="accounts-title">Net Worth Overview</h3>
          <div className="totals-grid">
            <div className="total-card">
              <div className="total-label">Net Worth (in CHF)</div>
              <div className={`total-amount ${totalInChf >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '32px', fontWeight: '700' }}>
                {formatCurrency(totalInChf, 'CHF')}
              </div>
            </div>

            {cashAccounts.length > 0 && (
              <div className="total-card">
                <div className="total-label">Cash & Savings</div>
                <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                  {formatCurrency(cashTotalInChf, 'CHF')}
                </div>
                <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                  {cashAccounts.length} account{cashAccounts.length > 1 ? 's' : ''}
                </div>
              </div>
            )}

            {brokerAccounts.length > 0 && (
              <div className="total-card">
                <div className="total-label">Broker Accounts</div>
                <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                  {formatCurrency(brokerTotalInChf, 'CHF')}
                </div>
                <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                  {brokerAccounts.length} account{brokerAccounts.length > 1 ? 's' : ''}
                </div>
              </div>
            )}

            {loanAccounts.length > 0 && (
              <div className="total-card">
                <div className="total-label">Student Loans</div>
                <div className="total-amount negative" style={{ fontSize: '28px', fontWeight: '700' }}>
                  {formatCurrency(loanTotalInChf, 'CHF')}
                </div>
                <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                  {loanAccounts.length} loan{loanAccounts.length > 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {cashAccounts.length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">Cash & Savings Accounts</h3>
            <div className="accounts-grid">
              {cashAccounts.map((account) => (
                <div key={account.account} className="account-card">
                  <div className="account-header">
                    <div className="account-name">{account.account}</div>
                    <span className={`account-badge account-badge-${account.account.toLowerCase().replace(/ /g, '-')}`}>
                      {account.currency}
                    </span>
                  </div>
                  <div className={`account-balance ${account.balance >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(account.balance, account.currency)}
                  </div>
                  <div className="account-meta">
                    <span className="account-meta-item">
                      {account.transaction_count} transactions
                    </span>
                    {account.last_transaction_date && (
                      <span className="account-meta-item">
                        Last: {formatDate(account.last_transaction_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {brokerAccounts.length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">Broker Accounts</h3>
            <div className="accounts-grid">
              {brokerAccounts.map((account) => (
                <div key={account.account} className="account-card">
                  <div className="account-header">
                    <div className="account-name">{account.account}</div>
                    <span className={`account-badge account-badge-${account.account.toLowerCase().replace(/ /g, '-')}`}>
                      {account.currency}
                    </span>
                  </div>
                  <div className={`account-balance ${account.balance >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(account.balance, account.currency)}
                  </div>
                  <div className="account-meta">
                    <span className="account-meta-item">
                      {account.transaction_count} transactions
                    </span>
                    {account.last_transaction_date && (
                      <span className="account-meta-item">
                        Last: {formatDate(account.last_transaction_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loanAccounts.length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">Student Loans</h3>
            <div className="accounts-grid">
              {loanAccounts.map((account) => (
                <div key={account.account} className="account-card">
                  <div className="account-header">
                    <div className="account-name">{account.account}</div>
                    <span className="account-badge account-badge-kfw">
                      {account.currency}
                    </span>
                  </div>
                  <div className="account-balance negative">
                    {formatCurrency(account.balance, account.currency)}
                  </div>
                  <div className="account-meta">
                    <span className="account-meta-item">
                      Student Loan
                    </span>
                    {account.last_transaction_date && (
                      <span className="account-meta-item">
                        Last: {formatDate(account.last_transaction_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBrokerTab = () => {
    if (!broker) {
      return (
        <div className="accounts-container">
          <div className="loading">Loading broker data...</div>
        </div>
      );
    }

    // Prepare chart data for total portfolio value over time
    const portfolioChartData = [];
    let cumulativeInvestedCHF = 0;
    let cumulativeInvestedEUR = 0;

    // Get ING DiBa purchase date and total from holdings
    const ingDibaHoldings = broker.holdings.filter(h => h.account === 'ING DiBa');
    const ingDibaPurchaseDate = ingDibaHoldings.length > 0 && ingDibaHoldings[0].purchase_date
      ? new Date(ingDibaHoldings[0].purchase_date)
      : null;
    const ingDibaTotalCost = broker.summary.ing_diba ? broker.summary.ing_diba.total_invested : 0;
    const ingDibaCurrentValue = broker.summary.ing_diba ? broker.summary.ing_diba.total_current_value : 0;

    // Sort transactions by date
    const sortedTransactions = [...broker.transactions].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    // Start from ING DiBa purchase date if available
    if (ingDibaPurchaseDate) {
      // Day before ING DiBa purchase
      portfolioChartData.push({
        date: formatDate(new Date(ingDibaPurchaseDate.getTime() - 24*60*60*1000)),
        totalInvested: 0
      });

      // ING DiBa purchase date
      cumulativeInvestedEUR = ingDibaTotalCost;
      portfolioChartData.push({
        date: formatDate(ingDibaPurchaseDate),
        totalInvested: ingDibaTotalCost * EUR_TO_CHF_RATE
      });
    } else if (sortedTransactions.length > 0) {
      // Fallback to first transaction if no ING DiBa date
      const firstDate = new Date(sortedTransactions[0].date);
      portfolioChartData.push({
        date: formatDate(new Date(firstDate.getTime() - 24*60*60*1000)),
        totalInvested: 0
      });
    }

    // Build cumulative investment data from VIAC transactions
    sortedTransactions.forEach(transaction => {
      if (transaction.currency === 'CHF') {
        cumulativeInvestedCHF += Math.abs(transaction.amount);
      } else if (transaction.currency === 'EUR') {
        cumulativeInvestedEUR += Math.abs(transaction.amount);
      }

      // Convert to CHF for total
      const totalInCHF = cumulativeInvestedCHF + (cumulativeInvestedEUR * EUR_TO_CHF_RATE);

      portfolioChartData.push({
        date: formatDate(transaction.date),
        totalInvested: totalInCHF
      });
    });

    // Add current value as final point (today)
    const viacTotal = broker.summary.viac ? broker.summary.viac.total_invested : 0;
    const totalInvestedCHF = viacTotal + (ingDibaTotalCost * EUR_TO_CHF_RATE);
    const totalCurrentValueInCHF = viacTotal + (ingDibaCurrentValue * EUR_TO_CHF_RATE);

    portfolioChartData.push({
      date: formatDate(new Date()),
      totalInvested: totalInvestedCHF,
      currentValue: totalCurrentValueInCHF
    });

    return (
      <div className="accounts-container">
        <div className="accounts-summary">
          <h3 className="accounts-title">Broker Summary</h3>
          <div className="totals-grid">
            {broker.summary.viac && (
              <div className="total-card">
                <div className="total-label">VIAC</div>
                <div className="total-amount positive">
                  {formatCurrency(broker.summary.viac.total_invested, broker.summary.viac.currency)}
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                  Cost Basis
                </div>
              </div>
            )}
            {broker.summary.ing_diba && (
              <div className="total-card">
                <div className="total-label">ING DiBa</div>
                <div className="total-amount positive">
                  {formatCurrency(broker.summary.ing_diba.total_current_value, broker.summary.ing_diba.currency)}
                </div>
                <div style={{ fontSize: '14px', marginTop: '4px', color: '#22c55e' }}>
                  +{formatCurrency(
                    broker.summary.ing_diba.total_current_value - broker.summary.ing_diba.total_invested,
                    broker.summary.ing_diba.currency
                  )} ({((broker.summary.ing_diba.total_current_value - broker.summary.ing_diba.total_invested) / broker.summary.ing_diba.total_invested * 100).toFixed(2)}%)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Value Over Time Chart */}
        <div className="charts-container" style={{ marginTop: '32px' }}>
          <div className="chart-section">
            <h3 className="chart-title">Portfolio Value Over Time</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={portfolioChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#666', fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
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
                            <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.date}</p>
                            {data.totalInvested !== undefined && (
                              <p style={{ margin: 0, color: '#6366f1' }}>
                                Invested: {formatCurrency(data.totalInvested, 'CHF')}
                              </p>
                            )}
                            {data.currentValue !== undefined && (
                              <>
                                <p style={{ margin: 0, marginTop: '4px', color: '#22c55e' }}>
                                  Current: {formatCurrency(data.currentValue, 'CHF')}
                                </p>
                                <p style={{ margin: 0, marginTop: '4px', color: '#f59e0b', fontSize: '12px' }}>
                                  Gain: {formatCurrency(data.currentValue - data.totalInvested, 'CHF')}
                                  ({((data.currentValue - data.totalInvested) / data.totalInvested * 100).toFixed(2)}%)
                                </p>
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalInvested"
                    stroke="#6366f1"
                    strokeWidth={3}
                    name="Total Invested (CHF)"
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentValue"
                    stroke="#22c55e"
                    strokeWidth={3}
                    name="Current Value (CHF)"
                    dot={{ fill: '#22c55e', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ING DiBa Holdings */}
        {broker.holdings.filter(h => h.account === 'ING DiBa').length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">ING DiBa Holdings</h3>
            <div className="accounts-grid">
              {broker.holdings.filter(h => h.account === 'ING DiBa').map((holding) => {
                const hasCurrentValue = holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost * 100) : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span className={`account-badge account-badge-${holding.account.toLowerCase().replace(/ /g, '-')}`}>
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div style={{ fontSize: '14px', marginTop: '4px', color: profitLoss >= 0 ? '#22c55e' : '#ef4444' }}>
                          {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">
                        {holding.shares} shares
                      </span>
                      <span className="account-meta-item">
                        Avg: {formatCurrency(holding.average_cost, holding.currency)}
                      </span>
                    </div>
                    {hasCurrentValue && (
                      <div className="account-meta">
                        <span className="account-meta-item">
                          Cost: {formatCurrency(holding.total_cost, holding.currency)}
                        </span>
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '4px' }}>
                      <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                        ISIN: {holding.isin}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Säule 3a Holdings */}
        {broker.holdings.filter(h => h.account === 'VIAC').length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">Säule 3a Holdings</h3>
            <div className="accounts-grid">
              {broker.holdings.filter(h => h.account === 'VIAC').map((holding) => {
                const hasCurrentValue = holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost * 100) : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span className={`account-badge account-badge-${holding.account.toLowerCase().replace(/ /g, '-')}`}>
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div style={{ fontSize: '14px', marginTop: '4px', color: profitLoss >= 0 ? '#22c55e' : '#ef4444' }}>
                          {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">
                        {holding.shares} shares
                      </span>
                      <span className="account-meta-item">
                        Avg: {formatCurrency(holding.average_cost, holding.currency)}
                      </span>
                    </div>
                    {hasCurrentValue && (
                      <div className="account-meta">
                        <span className="account-meta-item">
                          Cost: {formatCurrency(holding.total_cost, holding.currency)}
                        </span>
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '4px' }}>
                      <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                        ISIN: {holding.isin}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="accounts-list-section">
          <h3 className="accounts-title">Transaction History</h3>
          <div className="transaction-list">
            {broker.transactions.map((transaction, idx) => (
              <div key={idx} className="transaction-item">
                <div className="transaction-date">
                  {formatDate(transaction.date)}
                  <span className="account-badge account-badge-viac">
                    {transaction.type.toUpperCase()}
                  </span>
                </div>
                <div className="transaction-details">
                  <div className="transaction-recipient">
                    {transaction.security}
                  </div>
                  <div className="transaction-description">
                    {transaction.shares} shares @ ${transaction.price_usd.toFixed(2)} USD
                  </div>
                  <div className="transaction-description" style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                    ISIN: {transaction.isin}
                  </div>
                </div>
                <div className="transaction-amount transaction-amount-income">
                  {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderLoansTab = () => {
    if (!loans) {
      return (
        <div className="accounts-container">
          <div className="loading">Loading loan data...</div>
        </div>
      );
    }

    return (
      <div className="accounts-container">
        <div className="accounts-summary">
          <h3 className="accounts-title">Student Loans Summary</h3>
          <div className="totals-grid">
            <div className="total-card">
              <div className="total-label">Total Outstanding</div>
              <div className="total-amount negative" style={{ fontSize: '32px', fontWeight: '700' }}>
                {formatCurrency(loans.summary.total_balance, loans.summary.currency)}
              </div>
            </div>

            {loans.summary.total_monthly_payment > 0 && (
              <div className="total-card">
                <div className="total-label">Monthly Payment</div>
                <div className="total-amount negative" style={{ fontSize: '28px', fontWeight: '700' }}>
                  {formatCurrency(loans.summary.total_monthly_payment, loans.summary.currency)}
                </div>
                <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                  {loans.summary.loan_count} loan{loans.summary.loan_count > 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {loans.loans.length > 0 && (
          <div className="accounts-list-section">
            <h3 className="accounts-title">Loan Details</h3>
            <div className="accounts-grid">
              {loans.loans.map((loan) => (
                <div key={loan.account_number} className="account-card">
                  <div className="account-header">
                    <div className="account-name">{loan.program}</div>
                    <span className="account-badge account-badge-kfw">
                      {loan.currency}
                    </span>
                  </div>
                  <div className="account-balance negative">
                    {formatCurrency(loan.current_balance, loan.currency)}
                  </div>
                  
                  <div className="account-meta" style={{ marginTop: '8px' }}>
                    <span className="account-meta-item">
                      Interest: {loan.interest_rate}%
                    </span>
                    {loan.monthly_payment > 0 && (
                      <span className="account-meta-item">
                        Payment: {formatCurrency(loan.monthly_payment, loan.currency)}
                      </span>
                    )}
                  </div>

                  {loan.deferred_interest > 0 && (
                    <div className="account-meta">
                      <span className="account-meta-item" style={{ color: '#f59e0b' }}>
                        Deferred Interest: {formatCurrency(loan.deferred_interest, loan.currency)}
                      </span>
                    </div>
                  )}

                  <div className="account-meta" style={{ marginTop: '4px' }}>
                    <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                      Account: {loan.account_number}
                    </span>
                  </div>

                  <div className="account-meta">
                    <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                      Contract: {formatDate(loan.contract_date)}
                    </span>
                  </div>

                  <div className="account-meta">
                    <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                      Statement: {formatDate(loan.statement_date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProjectionTab = () => {
    if (!projectionData) {
      return (
        <div className="accounts-container">
          <div className="loading">Loading wealth projection data...</div>
        </div>
      );
    }

    return (
      <div className="accounts-container">
        <div className="accounts-summary">
          <h3 className="accounts-title">Wealth Projection</h3>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            Project your future net worth based on your current savings rate and assumed interest rate.
          </p>
          
          <div className="totals-grid">
            <div className="total-card">
              <div className="total-label">Current Net Worth</div>
              <div className={`total-amount ${projectionData.currentNetWorth >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '32px', fontWeight: '700' }}>
                {formatCurrency(projectionData.currentNetWorth, 'CHF')}
              </div>
            </div>

            <div className="total-card">
              <div className="total-label">Average Monthly Savings (6 months)</div>
              <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(projectionData.averageMonthlySavings, 'CHF')}
              </div>
            </div>

            <div className="total-card">
              <div className="total-label">Average Savings Rate</div>
              <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                {projectionData.averageSavingsRate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <div className="charts-container" style={{ marginTop: '32px' }}>
          <div className="chart-section">
            <h3 className="chart-title">Wealth Projection Calculator</h3>
            <WealthProjectionCalculator 
              projectionData={projectionData}
              formatCurrency={formatCurrency}
            />
          </div>
        </div>
      </div>
    );
  };

  console.log('✅✅✅ Authenticated - showing main app');

  const activeTabConfig = TAB_ITEMS.find(tab => tab.key === activeTab);
  const tabDescription = TAB_DESCRIPTIONS[activeTab] || '';

  return (
    <div className="app">
      <div className="app-layout">
        {renderSidebar()}

        <main className="main-content">
          <div className="content-header">
            <h2>{activeTabConfig?.label || ''}</h2>
            {tabDescription && <p>{tabDescription}</p>}
          </div>
          <div className="tab-content">
            {activeTab === 'current-month' && renderCurrentMonthTab()}
            {activeTab === 'details' && renderDetailsTab()}
            {activeTab === 'charts' && renderChartsTab()}
            {activeTab === 'accounts' && renderAccountsTab()}
            {activeTab === 'broker' && renderBrokerTab()}
            {activeTab === 'loans' && renderLoansTab()}
            {activeTab === 'projection' && renderProjectionTab()}
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
      />
    </div>
  );
}

export default App;
