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

import React, { useCallback, useMemo, useState } from 'react';
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
import { formatCurrency } from '../utils';
import { buildMonthlySavingsPoint, sortMonthsChronologically } from '../utils/chartDataHelpers';
import { scrollToDrilldown, selectMonthFromChart } from '../utils/domHelpers';
import { CHART_MARGIN, CHART_TOOLTIP_STYLE } from '../utils/chartConstants';
import { useCategoryData, useTransactionSummary, useMonthPredictions, useRecurringPayments, usePreferenceState, useMonthDrilldownPanelProps, useDateRangeSelection } from '../hooks';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_RATE_GOAL,
  formatSavingsAmountGoalMeta,
  formatSavingRateGoalMeta,
  getColorForPercentage
} from '../utils/finance';
import MonthDrilldownPanel from '../components/MonthDrilldownPanel';
import ChartPageStates from '../components/ChartPageStates';
import DateRangeToggle from '../components/DateRangeToggle';
import SegmentedControl from '../components/SegmentedControl';
import { useAppContext } from '../context/AppContext';

const CHART_VIEW_OPTIONS = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'relative', label: 'Rate' }
];

const lightenColor = (color, amount) => {
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = Math.min(255, Math.round(parseInt(rgbMatch[1], 10) + (255 - parseInt(rgbMatch[1], 10)) * amount));
    const g = Math.min(255, Math.round(parseInt(rgbMatch[2], 10) + (255 - parseInt(rgbMatch[2], 10)) * amount));
    const b = Math.min(255, Math.round(parseInt(rgbMatch[3], 10) + (255 - parseInt(rgbMatch[3], 10)) * amount));
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

const ChartsPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const { essentialCategories, availableCategories, refreshCategories } = useCategoryData();
  const {
    summary,
    loading,
    error,
    loadSummary,
    refreshSummary,
    selectedMonth,
    setSelectedMonth
  } = useTransactionSummary({ syncSelectedMonth: true });

  const [chartView, setChartView] = usePreferenceState(
    'charts_chartView',
    'absolute',
    preferences,
    updatePreferences
  );
  const selectedMonthKey = selectedMonth?.month;
  const {
    predictions,
    averageEssentialSpending,
    reloadPredictions,
    handleSkipPrediction,
    handleDeletePrediction
  } = useMonthPredictions(selectedMonthKey);
  const { recurringPayments } = useRecurringPayments();

  const [hoveredIndex, setHoveredIndex] = useState(null);

  const chartData = useMemo(
    () => sortMonthsChronologically(summary).map((month) =>
      buildMonthlySavingsPoint(month, essentialCategories)
    ),
    [summary, essentialCategories]
  );

  const handleMonthClickFromDrag = useCallback((monthData) => {
    const fullMonthData = summary.find((month) => month.month === monthData.monthKey);
    if (fullMonthData) {
      setSelectedMonth(fullMonthData);
      setTimeout(scrollToDrilldown, 100);
    }
  }, [summary, setSelectedMonth]);

  const {
    filteredData,
    timeRange,
    selectedRange,
    isSelecting,
    hasMoved,
    showCustomHelp,
    chartContainerRef,
    customButtonRef,
    handleTimeRangeChange,
    handleCustomClick,
    handleMouseDown
  } = useDateRangeSelection(chartData, {
    onMonthClick: handleMonthClickFromDrag,
    rerenderDeps: [chartView]
  });

  const drilldownPanelProps = useMonthDrilldownPanelProps({
    selectedMonth,
    setSelectedMonth,
    defaultCurrency,
    essentialCategories,
    availableCategories,
    predictions,
    recurringPayments,
    averageEssentialSpending,
    handleSkipPrediction,
    handleDeletePrediction,
    reloadPredictions,
    refreshSummary,
    refreshCategories
  });

  const totalSavings = filteredData.reduce((sum, month) => sum + month.savings, 0);
  const avgSavings = filteredData.length ? totalSavings / filteredData.length : 0;
  const totalSavingRate = filteredData.reduce((sum, month) => sum + month.savingRate, 0);
  const avgSavingRate = filteredData.length ? totalSavingRate / filteredData.length : 0;
  const avgSavingsGoalMeta = formatSavingsAmountGoalMeta(avgSavings, 'CHF');
  const avgSavingRateGoalMeta = formatSavingRateGoalMeta(avgSavingRate);

  return (
    <ChartPageStates
      loading={loading}
      error={error}
      isEmpty={!loading && !error && chartData.length === 0}
      onRetry={loadSummary}
      loadingMessage="Loading chart data..."
      emptyMessage="Upload bank statements to see your savings statistics here."
    >
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
                        color: avgSavingsGoalMeta.color
                      }}
                    >
                      {formatCurrency(avgSavings, 'CHF')}
                    </span>
                    <span className="chart-meta-subtle">
                      ({avgSavingsGoalMeta.label})
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
                        color: avgSavingRateGoalMeta.color
                      }}
                    >
                      {avgSavingRate.toFixed(1)}%
                    </span>
                    <span className="chart-meta-subtle">
                      ({avgSavingRateGoalMeta.percentOfGoal}% of goal)
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
            <DateRangeToggle
              timeRange={timeRange}
              selectedRange={selectedRange}
              showCustomHelp={showCustomHelp}
              customButtonRef={customButtonRef}
              onTimeRangeChange={handleTimeRangeChange}
              onCustomClick={handleCustomClick}
            />
            <SegmentedControl
              value={chartView}
              onChange={setChartView}
              options={CHART_VIEW_OPTIONS}
              className="chart-toggle"
              buttonClassName="chart-toggle-btn"
              ariaLabel="Chart view"
            />
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
              margin={CHART_MARGIN}
              onMouseMove={(state) => {
                if (state && state.activeTooltipIndex !== undefined) {
                  setHoveredIndex(state.activeTooltipIndex);
                } else {
                  setHoveredIndex(null);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(data) => {
                if (isSelecting || hasMoved) return;

                if (data?.activePayload?.[0]) {
                  selectMonthFromChart(
                    summary,
                    data.activePayload[0].payload,
                    selectedMonth,
                    setSelectedMonth
                  );
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
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value) => {
                  if (chartView === 'absolute') {
                    return [formatCurrency(value, 'CHF'), 'Savings'];
                  }
                  return [`${value.toFixed(1)}%`, 'Savings Rate'];
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
              {chartView === 'absolute' && (
                <ReferenceLine
                  y={SAVINGS_GOAL_CHF}
                  stroke="#ff9f0a"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `Goal: ${formatCurrency(SAVINGS_GOAL_CHF, 'CHF')}`,
                    position: 'insideTopLeft',
                    fill: '#ff9f0a',
                    fontSize: 12,
                    fontWeight: 600,
                    offset: 10
                  }}
                />
              )}
              {chartView === 'absolute' ? (
                <Bar dataKey="savings" radius={[8, 8, 0, 0]} name="Savings">
                  {filteredData.map((entry, index) => {
                    const baseColor = formatSavingsAmountGoalMeta(entry.savings, 'CHF').color;
                    const isHovered = index === hoveredIndex;
                    const fillColor = isHovered ? lightenColor(baseColor, 0.3) : baseColor;
                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
              ) : (
                <Bar dataKey="savingRate" radius={[8, 8, 0, 0]} name="Savings Rate">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savingRate / SAVINGS_RATE_GOAL) * 100;
                    const baseColor = getColorForPercentage(percentage);
                    const isHovered = index === hoveredIndex;
                    const fillColor = isHovered ? lightenColor(baseColor, 0.3) : baseColor;
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

      <MonthDrilldownPanel {...drilldownPanelProps} />
    </div>
    </ChartPageStates>
  );
};

export default ChartsPage;
