import React, { useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend
} from 'recharts';
import { selectMonthFromChart } from '../utils/domHelpers';
import { buildCockpitChartData } from '../utils/chartDataHelpers';
import {
  COCKPIT_COLORS,
  COCKPIT_VIEWS,
  CockpitTooltip
} from '../utils/cockpitChartConfig';
import CockpitViewToggle from '../components/CockpitViewToggle';
import { useCategoryData, useTransactionSummary, useMonthPredictions, usePreferenceState } from '../hooks';
import ChartPageStates from '../components/ChartPageStates';
import MonthDrilldownPanel from '../components/MonthDrilldownPanel';
import { useAppContext } from '../context/AppContext';
import { SAVINGS_RATE_GOAL } from '../utils/finance';

const CHART_MARGIN = { top: 20, right: 30, left: 20, bottom: 20 };
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-bg-card)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: '8px',
  padding: '12px',
  color: 'var(--color-text-primary)',
  boxShadow: '0 4px 12px var(--color-shadow-md)'
};
const ACTIVE_DOT = { r: 7, stroke: '#fff', strokeWidth: 2 };

const MonthDot = ({ cx, cy, payload, selectedMonthKey, color, selectedColor }) => {
  if (cx == null || cy == null) return null;
  const isSelected = payload.monthKey === selectedMonthKey;
  const fill = isSelected ? selectedColor : color;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSelected ? 7 : 5}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
    />
  );
};

const CockpitPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const { essentialCategories, availableCategories } = useCategoryData();
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
    'cockpit_chartView',
    'cumulative',
    preferences,
    updatePreferences
  );
  const [includeLoanPayments, setIncludeLoanPayments] = usePreferenceState(
    'cockpit_includeLoanPayments',
    false,
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

  const stats = useMemo(
    () => buildCockpitChartData(summary, essentialCategories, 12, includeLoanPayments),
    [summary, essentialCategories, includeLoanPayments]
  );
  const { chartData } = stats;
  const view = COCKPIT_VIEWS[chartView];

  const incomeStackedDot = useMemo(
    () => (props) => (
      <MonthDot
        {...props}
        selectedMonthKey={selectedMonthKey}
        color={COCKPIT_COLORS.cumulative}
        selectedColor={COCKPIT_COLORS.cumulativeSelected}
      />
    ),
    [selectedMonthKey]
  );

  const spendingStackedDot = useMemo(
    () => (props) => (
      <MonthDot
        {...props}
        selectedMonthKey={selectedMonthKey}
        color={COCKPIT_COLORS.nonEssential}
        selectedColor={COCKPIT_COLORS.nonEssentialSelected}
      />
    ),
    [selectedMonthKey]
  );

  const savingsDot = useMemo(
    () => (props) => (
      <MonthDot
        {...props}
        selectedMonthKey={selectedMonthKey}
        color={chartView === 'rate' ? COCKPIT_COLORS.rate : COCKPIT_COLORS.cumulative}
        selectedColor={chartView === 'rate' ? COCKPIT_COLORS.rateSelected : COCKPIT_COLORS.cumulativeSelected}
      />
    ),
    [selectedMonthKey, chartView]
  );

  const handleMonthSelect = useCallback((clickedData) => {
    selectMonthFromChart(summary, clickedData, selectedMonth, setSelectedMonth);
  }, [summary, selectedMonth, setSelectedMonth]);

  const handleChartClick = useCallback((data) => {
    if (data?.activePayload?.[0]) {
      handleMonthSelect(data.activePayload[0].payload);
    }
  }, [handleMonthSelect]);

  const yAxisTickFormatter = useCallback(
    (value) => (view.yAxisIsRate ? `${value}%` : `${(value / 1000).toFixed(0)}k`),
    [view.yAxisIsRate]
  );

  return (
    <ChartPageStates
      loading={loading}
      error={error}
      isEmpty={!loading && !error && chartData.length === 0}
      onRetry={loadSummary}
      loadingMessage="Loading cockpit..."
      emptyMessage="Upload bank statements to see your savings progress here."
    >
      <div className="cockpit-toolbar">
        <CockpitViewToggle value={chartView} onChange={setChartView} />
        <div className="cockpit-option-toggle">
          <button
            type="button"
            className={`cockpit-option-toggle__btn${includeLoanPayments ? ' active' : ''}`}
            onClick={() => setIncludeLoanPayments(!includeLoanPayments)}
            title="Include monthly loan payments in savings calculation"
          >
            Include loans
          </button>
        </div>
      </div>
      <div className="charts-container charts-layout">
        <div className="chart-section">
          <div className="chart-header-row">
            <div>
              <h3 className="chart-title chart-title-compact">{view.title}</h3>
              <div className="chart-meta">
                {view.renderMeta(stats, defaultCurrency)}
              </div>
            </div>
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={CHART_MARGIN} onClick={handleChartClick}>
                <defs>
                  <linearGradient id="cockpitCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COCKPIT_COLORS.cumulative} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COCKPIT_COLORS.cumulative} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cockpitRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COCKPIT_COLORS.rate} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COCKPIT_COLORS.rate} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cockpitEssential" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COCKPIT_COLORS.essential} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COCKPIT_COLORS.essential} stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="cockpitNonEssential" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COCKPIT_COLORS.nonEssential} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COCKPIT_COLORS.nonEssential} stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="cockpitSavingsCategories" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COCKPIT_COLORS.cumulative} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COCKPIT_COLORS.cumulative} stopOpacity={0.08} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={yAxisTickFormatter}
                />
                {view.showLegend && <Legend verticalAlign="top" height={36} />}
                <Tooltip
                  content={
                    <CockpitTooltip
                      chartView={chartView}
                      defaultCurrency={defaultCurrency}
                      tooltipStyle={TOOLTIP_STYLE}
                    />
                  }
                />
                <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
                {view.showGoalLine && (
                  <ReferenceLine
                    y={SAVINGS_RATE_GOAL}
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{
                      value: `Goal: ${SAVINGS_RATE_GOAL}%`,
                      position: 'insideTopLeft',
                      fill: '#f59e0b',
                      fontSize: 12,
                      fontWeight: 600,
                      offset: 10
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="cumulativeEssential"
                  stackId="income"
                  stroke={COCKPIT_COLORS.essential}
                  strokeWidth={2}
                  fill="url(#cockpitEssential)"
                  name="Essential"
                  hide={chartView !== 'income'}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeNonEssential"
                  stackId="income"
                  stroke={COCKPIT_COLORS.nonEssential}
                  strokeWidth={2}
                  fill="url(#cockpitNonEssential)"
                  name="Non-essential"
                  hide={chartView !== 'income'}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeSavingsAllocation"
                  stackId="income"
                  stroke={COCKPIT_COLORS.cumulative}
                  strokeWidth={2}
                  fill="url(#cockpitSavingsCategories)"
                  name="Savings categories"
                  dot={incomeStackedDot}
                  activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.cumulativeSelected }}
                  hide={chartView !== 'income'}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeEssential"
                  stackId="spending"
                  stroke={COCKPIT_COLORS.essential}
                  strokeWidth={2}
                  fill="url(#cockpitEssential)"
                  name="Essential"
                  hide={chartView !== 'spending'}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeNonEssential"
                  stackId="spending"
                  stroke={COCKPIT_COLORS.nonEssential}
                  strokeWidth={2}
                  fill="url(#cockpitNonEssential)"
                  name="Non-essential"
                  dot={spendingStackedDot}
                  activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.nonEssentialSelected }}
                  hide={chartView !== 'spending'}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeSavings"
                  stroke={COCKPIT_COLORS.cumulative}
                  strokeWidth={3}
                  fill="url(#cockpitCumulative)"
                  name="Cumulative Savings"
                  dot={savingsDot}
                  activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.cumulativeSelected }}
                  hide={chartView !== 'cumulative'}
                />
                <Area
                  type="monotone"
                  dataKey="savingRate"
                  stroke={COCKPIT_COLORS.rate}
                  strokeWidth={3}
                  fill="url(#cockpitRate)"
                  name="Savings Rate"
                  dot={savingsDot}
                  activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.rateSelected }}
                  hide={chartView !== 'rate'}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-hint">
            Click on a month dot to see income and expense details
          </div>
        </div>

        <MonthDrilldownPanel
          selectedMonth={selectedMonth}
          onClose={() => setSelectedMonth(null)}
          defaultCurrency={defaultCurrency}
          essentialCategories={essentialCategories}
          availableCategories={availableCategories}
          includeLoanPayments={includeLoanPayments}
          predictions={predictions[selectedMonthKey] || []}
          averageEssentialSpending={averageEssentialSpending[selectedMonthKey] || 0}
          onSkipPrediction={handleSkipPrediction}
          onDeletePrediction={handleDeletePrediction}
          onPredictionChanged={reloadPredictions}
          onTransactionCategoryUpdated={refreshSummary}
        />
      </div>
    </ChartPageStates>
  );
};

export default CockpitPage;
