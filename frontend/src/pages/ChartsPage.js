/**
 * Charts Page - Fully Restored
 * 
 * Displays savings statistics over time with interactive charts.
 * Features:
 * - Click and drag to select custom time ranges
 * - Click on bars to view month details
 * - Interactive hover states
 * - Month detail view with category breakdown
 * - Essential/non-essential spending analysis
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell
} from 'recharts';
import { transactionsAPI, categoriesAPI, predictionsAPI } from '../api';
import {
  formatCurrency,
  formatMonth
} from '../utils';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_RATE_GOAL,
  getColorForPercentage
} from '../utils/finance';
import MonthSummaryCard from '../components/MonthSummaryCard';
import { useAppContext } from '../context/AppContext';

const ChartsPage = () => {
  // Context
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();

  // Data state
  const [summary, setSummary] = useState([]);
  const [essentialCategories, setEssentialCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [timeRange, setTimeRange] = useState('1y');
  const [chartView, setChartView] = useState('absolute');
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showEssentialSplit, setShowEssentialSplit] = useState(false);

  useEffect(() => {
    if (preferences) {
      if (preferences.charts_chartView) {
        setChartView(preferences.charts_chartView);
      }
      if (preferences.charts_includeLoanPayments !== undefined) {
        setIncludeLoanPayments(preferences.charts_includeLoanPayments);
      }
    }
  }, [preferences]);

  const handleChartViewChange = (view) => {
    setChartView(view);
    updatePreferences({ charts_chartView: view });
  };

  const handleIncludeLoanPaymentsChange = (value) => {
    setIncludeLoanPayments(value);
    updatePreferences({ charts_includeLoanPayments: value });
  };

  // Category management state
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [predictions, setPredictions] = useState({});
  const [averageEssentialSpending, setAverageEssentialSpending] = useState({});

  // Drag selection state
  const chartContainerRef = useRef(null);
  const customButtonRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showCustomHelp, setShowCustomHelp] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadSummary();
    loadEssentialCategories();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await transactionsAPI.getSummary();

      let summaryData = [];
      if (Array.isArray(response)) {
        summaryData = response;
      } else if (response && Array.isArray(response.data)) {
        summaryData = response.data;
      } else if (response && response.summary && Array.isArray(response.summary)) {
        summaryData = response.summary;
      }

      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading summary:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const loadEssentialCategories = async () => {
    try {
      const response = await categoriesAPI.getEssentialCategories();
      const categories = response?.categories || response || [];
      setEssentialCategories(categories);
    } catch (err) {
      console.error('Error loading essential categories:', err);
      // Use defaults if loading fails
      setEssentialCategories(['Rent', 'Insurance', 'Groceries', 'Utilities']);
    }
  };

  const loadAverageEssentialSpending = useCallback(async (month) => {
    try {
      // Calculate average essential spending from previous 3 months
      const sortedMonths = [...summary]
        .sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'));

      const currentMonthIndex = sortedMonths.findIndex(m => m.month === month);
      const startIndex = currentMonthIndex >= 0 ? currentMonthIndex + 1 : 0;
      const previousMonths = sortedMonths.slice(startIndex, startIndex + 3);

      if (previousMonths.length === 0) {
        setAverageEssentialSpending(prev => ({ ...prev, [month]: 0 }));
        return;
      }

      const totals = previousMonths.map(m => {
        if (!m || !m.expenseCategories) return 0;
        return Object.entries(m.expenseCategories)
          .filter(([cat]) => {
            const isLoanPayment = cat.toLowerCase().includes('loan payment');
            if (isLoanPayment) return includeLoanPayments;
            return essentialCategories.some(
              essentialCat => essentialCat.toLowerCase() === cat.toLowerCase()
            );
          })
          .reduce((sum, [, catData]) => {
            const amount = typeof catData === 'number' ? catData : (catData?.total || 0);
            return sum + amount;
          }, 0);
      });

      const average = totals.reduce((a, b) => a + b, 0) / totals.length;
      setAverageEssentialSpending(prev => ({ ...prev, [month]: average }));
    } catch (err) {
      console.error(`Error loading average essential spending for ${month}:`, err);
      setAverageEssentialSpending(prev => ({ ...prev, [month]: 0 }));
    }
  }, [summary, essentialCategories, includeLoanPayments]);

  // Load predictions and average essential spending for selected month
  useEffect(() => {
    if (selectedMonth) {
      loadPredictionsForMonth(selectedMonth.month);
      loadAverageEssentialSpending(selectedMonth.month);
    }
  }, [selectedMonth, essentialCategories, loadAverageEssentialSpending]);

  const loadPredictionsForMonth = async (month) => {
    try {
      const predictionsData = await predictionsAPI.getPredictionsForMonth(month);
      setPredictions(prev => ({
        ...prev,
        [month]: Array.isArray(predictionsData) ? predictionsData : (predictionsData?.data || [])
      }));
    } catch (err) {
      console.error(`Error loading predictions for ${month}:`, err);
      setPredictions(prev => ({
        ...prev,
        [month]: []
      }));
    }
  };

  // Transform summary data for charts
  const chartData = summary
    .sort((a, b) => new Date(a.month + '-01') - new Date(b.month + '-01'))
    .map((month) => {
      // Calculate loan payment amount from expense categories
      let monthlyLoanPayment = 0;
      if (month.expenseCategories || month.expense_categories) {
        const expenseCategories = month.expenseCategories || month.expense_categories || {};
        const loanCategory = Object.keys(expenseCategories).find(cat =>
          cat.toLowerCase().includes('loan payment') || cat.toLowerCase().includes('loan')
        );
        if (loanCategory) {
          const loanData = expenseCategories[loanCategory];
          monthlyLoanPayment = typeof loanData === 'number' ? loanData : (loanData?.total || 0);
        }
      }

      // Calculate adjusted savings based on includeLoanPayments toggle
      const baseSavings = month.savings || 0;
      const adjustedSavings = includeLoanPayments ? baseSavings + monthlyLoanPayment : baseSavings;

      // Calculate adjusted savings rate
      const income = month.income || 0;
      const adjustedSavingsRate = income > 0 ? ((adjustedSavings / income) * 100) : 0;
      const baseSavingsRate = month.saving_rate || month.savingRate || 0;

      return {
        month: formatMonth(month.month),
        monthKey: month.month,
        savings: adjustedSavings,
        savingRate: includeLoanPayments ? adjustedSavingsRate : baseSavingsRate,
        income: income,
        expenses: month.expenses || 0,
        loanPayment: monthlyLoanPayment
      };
    });

  const handleDismissPrediction = async (prediction) => {
    try {
      await predictionsAPI.dismissPrediction(prediction.prediction_key, prediction.recurrence_type);
      // Reload predictions for the selected month
      if (selectedMonth) {
        await loadPredictionsForMonth(selectedMonth.month);
      }
    } catch (err) {
      console.error('Error dismissing prediction:', err);
    }
  };

  // Helper function to lighten a color
  const lightenColor = (color, amount) => {
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = Math.min(255, Math.round(parseInt(rgbMatch[1]) + (255 - parseInt(rgbMatch[1])) * amount));
      const g = Math.min(255, Math.round(parseInt(rgbMatch[2]) + (255 - parseInt(rgbMatch[2])) * amount));
      const b = Math.min(255, Math.round(parseInt(rgbMatch[3]) + (255 - parseInt(rgbMatch[3])) * amount));
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = Math.min(255, Math.round(parseInt(hex.slice(0, 2), 16) + (255 - parseInt(hex.slice(0, 2), 16)) * amount));
      const g = Math.min(255, Math.round(parseInt(hex.slice(2, 4), 16) + (255 - parseInt(hex.slice(2, 4), 16)) * amount));
      const b = Math.min(255, Math.round(parseInt(hex.slice(4, 6), 16) + (255 - parseInt(hex.slice(4, 6), 16)) * amount));
      return `rgb(${r}, ${g}, ${b})`;
    }
    return color;
  };

  // Filter data based on time range or selected range
  const getFilteredData = () => {
    if (selectedRange !== null) {
      const { startIndex, endIndex } = selectedRange;
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex) + 1;
      return chartData.slice(start, end);
    }

    if (timeRange === 'all') return chartData;
    if (timeRange === 'custom') return chartData;

    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    return chartData.slice(-months);
  };

  const filteredData = getFilteredData();

  // Calculate which data point corresponds to an x coordinate
  const getDataIndexFromX = useCallback((clientX, clientY) => {
    if (!chartContainerRef.current || filteredData.length === 0) return null;

    const chartWrapper = chartContainerRef.current.querySelector('.recharts-wrapper');
    if (!chartWrapper) return null;

    const wrapperRect = chartWrapper.getBoundingClientRect();

    const xAxis = chartWrapper.querySelector('.recharts-cartesian-axis-x');
    const yAxis = chartWrapper.querySelector('.recharts-cartesian-axis-y');

    let plotAreaLeft, plotAreaRight, plotAreaTop, plotAreaBottom, plotAreaWidth;

    if (xAxis && yAxis) {
      const yAxisRect = yAxis.getBoundingClientRect();
      const xAxisRect = xAxis.getBoundingClientRect();

      plotAreaLeft = yAxisRect.right;
      plotAreaRight = xAxisRect.right;
      plotAreaBottom = xAxisRect.top;
      plotAreaTop = yAxisRect.top;
      plotAreaWidth = plotAreaRight - plotAreaLeft;

      if (clientX < plotAreaLeft || clientX > plotAreaRight) return null;
      if (clientY < plotAreaTop || clientY > plotAreaBottom) return null;
    } else {
      const marginLeft = 20;
      const marginRight = 30;
      const marginTop = 20;
      const marginBottom = 20;
      plotAreaLeft = wrapperRect.left + marginLeft;
      plotAreaRight = wrapperRect.right - marginRight;
      plotAreaTop = wrapperRect.top + marginTop;
      plotAreaBottom = wrapperRect.bottom - marginBottom;
      plotAreaWidth = plotAreaRight - plotAreaLeft;

      if (clientX < wrapperRect.left || clientX > wrapperRect.right) return null;
      if (clientY < wrapperRect.top || clientY > wrapperRect.bottom) return null;
    }

    const barWidth = plotAreaWidth / filteredData.length;
    const relativeX = clientX - plotAreaLeft;
    const index = Math.floor(relativeX / barWidth);

    return Math.max(0, Math.min(filteredData.length - 1, index));
  }, [filteredData]);

  // Handle mouse down - start selection
  const handleMouseDown = useCallback((e) => {
    const chartElement = e.target.closest('.recharts-wrapper');
    if (!chartElement) return;

    if (e.target.tagName === 'text' && (
      e.target.closest('.recharts-xAxis') ||
      e.target.closest('.recharts-yAxis') ||
      e.target.closest('.recharts-cartesian-axis-tick')
    )) return;

    const isAxisClick = e.target.closest('.recharts-cartesian-axis') ||
      e.target.closest('.recharts-xAxis') ||
      e.target.closest('.recharts-yAxis') ||
      e.target.closest('.recharts-cartesian-axis-tick') ||
      e.target.closest('.recharts-label');
    if (isAxisClick) return;

    const index = getDataIndexFromX(e.clientX, e.clientY);
    if (index === null) return;

    isDraggingRef.current = true;
    setIsSelecting(true);
    setSelectionStart(index);
    setSelectionEnd(index);
    setHasMoved(false);
    e.preventDefault();
  }, [getDataIndexFromX]);

  // Handle mouse move - update selection
  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) {
      const index = getDataIndexFromX(e.clientX, e.clientY);
      setHoveredIndex(index);
      return;
    }

    const index = getDataIndexFromX(e.clientX, e.clientY);
    if (index === null) return;

    setSelectionEnd(index);
    if (index !== selectionStart) {
      setHasMoved(true);
    }
  }, [getDataIndexFromX, selectionStart]);

  // Handle mouse up - finalize selection
  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setIsSelecting(false);

    if (hasMoved && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);

      if (start !== end) {
        setSelectedRange({ startIndex: start, endIndex: end });
        setTimeRange('custom');
      } else {
        const monthData = filteredData[start];
        if (monthData) {
          const fullMonthData = summary.find(m => m.month === monthData.monthKey);
          if (fullMonthData) {
            setSelectedMonth(fullMonthData);
            setTimeout(() => {
              document.getElementById('drilldown-details')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }, 100);
          }
        }
      }
    } else if (selectionStart !== null) {
      const monthData = filteredData[selectionStart];
      if (monthData) {
        const fullMonthData = summary.find(m => m.month === monthData.monthKey);
        if (fullMonthData) {
          setSelectedMonth(fullMonthData);
          setTimeout(() => {
            document.getElementById('drilldown-details')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }, 100);
        }
      }
    }

    setSelectionStart(null);
    setSelectionEnd(null);
    setHasMoved(false);
  }, [hasMoved, selectionStart, selectionEnd, filteredData, summary]);

  // Attach event listeners for mouse move and up
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Handle time range change
  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
    setSelectedRange(null);
    if (range !== 'custom') {
      setShowCustomHelp(false);
    }
  };


  // Calculate averages and totals
  const totalSavings = filteredData.reduce((sum, month) => sum + month.savings, 0);
  const avgSavings = filteredData.length ? totalSavings / filteredData.length : 0;
  const totalSavingRate = filteredData.reduce((sum, month) => sum + month.savingRate, 0);
  const avgSavingRate = filteredData.length ? totalSavingRate / filteredData.length : 0;

  if (loading) {
    return (
      <div className="charts-container">
        <div className="loading">Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="charts-container">
        <div className="error-message">
          {error}
          <button onClick={loadSummary} className="btn-secondary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="charts-container">
        <div className="empty-state">
          <h3>No Data Available</h3>
          <p>Upload bank statements to see your savings statistics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="charts-container charts-layout">
      <div className="chart-section">
        <div className="chart-header-row">
          <div>
            <h3 className="chart-title chart-title-compact">Savings Over Time</h3>
            <div className="chart-meta">
              {chartView === 'absolute' ? (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavings / SAVINGS_GOAL_CHF) * 100)
                      }}
                    >
                      {formatCurrency(avgSavings, 'CHF')}
                    </span>
                    <span className="chart-meta-subtle">
                      ({((avgSavings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal)
                    </span>
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {formatCurrency(totalSavings, 'CHF')}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavingRate / SAVINGS_RATE_GOAL) * 100)
                      }}
                    >
                      {avgSavingRate.toFixed(1)}%
                    </span>
                    <span className="chart-meta-subtle">
                      ({((avgSavingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal)
                    </span>
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {totalSavingRate.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="chart-controls">
            <div className="time-range-selector">
              <button
                className={`time-range-btn ${timeRange === '3m' ? 'active' : ''}`}
                onClick={() => handleTimeRangeChange('3m')}
              >
                3M
              </button>
              <button
                className={`time-range-btn ${timeRange === '6m' ? 'active' : ''}`}
                onClick={() => handleTimeRangeChange('6m')}
              >
                6M
              </button>
              <button
                className={`time-range-btn ${timeRange === '1y' ? 'active' : ''}`}
                onClick={() => handleTimeRangeChange('1y')}
              >
                1Y
              </button>
              <button
                className={`time-range-btn ${timeRange === 'all' ? 'active' : ''}`}
                onClick={() => handleTimeRangeChange('all')}
              >
                All
              </button>
              <div className="custom-range-wrapper">
                <button
                  ref={customButtonRef}
                  className={`time-range-btn ${timeRange === 'custom' || selectedRange !== null ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedRange === null) {
                      setShowCustomHelp(true);
                      handleTimeRangeChange('custom');
                      setTimeout(() => setShowCustomHelp(false), 5000);
                    } else {
                      handleTimeRangeChange('custom');
                    }
                  }}
                  title={selectedRange ? 'Custom range selected' : 'Click to learn how to select a custom range'}
                >
                  Custom
                </button>
                {showCustomHelp && customButtonRef.current && (
                  <div
                    className="custom-range-help"
                  >
                    <div className="custom-range-help-title">
                      Custom Range Selection
                    </div>
                    <div className="custom-range-help-text">
                      Click and drag across bars to select a date range
                    </div>
                    <div className="custom-range-help-tip">
                      Tip: Start from any bar or empty space
                    </div>
                    {/* Arrow pointing up */}
                    <div className="custom-range-help-arrow" />
                    <div className="custom-range-help-arrow-border" />
                  </div>
                )}
              </div>
            </div>
            <div className="chart-toggle">
              <button
                className={`chart-toggle-btn ${chartView === 'absolute' ? 'active' : ''}`}
                onClick={() => handleChartViewChange('absolute')}
              >
                Absolute
              </button>
              <button
                className={`chart-toggle-btn ${chartView === 'relative' ? 'active' : ''}`}
                onClick={() => handleChartViewChange('relative')}
              >
                Rate
              </button>
            </div>
            <div className="loan-payment-toggle">
              <button
                className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
                onClick={() => handleIncludeLoanPaymentsChange(!includeLoanPayments)}
                title="Include monthly loan payments in savings calculation"
              >
                Include Loans
              </button>
            </div>
          </div>
        </div>
        <div
          className={`chart-wrapper ${isSelecting ? 'chart-wrapper-selecting' : ''}`}
          ref={chartContainerRef}
          onMouseDown={handleMouseDown}
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={filteredData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onMouseMove={(state) => {
                if (state && state.activeTooltipIndex !== undefined) {
                  setHoveredIndex(state.activeTooltipIndex);
                } else {
                  setHoveredIndex(null);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(data) => {
                // Don't trigger month selection if we're dragging or just finished dragging
                if (isSelecting || isDraggingRef.current || hasMoved) return;

                if (data && data.activePayload && data.activePayload[0]) {
                  const clickedData = data.activePayload[0].payload;
                  // Find the full month data from summary
                  const monthData = summary.find((m) => m.month === clickedData.monthKey);
                  if (monthData) {
                    setSelectedMonth(monthData);
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" />
              <XAxis
                dataKey="month"
                stroke="var(--color-text-tertiary)"
                angle={-45}
                textAnchor="end"
                height={60}
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="var(--color-text-tertiary)"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => chartView === 'absolute'
                  ? `${(value / 1000).toFixed(0)}k`
                  : `${value}%`
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--color-text-primary)',
                  boxShadow: '0 4px 12px var(--color-shadow-md)'
                }}
                formatter={(value, name) => {
                  if (chartView === 'absolute') {
                    return [formatCurrency(value, 'CHF'), 'Savings'];
                  } else {
                    return [`${value.toFixed(1)}%`, 'Savings Rate'];
                  }
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
              {chartView === 'absolute' && (
                <ReferenceLine
                  y={SAVINGS_GOAL_CHF}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `Goal: ${formatCurrency(SAVINGS_GOAL_CHF, 'CHF')}`,
                    position: 'insideTopLeft',
                    fill: '#f59e0b',
                    fontSize: 12,
                    fontWeight: 600,
                    offset: 10
                  }}
                />
              )}
              {chartView === 'absolute' ? (
                <Bar dataKey="savings" radius={[8, 8, 0, 0]} name="Savings">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savings / SAVINGS_GOAL_CHF) * 100;
                    const baseColor = getColorForPercentage(percentage);

                    const isSelected = isSelecting && selectionStart !== null && selectionEnd !== null &&
                      index >= Math.min(selectionStart, selectionEnd) &&
                      index <= Math.max(selectionStart, selectionEnd);

                    const isHovered = index === hoveredIndex;

                    const fillColor = (isSelected || isHovered) ? lightenColor(baseColor, 0.3) : baseColor;

                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
              ) : (
                <Bar dataKey="savingRate" radius={[8, 8, 0, 0]} name="Savings Rate">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savingRate / SAVINGS_RATE_GOAL) * 100;
                    const baseColor = getColorForPercentage(percentage);

                    const isSelected = isSelecting && selectionStart !== null && selectionEnd !== null &&
                      index >= Math.min(selectionStart, selectionEnd) &&
                      index <= Math.max(selectionStart, selectionEnd);

                    const isHovered = index === hoveredIndex;

                    const fillColor = (isSelected || isHovered) ? lightenColor(baseColor, 0.3) : baseColor;

                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-hint">
          💡 Click on a bar to see details, or drag to select a custom range
        </div>
      </div>

      {/* Category View Toggle - Only show when month is selected */}
      {selectedMonth && (
        <div className="chart-toggle-row">
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
      )}

      {/* Drilldown Details */}
      {selectedMonth && (
        <div id="drilldown-details" className="drilldown-details">
          <button
            className="drilldown-close"
            onClick={() => setSelectedMonth(null)}
            title="Close details"
          >
            ✕
          </button>
          <div className="current-month-container">
            <MonthSummaryCard
              month={selectedMonth}
              isCurrentMonth={false}
              defaultCurrency={defaultCurrency}
              showEssentialSplit={showEssentialSplit}
              essentialCategories={essentialCategories}
              expandedCategories={expandedCategories}
              setExpandedCategories={setExpandedCategories}
              expandedSections={expandedSections}
              setExpandedSections={setExpandedSections}
              allMonthsData={summary}
              includeLoanPayments={includeLoanPayments}
              predictions={predictions[selectedMonth.month] || []}
              averageEssentialSpending={averageEssentialSpending[selectedMonth.month] || 0}
              onDismissPrediction={handleDismissPrediction}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartsPage;
