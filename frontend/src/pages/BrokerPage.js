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

const BrokerPage = () => {
  const [broker, setBroker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ingDibaPurchaseDate, setIngDibaPurchaseDate] = useState(null);
  const [showPurchaseDateModal, setShowPurchaseDateModal] = useState(false);
  const [purchaseDateInput, setPurchaseDateInput] = useState('');
  const [historicalValuation, setHistoricalValuation] = useState(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Load broker data on mount
  useEffect(() => {
    loadBroker();
  }, []);

  const loadBroker = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await brokerAPI.getBroker();
      console.log('Broker API response:', data);
      console.log('Broker summary:', data?.summary);
      console.log('Broker holdings:', data?.holdings);
      console.log('Broker transactions:', data?.transactions);
      setBroker(data);
    } catch (err) {
      console.error('Error loading broker data:', err);
      setError(err.message || 'Failed to load broker data');
    } finally {
      setLoading(false);
    }
  };

  // Load purchase date from localStorage on mount
  useEffect(() => {
    const storedDate = localStorage.getItem('ingDibaPurchaseDate');
    if (storedDate) {
      setIngDibaPurchaseDate(new Date(storedDate));
    }
  }, []);

  // Check if purchase date is needed when broker data loads
  useEffect(() => {
    if (!broker) return;
    
    const holdings = broker.holdings || [];
    const ingDibaHoldings = holdings.filter((h) => h.account === 'ING DiBa');
    
    // Check if we have ING DiBa holdings but no purchase date
    if (ingDibaHoldings.length > 0) {
      const storedDate = localStorage.getItem('ingDibaPurchaseDate');
      const holdingDate = ingDibaHoldings[0].purchase_date;
      
      // If we already have a purchase date set, don't do anything
      if (ingDibaPurchaseDate) return;
      
      // If no date in holdings and no stored date, show modal
      if (!holdingDate && !storedDate) {
        setShowPurchaseDateModal(true);
      } else if (holdingDate) {
        // Use date from holdings if available
        setIngDibaPurchaseDate(new Date(holdingDate));
      } else if (storedDate) {
        // Use stored date
        setIngDibaPurchaseDate(new Date(storedDate));
      }
    }
  }, [broker, ingDibaPurchaseDate]);

  const handlePurchaseDateSubmit = () => {
    if (purchaseDateInput) {
      const date = new Date(purchaseDateInput);
      if (!isNaN(date.getTime())) {
        setIngDibaPurchaseDate(date);
        localStorage.setItem('ingDibaPurchaseDate', date.toISOString());
        setShowPurchaseDateModal(false);
        setPurchaseDateInput('');
      }
    }
  };

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
          <button onClick={loadBroker} className="btn-secondary" style={{ marginTop: '16px' }}>
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

  // Get ING DiBa purchase date - prefer stored date over holdings date
  const ingDibaHoldings = holdings.filter((h) => h.account === 'ING DiBa');
  const finalPurchaseDate = ingDibaPurchaseDate || 
    (ingDibaHoldings.length > 0 && ingDibaHoldings[0].purchase_date
      ? new Date(ingDibaHoldings[0].purchase_date)
      : null);

  // Prepare chart data for total portfolio value over time
  const portfolioChartData = [];
  let cumulativeInvestedCHF = 0;
  let cumulativeInvestedEUR = 0;
  const ingDibaTotalCost = summary.ing_diba ? summary.ing_diba.total_invested : 0;
  const ingDibaCurrentValue = summary.ing_diba ? summary.ing_diba.total_current_value : 0;
  const viacTotal = summary.viac ? summary.viac.total_invested : 0;

  // Sort transactions by date
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Start from ING DiBa purchase date if available
  if (finalPurchaseDate) {
    // Day before ING DiBa purchase
    portfolioChartData.push({
      date: formatDate(new Date(finalPurchaseDate.getTime() - 24 * 60 * 60 * 1000)),
      totalInvested: 0
    });

    // ING DiBa purchase date
    cumulativeInvestedEUR = ingDibaTotalCost;
    portfolioChartData.push({
      date: formatDate(finalPurchaseDate),
      totalInvested: ingDibaTotalCost * EUR_TO_CHF_RATE
    });
  } else if (sortedTransactions.length > 0) {
    // Fallback to first transaction if no ING DiBa date
    const firstDate = new Date(sortedTransactions[0].date);
    portfolioChartData.push({
      date: formatDate(new Date(firstDate.getTime() - 24 * 60 * 60 * 1000)),
      totalInvested: 0
    });
  } else if (ingDibaTotalCost > 0 || viacTotal > 0) {
    // If we have holdings but no transactions, start from 30 days ago
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    portfolioChartData.push({
      date: formatDate(startDate),
      totalInvested: 0
    });
  }

  // Build cumulative investment data from VIAC transactions
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
  // If no transactions, use the summary totals directly
  if (sortedTransactions.length === 0 && (ingDibaTotalCost > 0 || viacTotal > 0)) {
    const totalInvestedCHF = viacTotal + ingDibaTotalCost * EUR_TO_CHF_RATE;
    const totalCurrentValueInCHF = viacTotal + (ingDibaCurrentValue || ingDibaTotalCost) * EUR_TO_CHF_RATE;
    
    portfolioChartData.push({
      date: formatDate(new Date()),
      totalInvested: totalInvestedCHF,
      currentValue: totalCurrentValueInCHF
    });
  } else if (sortedTransactions.length > 0) {
    // Add final point with current values
    const totalInvestedCHF = viacTotal + ingDibaTotalCost * EUR_TO_CHF_RATE;
    const totalCurrentValueInCHF = viacTotal + ingDibaCurrentValue * EUR_TO_CHF_RATE;

    portfolioChartData.push({
      date: formatDate(new Date()),
      totalInvested: totalInvestedCHF,
      currentValue: totalCurrentValueInCHF
    });
  }

  return (
    <div className="accounts-container">
      {/* Purchase Date Modal */}
      {showPurchaseDateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowPurchaseDateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              {finalPurchaseDate ? 'Edit ING DiBa Purchase Date' : 'ING DiBa Purchase Date Required'}
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
              {finalPurchaseDate
                ? 'Update the purchase date for your ING DiBa holdings to accurately display the portfolio value over time.'
                : 'Please specify the purchase date for your ING DiBa holdings to accurately display the portfolio value over time.'}
            </p>
            <input
              type="date"
              value={purchaseDateInput}
              onChange={(e) => setPurchaseDateInput(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: '4px',
                fontSize: '14px',
                marginBottom: '16px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPurchaseDateModal(false);
                  setPurchaseDateInput('');
                }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePurchaseDateSubmit}
                disabled={!purchaseDateInput}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: purchaseDateInput ? '#1a1a1a' : '#d1d5db',
                  color: 'white',
                  cursor: purchaseDateInput ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="accounts-summary">
        <h3 className="accounts-title">Broker Summary</h3>
        {/* Portfolio Total Card - Full width at top */}
        {((summary.viac && summary.viac.total_invested > 0) || (summary.ing_diba && (summary.ing_diba.total_current_value > 0 || summary.ing_diba.total_invested > 0))) && (
          <div style={{ marginBottom: '24px' }}>
            <div className="total-card" style={{ maxWidth: '400px' }}>
              <div className="total-label">Portfolio Total</div>
              <div className="total-amount positive">
                {formatCurrency(
                  (summary.viac ? summary.viac.total_invested : 0) +
                  ((summary.ing_diba && summary.ing_diba.total_current_value) ? summary.ing_diba.total_current_value * EUR_TO_CHF_RATE : 
                   (summary.ing_diba && summary.ing_diba.total_invested) ? summary.ing_diba.total_invested * EUR_TO_CHF_RATE : 0),
                  'CHF'
                )}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                Invested: {formatCurrency(
                  (summary.viac ? summary.viac.total_invested : 0) +
                  (summary.ing_diba ? summary.ing_diba.total_invested * EUR_TO_CHF_RATE : 0),
                  'CHF'
                )}
              </div>
            </div>
          </div>
        )}
        {/* Account Cards - Below total */}
        <div className="totals-grid">
          {summary.viac && (
            <div className="total-card">
              <div className="total-label">VIAC</div>
              <div className="total-amount positive">
                {formatCurrency(summary.viac.total_invested, summary.viac.currency)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>Cost Basis</div>
            </div>
          )}
          {summary.ing_diba && (
            <div className="total-card">
              <div className="total-label">ING DiBa</div>
              <div className="total-amount positive">
                {formatCurrency(summary.ing_diba.total_current_value, summary.ing_diba.currency)}
              </div>
              <div style={{ fontSize: '14px', marginTop: '4px', color: '#22c55e' }}>
                +
                {formatCurrency(
                  summary.ing_diba.total_current_value - summary.ing_diba.total_invested,
                  summary.ing_diba.currency
                )}{' '}
                (
                {(
                  ((summary.ing_diba.total_current_value - summary.ing_diba.total_invested) /
                    summary.ing_diba.total_invested) *
                  100
                ).toFixed(2)}
                %)
              </div>
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
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
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
                            <p style={{ margin: 0, color: '#6366f1', fontSize: '14px' }}>
                              Invested: {formatCurrency(data.invested, 'CHF')}
                            </p>
                            {hasValue ? (
                              <>
                                <p
                                  style={{
                                    margin: 0,
                                    marginTop: '4px',
                                    color: '#22c55e',
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
                                      color: gain >= 0 ? '#22c55e' : '#ef4444',
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
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#colorInvested)"
                    name="Total Invested (CHF)"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#22c55e"
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
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No chart data available. Upload broker statements to see portfolio value over time.
            </div>
          )}
        </div>
      </div>

      {/* ING DiBa Holdings */}
      {holdings.filter((h) => h.account === 'ING DiBa').length > 0 && (
        <div className="accounts-list-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="accounts-title" style={{ margin: 0 }}>ING DiBa Holdings</h3>
            {finalPurchaseDate && (
              <button
                onClick={() => {
                  setPurchaseDateInput(finalPurchaseDate.toISOString().split('T')[0]);
                  setShowPurchaseDateModal(true);
                }}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#666'
                }}
                title="Edit purchase date"
              >
                Edit Purchase Date
              </button>
            )}
          </div>
          <div className="accounts-grid">
            {holdings
              .filter((h) => h.account === 'ING DiBa')
              .map((holding) => {
                const hasCurrentValue =
                  holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost) * 100 : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span
                        className={`account-badge account-badge-${holding.account
                          .toLowerCase()
                          .replace(/ /g, '-')}`}
                      >
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            marginTop: '4px',
                            color: profitLoss >= 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">{holding.shares} shares</span>
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
      {holdings.filter((h) => h.account === 'VIAC').length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">Säule 3a Holdings</h3>
          <div className="accounts-grid">
            {holdings
              .filter((h) => h.account === 'VIAC')
              .map((holding) => {
                const hasCurrentValue =
                  holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost) * 100 : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span
                        className={`account-badge account-badge-${holding.account
                          .toLowerCase()
                          .replace(/ /g, '-')}`}
                      >
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            marginTop: '4px',
                            color: profitLoss >= 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">{holding.shares} shares</span>
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
          {transactions.map((transaction, idx) => (
            <div key={idx} className="transaction-item">
              <div className="transaction-date">
                {formatDate(transaction.date)}
                <span className="account-badge account-badge-viac">{transaction.type.toUpperCase()}</span>
              </div>
              <div className="transaction-details">
                <div className="transaction-recipient">{transaction.security}</div>
                <div className="transaction-description">
                  {transaction.shares} shares @ ${transaction.price_usd.toFixed(2)} USD
                </div>
                <div
                  className="transaction-description"
                  style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}
                >
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

export default BrokerPage;

