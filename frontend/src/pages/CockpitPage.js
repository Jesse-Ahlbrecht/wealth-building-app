import React, { useCallback, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend
} from 'recharts';
import { selectMonthFromChart } from '../utils/domHelpers';
import { buildCockpitChartData, sortMonthsChronologically } from '../utils/chartDataHelpers';
import {
  buildStackedBarShapes,
  INCOME_BAR_SEGMENT_CONFIGS,
  savedBarShape,
  SPENDING_BAR_SEGMENT_CONFIGS,
  STACKED_BAR_FILL_OPACITY
} from '../utils/cockpitBarShapes';
import {
  COCKPIT_COLORS,
  COCKPIT_VIEW_KEYS,
  CockpitTooltip,
  getCockpitViewConfig,
  getIncomeSeriesKeys,
  getSavedDataKey,
  getSpendingSeriesKeys,
  cockpitColorWithOpacity
} from '../utils/cockpitChartConfig';
import CockpitViewToggle from '../components/CockpitViewToggle';
import DateRangeToggle from '../components/DateRangeToggle';
import CumulativeModeToggle from '../components/CumulativeModeToggle';
import ValueModeToggle from '../components/ValueModeToggle';
import {
  useCategoryData,
  useTransactionSummary,
  useMonthPredictions,
  useRecurringPayments,
  usePreferenceState,
  useMonthDrilldownPanelProps,
  useDateRangeSelection
} from '../hooks';
import ChartPageStates from '../components/ChartPageStates';
import MonthDrilldownPanel from '../components/MonthDrilldownPanel';
import { useAppContext } from '../context/AppContext';
import {
  formatSavingsAmountGoalMeta,
  getColorForPercentage,
  SAVINGS_RATE_GOAL
} from '../utils/finance';

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
const STROKE_OPACITY = 0.85;
const BAR_CATEGORY_GAP = '32%';
const BAR_MAX_SIZE = 36;
const BAR_GRID_STROKE = 'var(--color-border-secondary)';
const BAR_GRID_OPACITY = 0.45;

const cockpitAreaGradientDefs = (
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
);

const normalizeChartView = (view) => {
  if (view === 'cumulative' || view === 'rate') return 'saved';
  if (COCKPIT_VIEW_KEYS.includes(view)) return view;
  return 'saved';
};

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

const monthDotRenderer = (selectedMonthKey, color, selectedColor) => (props) => (
  <MonthDot
    {...props}
    selectedMonthKey={selectedMonthKey}
    color={color}
    selectedColor={selectedColor}
  />
);

