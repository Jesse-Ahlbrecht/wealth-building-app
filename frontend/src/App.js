import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell } from 'recharts';
import './App.css';

const SAVINGS_GOAL_CHF = 3000; // Monthly savings goal in CHF
const SAVINGS_GOAL_EUR = 3000 / 0.9355; // Monthly savings goal in EUR (converted from CHF)
const SAVINGS_RATE_GOAL = 20; // Target savings rate percentage
const EUR_TO_CHF_RATE = 0.9355; // Exchange rate: 1 EUR = 0.9355 CHF (update as needed)

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
  formatDate
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
  const primaryCurrency = Math.abs(month.currency_totals.EUR || 0) >
    Math.abs(month.currency_totals.CHF || 0) ? 'EUR' : 'CHF';

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
                        {getSortedTransactions(categoryData.transactions, month.month, `income-${category}`).map((transaction, idx) => (
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
                            <div className="transaction-amount transaction-amount-income">
                              +{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                            </div>
                          </div>
                        ))}
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
                        {getSortedTransactions(categoryData.transactions, month.month, category).map((transaction, idx) => (
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
                            <div className="transaction-amount">
                              -{formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                            </div>
                          </div>
                        ))}
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

function App() {
  const [summary, setSummary] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [broker, setBroker] = useState(null);
  const [loans, setLoans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeTab, setActiveTab] = useState('details');
  const [categorySorts, setCategorySorts] = useState({});
  const [chartView, setChartView] = useState('absolute'); // 'absolute' or 'relative'
  const [timeRange, setTimeRange] = useState('all'); // '3m', '6m', '1y', 'all'
  const [selectedMonth, setSelectedMonth] = useState(null); // For drilldown modal
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false); // Include loan payments in savings calculation

  useEffect(() => {
    fetchSummary();
    fetchAccounts();
    fetchBroker();
    fetchLoans();
  }, []);

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

  const fetchSummary = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/summary');
      const data = await response.json();
      setSummary(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching summary:', error);
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/accounts');
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchBroker = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/broker');
      const data = await response.json();
      setBroker(data);
    } catch (error) {
      console.error('Error fetching broker:', error);
    }
  };

  const fetchLoans = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/loans');
      const data = await response.json();
      setLoans(data);
    } catch (error) {
      console.error('Error fetching loans:', error);
    }
  };

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

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading your financial data...</div>
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className="app">
        <div className="header">
          <h1>Wealth Tracker</h1>
          <p>Track your savings and spending</p>
        </div>
        <div className="empty-state">
          <p>No transaction data found.</p>
          <p>Make sure your bank statements are in the correct location.</p>
        </div>
      </div>
    );
  }

  // Prepare data for the chart (reverse to show oldest to newest)
  const chartData = [...summary].reverse().map(month => {
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
  });

  const renderDetailsTab = () => (
    <>
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
        />
      ))}
    </>
  );

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

  return (
    <div className="app">
      <div className="header">
        <h1>Wealth Tracker</h1>
        <p>Your monthly savings and spending breakdown</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          className={`tab ${activeTab === 'charts' ? 'active' : ''}`}
          onClick={() => setActiveTab('charts')}
        >
          Savings Statistics
        </button>
        <button
          className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Accounts
        </button>
        <button
          className={`tab ${activeTab === 'broker' ? 'active' : ''}`}
          onClick={() => setActiveTab('broker')}
        >
          Broker
        </button>
        <button
          className={`tab ${activeTab === 'loans' ? 'active' : ''}`}
          onClick={() => setActiveTab('loans')}
        >
          Loans
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'details' && renderDetailsTab()}
        {activeTab === 'charts' && renderChartsTab()}
        {activeTab === 'accounts' && renderAccountsTab()}
        {activeTab === 'broker' && renderBrokerTab()}
        {activeTab === 'loans' && renderLoansTab()}
      </div>
    </div>
  );
}

export default App;
