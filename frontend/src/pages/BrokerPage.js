import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { brokerAPI } from '../api';
import { formatCurrency, formatDate, EUR_TO_CHF_RATE } from '../utils';
import { useBrokerData } from '../hooks';

const BrokerPage = () => {
  const { broker, loading, error, reloadBroker } = useBrokerData();
  const [historicalValuation, setHistoricalValuation] = useState(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Fetch historical valuation data
  useEffect(() => {
    const fetchHistoricalValuation = async () => {
      if (!broker) return;

      setLoadingHistorical(true);
      try {
        const data = await brokerAPI.getHistoricalValuation();
        setHistoricalValuation(data);
      } catch (error) {
        console.error('Error fetching historical valuation:', error);
        setHistoricalValuation(null);
      } finally {
        setLoadingHistorical(false);
      }
    };

    fetchHistoricalValuation();
  }, [broker]);

  // Aggregate historical valuation to one point per month for evenly spaced X axis,
  // generating a continuous monthly series between first and last data point
  const monthlyHistoricalSeries =
    historicalValuation && Array.isArray(historicalValuation.time_series)
      ? (() => {
        const series = historicalValuation.time_series
          .filter((p) => p && p.date)
          .slice()
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (series.length === 0) return [];

        const firstDate = new Date(series[0].date);
        const lastDate = new Date(series[series.length - 1].date);

        // Normalize to first day of month
        firstDate.setDate(1);
        lastDate.setDate(1);

        const result = [];
        let currentMonth = new Date(firstDate.getTime());
        let seriesIndex = 0;
        let lastPoint = null;

        while (currentMonth <= lastDate) {
          const monthKey = `${currentMonth.getFullYear()}-${String(
            currentMonth.getMonth() + 1
          ).padStart(2, '0')}`;

          // Advance through series up to and including this month
          while (seriesIndex < series.length) {
            const point = series[seriesIndex];
            const pointMonthKey = point.date.slice(0, 7);
            if (pointMonthKey <= monthKey) {
              lastPoint = point;
              seriesIndex += 1;
            } else {
              break;
            }
          }

          if (lastPoint) {
            result.push({
              ...lastPoint,
              month: monthKey,
              // Add a numeric timestamp for proper sorting and as a fallback dataKey
              monthTimestamp: currentMonth.getTime(),
              // Add month index for X-axis ordering
              monthIndex: result.length
            });
          }

          // Move to next month
          currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // Ensure result is sorted by monthTimestamp (should already be, but be explicit)
        result.sort((a, b) => (a.monthTimestamp || 0) - (b.monthTimestamp || 0));

        // Reassign monthIndex after sorting to ensure sequential 0, 1, 2, 3...
        result.forEach((item, index) => {
          item.monthIndex = index;
        });

        // Interpolate/extrapolate portfolio value proportionally to invested amount
        if (result.length > 0) {
          // Check if we have any values from backend
          const hasBackendValues = result.some(item => item.value !== null && item.value !== undefined && item.value > 0);

          if (!hasBackendValues) {
            // No backend values - use simple interpolation from initial to final invested
            const initialInvested = result[0].invested || 0;
            const finalInvested = result[result.length - 1].invested || 0;

            if (result.length > 1 && finalInvested > initialInvested) {
              const totalMonths = result.length - 1;
              result.forEach((item, index) => {
                const currentInvested = item.invested || 0;
                if (totalMonths > 0) {
                  const t = index / totalMonths;
                  const smoothT = t * t * (3 - 2 * t);
                  item.value = initialInvested + (finalInvested - initialInvested) * smoothT;
                } else {
                  item.value = currentInvested;
                }
              });
            } else {
              // Set value to invested if no interpolation needed
              result.forEach((item) => {
                item.value = item.invested || 0;
              });
            }
          } else {
            // We have backend values - interpolate proportionally to invested amount
            const finalInvested = result[result.length - 1].invested || 0;

            // Find final portfolio value (from backend)
            let finalValue = null;
            for (let i = result.length - 1; i >= 0; i--) {
              if (result[i].value !== null && result[i].value !== undefined && result[i].value > 0) {
                finalValue = result[i].value;
                break;
              }
            }

            // Interpolate from initial investment to final value proportionally
            if (finalValue !== null && finalValue !== undefined && result.length > 1 && finalInvested > 0) {
              const returnRatio = finalValue / finalInvested;
              const totalMonths = result.length - 1;

              result.forEach((item, index) => {
                const currentInvested = item.invested || 0;

                if (totalMonths > 0 && currentInvested > 0) {
                  // Calculate time progress (0 to 1)
                  const t = index / totalMonths;

                  // Polynomial interpolation using smoothstep (cubic S-curve)
                  const smoothT = t * t * (3 - 2 * t);

                  // Interpolate the return ratio from 1.0 (no return) to final return ratio
                  const interpolatedRatio = 1.0 + (returnRatio - 1.0) * smoothT;

                  // Apply the interpolated ratio to the current invested amount
                  item.value = currentInvested * interpolatedRatio;
                } else if (currentInvested > 0) {
                  // Fallback: use invested amount if we can't interpolate
                  item.value = currentInvested;
                }
              });
            } else {
              // Ensure all items have a value
              result.forEach((item) => {
                if (item.value === null || item.value === undefined) {
                  item.value = item.invested || 0;
                }
              });
            }
          }
        }

        return result;
      })()
      : [];

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading broker data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="accounts-container">
        <div className="error-message">
          {error}
          <button onClick={reloadBroker} className="btn-secondary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!broker) {
    return (
      <div className="accounts-container">
        <div className="empty-state">
          <h3>No Broker Data</h3>
          <p>Upload broker statements to see your investment information here.</p>
        </div>
      </div>
    );
  }

  // Ensure holdings and transactions are arrays, and summary exists
  const holdings = broker.holdings || [];
  const transactions = broker.transactions || [];
  const summary = broker.summary || {};

  // Prepare chart data for total portfolio value over time
  const portfolioChartData = [];
  let cumulativeInvestedCHF = 0;
  let cumulativeInvestedEUR = 0;
  const ibkrSummary = summary.interactive_brokers || null;
  const ibkrTotalValue = ibkrSummary ? ibkrSummary.total_value_chf : 0;
  const ibkrHoldings = holdings.filter((h) => h.account === 'Interactive Brokers');

  // Sort transactions by date
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  if (sortedTransactions.length > 0) {
    const firstDate = new Date(sortedTransactions[0].date);
    portfolioChartData.push({
      date: formatDate(new Date(firstDate.getTime() - 24 * 60 * 60 * 1000)),
      totalInvested: 0
    });
  } else if (ibkrTotalValue > 0) {
    // If we have holdings but no transactions, start from 30 days ago
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    portfolioChartData.push({
      date: formatDate(startDate),
      totalInvested: 0
    });
  }

  sortedTransactions.forEach((transaction) => {
    if (transaction.currency === 'CHF') {
      cumulativeInvestedCHF += Math.abs(transaction.amount);
    } else if (transaction.currency === 'EUR') {
      cumulativeInvestedEUR += Math.abs(transaction.amount);
    }

    // Convert to CHF for total
    const totalInCHF = cumulativeInvestedCHF + cumulativeInvestedEUR * EUR_TO_CHF_RATE;

    portfolioChartData.push({
      date: formatDate(transaction.date),
      totalInvested: totalInCHF
    });
  });

  // Add current value as final point (today)
  if (sortedTransactions.length === 0 && ibkrTotalValue > 0) {
    portfolioChartData.push({
      date: formatDate(new Date()),
      totalInvested: 0,
      currentValue: ibkrTotalValue
    });
  } else if (sortedTransactions.length > 0) {
    const totalInvestedCHF = cumulativeInvestedCHF + cumulativeInvestedEUR * EUR_TO_CHF_RATE;

    portfolioChartData.push({
      date: formatDate(new Date()),
      totalInvested: totalInvestedCHF,
      currentValue: ibkrTotalValue
    });
  }

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Broker Summary</h3>
        <div className="totals-grid">
          {ibkrSummary && (
            <div className="total-card">
              <div className="total-label">Interactive Brokers</div>
              <div className="total-amount positive">
                {formatCurrency(ibkrSummary.total_value_chf, 'CHF')}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                Holdings: {formatCurrency(ibkrSummary.total_invested_chf, 'CHF')}
                {ibkrSummary.total_invested_eur > 0 && (
                  <> + {formatCurrency(ibkrSummary.total_invested_eur, 'EUR')}</>
                )}
              </div>
              {(ibkrSummary.cash_balances?.CHF || ibkrSummary.cash_balances?.EUR) && (
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                  Cash:
                  {ibkrSummary.cash_balances.CHF ? ` ${formatCurrency(ibkrSummary.cash_balances.CHF, 'CHF')}` : ''}
                  {ibkrSummary.cash_balances.EUR ? ` ${formatCurrency(ibkrSummary.cash_balances.EUR, 'EUR')}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Value Over Time Chart */}
      <div className="charts-container" style={{ marginTop: '32px' }}>
        <div className="chart-section">
          <h3 className="chart-title">Portfolio Valuation Over Time</h3>
          {loadingHistorical ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Loading historical market data...
            </div>
          ) : (monthlyHistoricalSeries && monthlyHistoricalSeries.length > 0) ? (
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={600}>
                <AreaChart
                  data={monthlyHistoricalSeries}
                  margin={{ top: 50, right: 30, left: 60, bottom: 60 }}
                >
                  <defs>
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34c759" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#34c759" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  {/* Month axis - directly under chart */}
                  <XAxis
                    dataKey="month"
                    type="category"
                    tick={{ fill: '#666', fontSize: 10 }}
                    height={35}
                    interval={0}
                    tickMargin={5}
                    allowDuplicatedCategory={false}
                    tickFormatter={(monthKey) => {
                      if (!monthKey || typeof monthKey !== 'string') return '';
                      const [year, month] = monthKey.split('-');
                      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
                      return date.toLocaleDateString(undefined, { month: 'short' });
                    }}
                  />
                  {/* Year axis - below months, centered with bracket */}
                  <XAxis
                    dataKey="month"
                    type="category"
                    xAxisId="year"
                    orientation="bottom"
                    height={40}
                    interval={0}
                    tickMargin={0}
                    tickLine={false}
                    axisLine={false}
                    allowDuplicatedCategory={false}
                    tick={(props) => {
                      const { x, y, payload, index, width } = props;
                      if (!payload || !payload.value) return null;
                      const monthKey = payload.value;
                      if (typeof monthKey !== 'string') return null;
                      const [year] = monthKey.split('-');

                      // Check if this is the first month of this year
                      const isFirstMonthOfYear = index === 0 ||
                        (index > 0 && monthlyHistoricalSeries[index - 1]?.month)?.split('-')[0] !== year;

                      // Show bracket for first month of each year
                      if (isFirstMonthOfYear) {
                        // Find the last month of this year (December or last available month)
                        let lastMonthIndex = index;
                        for (let i = index + 1; i < monthlyHistoricalSeries.length; i++) {
                          const nextMonthKey = monthlyHistoricalSeries[i]?.month;
                          if (nextMonthKey) {
                            const [nextYear] = nextMonthKey.split('-');
                            // If we've moved to a different year, stop
                            if (nextYear !== year) {
                              lastMonthIndex = i - 1;
                              break;
                            }
                            // If this is the last item, use it
                            if (i === monthlyHistoricalSeries.length - 1) {
                              lastMonthIndex = i;
                              break;
                            }
                          }
                        }

                        // Calculate the x position of the last month (centered on the tick)
                        const chartWidth = width || 800;
                        const totalMonths = monthlyHistoricalSeries.length;
                        const monthSpacing = chartWidth / totalMonths;
                        // x is already the center of the current month tick
                        const firstMonthX = x;
                        // Calculate the center position of the last month tick
                        const lastMonthX = x + (lastMonthIndex - index) * monthSpacing;
                        const centerX = (firstMonthX + lastMonthX) / 2;
                        const bracketHeight = 8;
                        // Move bracket closer to months (reduce gap)
                        const horizontalLineY = y - 5; // Closer to the month labels above

                        return (
                          <g>
                            {/* Left bracket (vertical line going up from horizontal line, centered on first month) */}
                            <line
                              x1={firstMonthX}
                              y1={horizontalLineY}
                              x2={firstMonthX}
                              y2={horizontalLineY - bracketHeight}
                              stroke="#999"
                              strokeWidth={1.5}
                            />
                            {/* Bottom horizontal line (bracket is open at top, centered on first and last month) */}
                            <line
                              x1={firstMonthX}
                              y1={horizontalLineY}
                              x2={lastMonthX}
                              y2={horizontalLineY}
                              stroke="#999"
                              strokeWidth={1.5}
                            />
                            {/* Right bracket (vertical line going up from horizontal line, centered on last month) */}
                            <line
                              x1={lastMonthX}
                              y1={horizontalLineY}
                              x2={lastMonthX}
                              y2={horizontalLineY - bracketHeight}
                              stroke="#999"
                              strokeWidth={1.5}
                            />
                            {/* Year label */}
                            <text
                              x={centerX}
                              y={y + 18}
                              fill="#666"
                              fontSize={12}
                              fontWeight={600}
                              textAnchor="middle"
                            >
                              {year}
                            </text>
                          </g>
                        );
                      }
                      // Return null for non-first months of year (no tick marks)
                      return null;
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#666', fontSize: 12 }}
                    width={80}
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
                        const hasValue = typeof data.value === 'number';
                        const gain = hasValue ? data.value - data.invested : null;
                        const gainPercent =
                          hasValue && data.invested > 0 ? (gain / data.invested) * 100 : null;

                        // Format date to show month name and year
                        let displayDate = '';
                        if (data.month) {
                          const [year, month] = data.month.split('-');
                          const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
                          displayDate = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                        } else if (data.date) {
                          // Fallback to original date formatting if month is not available
                          const date = new Date(data.date);
                          displayDate = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                        }

                        return (
                          <div
                            style={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e5e5',
                              borderRadius: '8px',
                              padding: '12px'
                            }}
                          >
                            <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>
                              {displayDate}
                            </p>
                            <p style={{ margin: 0, color: '#14b8a6', fontSize: '14px' }}>
                              Invested: {formatCurrency(data.invested, 'CHF')}
                            </p>
                            {hasValue ? (
                              <>
                                <p
                                  style={{
                                    margin: 0,
                                    marginTop: '4px',
                                    color: '#34c759',
                                    fontSize: '14px'
                                  }}
                                >
                                  Portfolio Value: {formatCurrency(data.value, 'CHF')}
                                </p>
                                <div
                                  style={{
                                    marginTop: '8px',
                                    paddingTop: '8px',
                                    borderTop: '1px solid #e5e5e5'
                                  }}
                                >
                                  <p
                                    style={{
                                      margin: 0,
                                      color: gain >= 0 ? '#34c759' : '#ff3b30',
                                      fontSize: '13px',
                                      fontWeight: 600
                                    }}
                                  >
                                    {gain >= 0 ? '+' : ''}
                                    {formatCurrency(gain, 'CHF')}{' '}
                                    ({gainPercent >= 0 ? '+' : ''}
                                    {gainPercent.toFixed(2)}%)
                                  </p>
                                </div>
                              </>
                            ) : (
                              <p
                                style={{
                                  margin: 0,
                                  marginTop: '6px',
                                  fontSize: '12px',
                                  color: '#9ca3af'
                                }}
                              >
                                No market data available for this month yet
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area
                    type="monotone"
                    dataKey="invested"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    fill="url(#colorInvested)"
                    name="Total Invested (CHF)"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#34c759"
                    strokeWidth={3}
                    fill="url(#colorValue)"
                    name="Portfolio Value (CHF)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : portfolioChartData && portfolioChartData.length > 0 ? (
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
                          <div
                            style={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e5e5',
                              borderRadius: '8px',
                              padding: '12px'
                            }}
                          >
                            <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.date}</p>
                            {data.totalInvested !== undefined && (
                              <p style={{ margin: 0, color: '#14b8a6' }}>
                                Invested: {formatCurrency(data.totalInvested, 'CHF')}
                              </p>
                            )}
                            {data.currentValue !== undefined && (
                              <>
                                <p style={{ margin: 0, marginTop: '4px', color: '#34c759' }}>
                                  Current: {formatCurrency(data.currentValue, 'CHF')}
                                </p>
                                <p style={{ margin: 0, marginTop: '4px', color: '#ff9f0a', fontSize: '12px' }}>
                                  Gain: {formatCurrency(data.currentValue - data.totalInvested, 'CHF')} (
                                  {(((data.currentValue - data.totalInvested) / data.totalInvested) * 100).toFixed(2)}%)
                                </p>
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="totalInvested"
                    stroke="#14b8a6"
                    strokeWidth={3}
                    name="Total Invested (CHF)"
                    dot={{ fill: '#14b8a6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentValue"
                    stroke="#34c759"
                    strokeWidth={3}
                    name="Current Value (CHF)"
                    dot={{ fill: '#34c759', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No chart data available. Upload broker statements to see portfolio value over time.
            </div>
          )}
        </div>
      </div>

      {/* Interactive Brokers Holdings */}
      {ibkrHoldings.length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">Interactive Brokers Holdings</h3>
          <div className="accounts-grid">
            {ibkrHoldings.map((holding) => (
              <div key={`${holding.account}-${holding.isin || holding.symbol}`} className="account-card">
                <div className="account-header">
                  <div className="account-name">{holding.security}</div>
                  <span className="account-badge account-badge-interactive-brokers">
                    {holding.currency}
                  </span>
                </div>
                <div className="account-balance positive">
                  {formatCurrency(holding.total_cost, holding.currency)}
                </div>
                <div className="account-meta" style={{ marginTop: '8px' }}>
                  <span className="account-meta-item">{holding.shares} shares</span>
                  {holding.symbol && (
                    <span className="account-meta-item">{holding.symbol}</span>
                  )}
                </div>
                {holding.isin && (
                  <div className="account-meta" style={{ marginTop: '4px' }}>
                    <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                      ISIN: {holding.isin}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="accounts-list-section">
        <h3 className="accounts-title">Transaction History</h3>
        <div className="transaction-list">
          {transactions.map((transaction, idx) => (
            <div key={idx} className="transaction-item">
              <div className="transaction-date">
                {formatDate(transaction.date)}
                <span className="account-badge account-badge-interactive-brokers">
                  {(transaction.type || 'trade').toUpperCase()}
                </span>
              </div>
              <div className="transaction-details">
                <div className="transaction-recipient">{transaction.security}</div>
                {transaction.shares ? (
                  <div className="transaction-description">
                    {transaction.shares} shares
                    {transaction.symbol ? ` (${transaction.symbol})` : ''}
                  </div>
                ) : null}
                {transaction.category && (
                  <div className="transaction-description">{transaction.category}</div>
                )}
                {transaction.matched_bank_transfer && (
                  <div className="transaction-description" style={{ fontSize: '11px', color: '#666' }}>
                    Matched {transaction.matched_bank_transfer.account} transfer on{' '}
                    {formatDate(transaction.matched_bank_transfer.date)}
                  </div>
                )}
                {transaction.isin && (
                  <div
                    className="transaction-description"
                    style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}
                  >
                    ISIN: {transaction.isin}
                  </div>
                )}
              </div>
              <div className={`transaction-amount ${transaction.amount < 0 ? 'transaction-amount-expense' : 'transaction-amount-income'}`}>
                {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrokerPage;