const CockpitPage = () => {
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

  const [rawChartView, setChartView] = usePreferenceState(
    'cockpit_chartView',
    'saved',
    preferences,
    updatePreferences
  );
  const [cumulativeMode, setCumulativeMode] = usePreferenceState(
    'cockpit_cumulativeMode',
    'cumulative',
    preferences,
    updatePreferences
  );
  const [valueMode, setValueMode] = usePreferenceState(
    'cockpit_valueMode',
    'absolute',
    preferences,
    updatePreferences
  );

  const chartView = normalizeChartView(rawChartView);
  const selectedMonthKey = selectedMonth?.month;
  const {
    predictions,
    averageEssentialSpending,
    reloadPredictions,
    handleSkipPrediction,
    handleDeletePrediction
  } = useMonthPredictions(selectedMonthKey);
  const { recurringPayments } = useRecurringPayments();

  const sortedMonths = useMemo(
    () => sortMonthsChronologically(summary),
    [summary]
  );

  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [activeDrilldownSection, setActiveDrilldownSection] = useState(null);

  const handleMonthClickFromDrag = useCallback((monthData) => {
    selectMonthFromChart(
      summary,
      { monthKey: monthData.month },
      selectedMonth,
      setSelectedMonth,
      { setSection: setActiveDrilldownSection }
    );
  }, [summary, selectedMonth, setSelectedMonth]);

  const {
    filteredData: filteredMonths,
    timeRange,
    selectedRange,
    isSelecting,
    hasMoved,
    hoveredIndex,
    showCustomHelp,
    chartContainerRef,
    customButtonRef,
    handleTimeRangeChange,
    handleCustomClick,
    handleMouseDown,
    setHoveredIndex
  } = useDateRangeSelection(sortedMonths, {
    onMonthClick: handleMonthClickFromDrag,
    rerenderDeps: [cumulativeMode]
  });

  const stats = useMemo(
    () => buildCockpitChartData(filteredMonths, essentialCategories),
    [filteredMonths, essentialCategories]
  );
  const { chartData } = stats;
  const view = getCockpitViewConfig(chartView, cumulativeMode, valueMode, defaultCurrency);
  const incomeKeys = getIncomeSeriesKeys(cumulativeMode, valueMode);
  const spendingKeys = getSpendingSeriesKeys(cumulativeMode, valueMode);
  const savedDataKey = getSavedDataKey(cumulativeMode, valueMode);
  const isBarChart = cumulativeMode === 'normal';

  const savedDotColor = valueMode === 'percentage' ? COCKPIT_COLORS.rate : COCKPIT_COLORS.cumulative;
  const savedDotSelectedColor = valueMode === 'percentage'
    ? COCKPIT_COLORS.rateSelected
    : COCKPIT_COLORS.cumulativeSelected;

  const handleMonthSelect = useCallback((clickedData, section = null) => {
    selectMonthFromChart(summary, clickedData, selectedMonth, setSelectedMonth, {
      section,
      setSection: setActiveDrilldownSection,
      scrollOnSectionChange: Boolean(section)
    });
  }, [summary, selectedMonth, setSelectedMonth]);

  const handleDrilldownClose = useCallback(() => {
    setSelectedMonth(null);
    setActiveDrilldownSection(null);
  }, [setSelectedMonth]);

  const handleBarSegmentClick = useCallback((section) => (data) => {
    if (isSelecting || hasMoved) return;
    const payload = data?.payload ?? data;
    if (!payload?.monthKey) return;
    handleMonthSelect(payload, section);
  }, [handleMonthSelect, isSelecting, hasMoved]);

  const handleChartClick = useCallback((data) => {
    if (isSelecting || hasMoved) return;
    if (data?.activePayload?.[0]) {
      handleMonthSelect(data.activePayload[0].payload);
    }
  }, [handleMonthSelect, isSelecting, hasMoved]);

  const yAxisTickFormatter = useCallback(
    (value) => (view.yAxisIsRate ? `${value}%` : `${(value / 1000).toFixed(0)}k`),
    [view.yAxisIsRate]
  );

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
    refreshCategories,
    valueMode
  });

  const capStackedBarYAxis = isBarChart && view.yAxisIsRate
    && (chartView === 'income' || chartView === 'spending');

  const chartGrid = isBarChart ? (
    <CartesianGrid
      vertical={false}
      strokeDasharray="4 10"
      stroke={BAR_GRID_STROKE}
      strokeOpacity={BAR_GRID_OPACITY}
    />
  ) : (
    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" />
  );

  const chartAxes = (
    <>
      {chartGrid}
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
        domain={capStackedBarYAxis ? [0, 100] : undefined}
        allowDataOverflow={capStackedBarYAxis}
      />
      {view.showLegend && (
        <Legend
          verticalAlign="top"
          align="left"
          height={32}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ width: '100%', paddingBottom: 4 }}
        />
      )}
      <Tooltip
        cursor={isBarChart ? false : undefined}
        content={
          <CockpitTooltip
            chartView={chartView}
            cumulativeMode={cumulativeMode}
            valueMode={valueMode}
            defaultCurrency={defaultCurrency}
            tooltipStyle={TOOLTIP_STYLE}
          />
        }
      />
      <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
      {view.showGoalLine && view.goalLineValue !== null && (
        <ReferenceLine
          y={view.goalLineValue}
          stroke="#ff9f0a"
          strokeDasharray="5 5"
          strokeWidth={2}
          label={{
            value: view.goalLineLabel,
            position: 'insideTopLeft',
            fill: '#ff9f0a',
            fontSize: 12,
            fontWeight: 600,
            offset: 10
          }}
        />
      )}
    </>
  );

  const savedBarGetColor = useCallback((entry) => {
    if (valueMode === 'percentage') {
      return getColorForPercentage((entry.savingRate / SAVINGS_RATE_GOAL) * 100);
    }
    return formatSavingsAmountGoalMeta(entry.monthlySavings, defaultCurrency).color;
  }, [valueMode, defaultCurrency]);

  const barInteraction = useMemo(() => ({
    hoveredIndex,
    hoveredSegment,
    selectedMonthKey,
    focusedSection: activeDrilldownSection
  }), [hoveredIndex, hoveredSegment, selectedMonthKey, activeDrilldownSection]);

  const incomeBarShapes = useMemo(
    () => buildStackedBarShapes(barInteraction, INCOME_BAR_SEGMENT_CONFIGS),
    [barInteraction]
  );
  const spendingBarShapes = useMemo(
    () => buildStackedBarShapes(barInteraction, SPENDING_BAR_SEGMENT_CONFIGS),
    [barInteraction]
  );
  const savedBarShapeRenderer = useMemo(
    () => savedBarShape({ ...barInteraction, getBaseColor: savedBarGetColor }),
    [barInteraction, savedBarGetColor]
  );

  const barSegmentHandlers = useMemo(() => {
    const makeHandlers = (section) => ({
      onMouseEnter: (_data, index) => {
        setHoveredIndex(index);
        setHoveredSegment(section);
      },
      onClick: handleBarSegmentClick(section)
    });
    return {
      essential: makeHandlers('essential'),
      nonEssential: makeHandlers('nonEssential'),
      savings: makeHandlers('savings')
    };
  }, [handleBarSegmentClick, setHoveredIndex]);

  const renderAreaChart = () => (
    <AreaChart data={chartData} margin={CHART_MARGIN} onClick={handleChartClick}>
      {cockpitAreaGradientDefs}
      {chartAxes}
      {chartView === 'income' && (
        <>
          <Area
            type="monotone"
            dataKey={incomeKeys.essential}
            stackId="income"
            stroke={cockpitColorWithOpacity(COCKPIT_COLORS.essential, STROKE_OPACITY)}
            strokeWidth={2}
            fill="url(#cockpitEssential)"
            name="Essential"
          />
          <Area
            type="monotone"
            dataKey={incomeKeys.nonEssential}
            stackId="income"
            stroke={cockpitColorWithOpacity(COCKPIT_COLORS.nonEssential, STROKE_OPACITY)}
            strokeWidth={2}
            fill="url(#cockpitNonEssential)"
            name="Non-essential"
          />
          <Area
            type="monotone"
            dataKey={incomeKeys.savingsAllocation}
            stackId="income"
            stroke={cockpitColorWithOpacity(COCKPIT_COLORS.cumulative, STROKE_OPACITY)}
            strokeWidth={2}
            fill="url(#cockpitSavingsCategories)"
            name="Savings"
            dot={monthDotRenderer(selectedMonthKey, COCKPIT_COLORS.cumulative, COCKPIT_COLORS.cumulativeSelected)}
            activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.cumulativeSelected }}
          />
        </>
      )}
      {chartView === 'spending' && (
        <>
          <Area
            type="monotone"
            dataKey={spendingKeys.essential}
            stackId="spending"
            stroke={cockpitColorWithOpacity(COCKPIT_COLORS.essential, STROKE_OPACITY)}
            strokeWidth={2}
            fill="url(#cockpitEssential)"
            name="Essential"
          />
          <Area
            type="monotone"
            dataKey={spendingKeys.nonEssential}
            stackId="spending"
            stroke={cockpitColorWithOpacity(COCKPIT_COLORS.nonEssential, STROKE_OPACITY)}
            strokeWidth={2}
            fill="url(#cockpitNonEssential)"
            name="Non-essential"
            dot={monthDotRenderer(selectedMonthKey, COCKPIT_COLORS.nonEssential, COCKPIT_COLORS.nonEssentialSelected)}
            activeDot={{ ...ACTIVE_DOT, fill: COCKPIT_COLORS.nonEssentialSelected }}
          />
        </>
      )}
      {chartView === 'saved' && (
        <Area
          type="monotone"
          dataKey={savedDataKey}
          stroke={cockpitColorWithOpacity(savedDotColor, STROKE_OPACITY)}
          strokeWidth={3}
          fill={valueMode === 'percentage' ? 'url(#cockpitRate)' : 'url(#cockpitCumulative)'}
          name="Saved"
          dot={monthDotRenderer(selectedMonthKey, savedDotColor, savedDotSelectedColor)}
          activeDot={{ ...ACTIVE_DOT, fill: savedDotSelectedColor }}
        />
      )}
    </AreaChart>
  );

  const barChartMargin = view.showLegend
    ? { ...CHART_MARGIN, top: 32 }
    : CHART_MARGIN;

  const barChartHandlers = {
    onMouseLeave: () => {
      setHoveredIndex(null);
      setHoveredSegment(null);
    }
  };

  const renderBarChart = () => (
    <BarChart
      data={chartData}
      margin={barChartMargin}
      barCategoryGap={BAR_CATEGORY_GAP}
      maxBarSize={BAR_MAX_SIZE}
      {...barChartHandlers}
    >
      {chartAxes}
      {chartView === 'income' && (
        <>
          <Bar
            dataKey={incomeKeys.essential}
            stackId="income"
            fill={cockpitColorWithOpacity(COCKPIT_COLORS.essential, STACKED_BAR_FILL_OPACITY)}
            name="Essential"
            shape={incomeBarShapes.essential}
            isAnimationActive={false}
            {...barSegmentHandlers.essential}
          />
          <Bar
            dataKey={incomeKeys.nonEssential}
            stackId="income"
            fill={cockpitColorWithOpacity(COCKPIT_COLORS.nonEssential, STACKED_BAR_FILL_OPACITY)}
            name="Non-essential"
            shape={incomeBarShapes.nonEssential}
            isAnimationActive={false}
            {...barSegmentHandlers.nonEssential}
          />
          <Bar
            dataKey={incomeKeys.savingsAllocation}
            stackId="income"
            fill={cockpitColorWithOpacity(COCKPIT_COLORS.cumulative, STACKED_BAR_FILL_OPACITY)}
            name="Savings"
            shape={incomeBarShapes.savings}
            isAnimationActive={false}
            {...barSegmentHandlers.savings}
          />
        </>
      )}
      {chartView === 'spending' && (
        <>
          <Bar
            dataKey={spendingKeys.essential}
            stackId="spending"
            fill={cockpitColorWithOpacity(COCKPIT_COLORS.essential, STACKED_BAR_FILL_OPACITY)}
            name="Essential"
            shape={spendingBarShapes.essential}
            isAnimationActive={false}
            {...barSegmentHandlers.essential}
          />
          <Bar
            dataKey={spendingKeys.nonEssential}
            stackId="spending"
            fill={cockpitColorWithOpacity(COCKPIT_COLORS.nonEssential, STACKED_BAR_FILL_OPACITY)}
            name="Non-essential"
            shape={spendingBarShapes.nonEssential}
            isAnimationActive={false}
            {...barSegmentHandlers.nonEssential}
          />
        </>
      )}
      {chartView === 'saved' && (
        <Bar
          dataKey={savedDataKey}
          name="Saved"
          shape={savedBarShapeRenderer}
          isAnimationActive={false}
          {...barSegmentHandlers.savings}
        />
      )}
    </BarChart>
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
      <div className="cockpit-control-bar">
        <CockpitViewToggle value={chartView} onChange={setChartView} />
        <div className="cockpit-control-bar__filters">
          <DateRangeToggle
            timeRange={timeRange}
            selectedRange={selectedRange}
            showCustomHelp={showCustomHelp}
            customButtonRef={customButtonRef}
            onTimeRangeChange={handleTimeRangeChange}
            onCustomClick={handleCustomClick}
          />
          <CumulativeModeToggle value={cumulativeMode} onChange={setCumulativeMode} />
          <ValueModeToggle value={valueMode} onChange={setValueMode} />
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
          <div
            className={`chart-wrapper ${isBarChart ? 'chart-wrapper--bars' : ''} ${isSelecting ? 'chart-wrapper-selecting' : ''}`}
            ref={chartContainerRef}
            onMouseDown={handleMouseDown}
          >
            <ResponsiveContainer width="100%" height={400}>
              {isBarChart ? renderBarChart() : renderAreaChart()}
            </ResponsiveContainer>
          </div>
          <div className="chart-hint">
            {isBarChart
              ? 'Click on a bar to see details, or drag to select a custom range'
              : 'Click on a month dot to see income and expense details'}
          </div>
        </div>

        <MonthDrilldownPanel
          {...drilldownPanelProps}
          onClose={handleDrilldownClose}
          activeSection={activeDrilldownSection}
          onActiveSectionChange={setActiveDrilldownSection}
        />
      </div>
    </ChartPageStates>
  );
};

export default CockpitPage;
