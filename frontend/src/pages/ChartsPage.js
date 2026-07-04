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

import React, { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
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
import { transactionsAPI, predictionsAPI } from '../api';
import {
  formatCurrency,
  formatMonth
} from '../utils';
import { parseSummaryResponse } from '../utils/apiHelpers';
import { getLoanPaymentFromExpenseCategories } from '../utils/categoryHelpers';
import { useCategoryData } from '../hooks';
import {
  getPredictionKey,
  getPredictionMonth,
  fetchPredictionsForMonth,
  fetchAverageEssentialSpending
} from '../utils/predictionHelpers';
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
  const { essentialCategories, availableCategories } = useCategoryData();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [timeRange, setTimeRange] = useState('1y');
  const [chartView, setChartView] = useState('absolute');
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

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
  const plotMetricsRef = useRef(null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await transactionsAPI.getSummary();
      const summaryData = parseSummaryResponse(response);

      setSummary(summaryData);
      setSelectedMonth((currentSelectedMonth) => {
        if (!currentSelectedMonth?.month) {
          return currentSelectedMonth;
        }
        return summaryData.find((item) => item.month === currentSelectedMonth.month) || currentSelectedMonth;
      });
    } catch (err) {
      console.error('Error loading summary:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadAverageEssentialSpending = useCallback(async (month) => {
    try {
      const average = await fetchAverageEssentialSpending(month);
      setAverageEssentialSpending(prev => ({ ...prev, [month]: average }));
    } catch (err) {
      console.error(`Error loading average essential spending for ${month}:`, err);
      setAverageEssentialSpending(prev => ({ ...prev, [month]: 0 }));
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadPredictionsForMonth(selectedMonth.month);
      loadAverageEssentialSpending(selectedMonth.month);
    }
  }, [selectedMonth, loadAverageEssentialSpending]);

  const loadPredictionsForMonth = async (month) => {
    try {
      const predictionsData = await fetchPredictionsForMonth(month);
      setPredictions(prev => ({
        ...prev,
        [month]: predictionsData
      }));
    } catch (err) {
      console.error(`Error loading predictions for ${month}:`, err);
      setPredictions(prev => ({
        ...prev,
        [month]: []
      }));
    }
  };

  const chartData = useMemo(() => summary
    .sort((a, b) => new Date(a.month + '-01') - new Date(b.month + '-01'))
    .map((month) => {
      const expenseCategories = month.expenseCategories || month.expense_categories || {};
      const monthlyLoanPayment = getLoanPaymentFromExpenseCategories(expenseCategories);
      const baseSavings = month.savings || 0;
      const adjustedSavings = includeLoanPayments ? baseSavings + monthlyLoanPayment : baseSavings;
      const income = month.income || 0;
      const adjustedSavingsRate = income > 0 ? ((adjustedSavings / income) * 100) : 0;
      const baseSavingsRate = month.saving_rate || month.savingRate || 0;

      return {
        month: formatMonth(month.month),
        monthKey: month.month,
        savings: adjustedSavings,
        savingRate: includeLoanPayments ? adjustedSavingsRate : baseSavingsRate,
        income,
        expenses: month.expenses || 0,
        loanPayment: monthlyLoanPayment
      };
    }), [summary, includeLoanPayments]);

  const reloadSelectedMonthPredictions = async () => {
    if (selectedMonth) {
      await loadPredictionsForMonth(selectedMonth.month);
    }
  };

  const handleSkipPrediction = async (prediction) => {
    try {
      const month = getPredictionMonth(prediction, selectedMonth?.month);
      await predictionsAPI.skipPredictionForMonth(getPredictionKey(prediction), month);
      await reloadSelectedMonthPredictions();
    } catch (err) {
      console.error('Error skipping prediction:', err);
    }
  };

  const handleDeletePrediction = async (prediction) => {
    try {
      await predictionsAPI.updateRecurringPayment(getPredictionKey(prediction), {
        recipient: prediction.recipient,
        category: prediction.category,
        enabled: false
      });
      await reloadSelectedMonthPredictions();
    } catch (err) {
      console.error('Error deleting prediction:', err);
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

  const filteredData = useMemo(() => {
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
  }, [chartData, selectedRange, timeRange]);

  const refreshPlotMetrics = useCallback(() => {
    if (!chartContainerRef.current || filteredData.length === 0) {
      plotMetricsRef.current = null;
      return;
    }

    const chartWrapper = chartContainerRef.current.querySelector('.recharts-wrapper');
    if (!chartWrapper) {
      plotMetricsRef.current = null;
      return;
    }

    const wrapperRect = chartWrapper.getBoundingClientRect();
    const xAxis = chartWrapper.querySelector('.recharts-cartesian-axis-x');
    const yAxis = chartWrapper.querySelector('.recharts-cartesian-axis-y');

    if (xAxis && yAxis) {
      const yAxisRect = yAxis.getBoundingClientRect();
      const xAxisRect = xAxis.getBoundingClientRect();
      const plotAreaLeft = yAxisRect.right;
      const plotAreaRight = xAxisRect.right;
      const plotAreaTop = yAxisRect.top;
      const plotAreaBottom = xAxisRect.top;
      const plotAreaWidth = plotAreaRight - plotAreaLeft;

      plotMetricsRef.current = {
        plotAreaLeft,
        plotAreaRight,
        plotAreaTop,
        plotAreaBottom,
        barWidth: plotAreaWidth / filteredData.length,
        useWrapperBounds: false,
        wrapperRect
      };
      return;
    }

    const marginLeft = 20;
    const marginRight = 30;
    const marginTop = 20;
    const marginBottom = 20;
    const plotAreaLeft = wrapperRect.left + marginLeft;
    const plotAreaRight = wrapperRect.right - marginRight;
    const plotAreaTop = wrapperRect.top + marginTop;
    const plotAreaBottom = wrapperRect.bottom - marginBottom;

    plotMetricsRef.current = {
      plotAreaLeft,
      plotAreaRight,
      plotAreaTop,
      plotAreaBottom,
      barWidth: (plotAreaRight - plotAreaLeft) / filteredData.length,
      useWrapperBounds: true,
      wrapperRect
    };
  }, [filteredData]);

  useLayoutEffect(() => {
    refreshPlotMetrics();
    window.addEventListener('resize', refreshPlotMetrics);
    return () => window.removeEventListener('resize', refreshPlotMetrics);
  }, [refreshPlotMetrics, chartView, filteredData.length]);

  useEffect(() => {
    const frameId = requestAnimationFrame(refreshPlotMetrics);
    return () => cancelAnimationFrame(frameId);
  }, [filteredData, chartView, refreshPlotMetrics]);

  const getDataIndexFromX = useCallback((clientX, clientY) => {
    const metrics = plotMetricsRef.current;
    if (!metrics || filteredData.length === 0) return null;

    const {
      plotAreaLeft,
      plotAreaRight,
      plotAreaTop,
      plotAreaBottom,
      barWidth,
      useWrapperBounds,
      wrapperRect
    } = metrics;

    if (useWrapperBounds) {
      if (clientX < wrapperRect.left || clientX > wrapperRect.right) return null;
      if (clientY < wrapperRect.top || clientY > wrapperRect.bottom) return null;
    } else {
      if (clientX < plotAreaLeft || clientX > plotAreaRight) return null;
      if (clientY < plotAreaTop || clientY > plotAreaBottom) return null;
    }

    const relativeX = clientX - plotAreaLeft;
    const index = Math.floor(relativeX / barWidth);

    return Math.max(0, Math.min(filteredData.length - 1, index));
  }, [filteredData.length]);

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
              essentialCategories={essentialCategories}
              expandedCategories={expandedCategories}
              setExpandedCategories={setExpandedCategories}
              expandedSections={expandedSections}
              setExpandedSections={setExpandedSections}
              includeLoanPayments={includeLoanPayments}
              predictions={predictions[selectedMonth.month] || []}
              averageEssentialSpending={averageEssentialSpending[selectedMonth.month] || 0}
              onSkipPrediction={handleSkipPrediction}
              onDeletePrediction={handleDeletePrediction}
              onPredictionChanged={reloadSelectedMonthPredictions}
              availableCategories={availableCategories}
              onTransactionCategoryUpdated={loadSummary}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartsPage;
