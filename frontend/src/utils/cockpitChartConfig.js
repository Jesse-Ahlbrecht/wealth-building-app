import React from 'react';
import { formatCurrency } from '../utils';
import {
  SAVINGS_RATE_GOAL,
  formatSavingRateGoalMeta,
  formatSavingsAmountGoalMeta,
  getSavingsGoalForCurrency
} from '../utils/finance';

export const COCKPIT_COLORS = {
  cumulative: '#34c759',
  cumulativeSelected: '#248a3d',
  rate: '#14b8a6',
  rateSelected: '#0f766e',
  essential: '#98989d',
  nonEssential: '#ff3b30',
  nonEssentialSelected: '#d70015'
};

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
};

export const cockpitColorWithOpacity = (color, opacity) => {
  if (color.startsWith('rgb(')) {
    return color.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${opacity})`);
  }
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const formatValue = (value, valueMode, currency) => (
  valueMode === 'percentage'
    ? `${value.toFixed(1)}%`
    : formatCurrency(value, currency)
);

const getFieldKey = (base, cumulativeMode, valueMode) => {
  const prefix = cumulativeMode === 'cumulative' ? 'cumulative' : 'monthly';
  const suffix = valueMode === 'percentage' ? 'Pct' : '';
  return `${prefix}${base}${suffix}`;
};

export const getSavedDataKey = (cumulativeMode, valueMode) => {
  if (cumulativeMode === 'cumulative' && valueMode === 'absolute') return 'cumulativeSavings';
  if (cumulativeMode === 'cumulative' && valueMode === 'percentage') return 'cumulativeSavingRate';
  if (cumulativeMode === 'normal' && valueMode === 'absolute') return 'monthlySavings';
  return 'savingRate';
};

export const getIncomeSeriesKeys = (cumulativeMode, valueMode) => ({
  essential: getFieldKey('Essential', cumulativeMode, valueMode),
  nonEssential: getFieldKey('NonEssential', cumulativeMode, valueMode),
  savingsAllocation: getFieldKey('SavingsAllocation', cumulativeMode, valueMode)
});

export const getSpendingSeriesKeys = (cumulativeMode, valueMode) => ({
  essential: getFieldKey('Essential', cumulativeMode, valueMode),
  nonEssential: getFieldKey('NonEssential', cumulativeMode, valueMode)
});

const renderIncomeMeta = (stats, currency, cumulativeMode, valueMode) => {
  const essential = stats[
    cumulativeMode === 'cumulative' ? 'totalCumulativeEssential' : 'totalMonthlyEssential'
  ] ?? stats.totalCumulativeEssential;
  const nonEssential = stats[
    cumulativeMode === 'cumulative' ? 'totalCumulativeNonEssential' : 'totalMonthlyNonEssential'
  ] ?? stats.totalCumulativeNonEssential;
  const savingsCategories = stats[
    cumulativeMode === 'cumulative' ? 'totalCumulativeSavingsCategories' : 'totalMonthlySavingsCategories'
  ] ?? stats.totalCumulativeSavingsCategories;
  const income = stats.totalCumulativeIncome;

  if (valueMode === 'percentage') {
    const essentialPct = income > 0 ? (essential / income) * 100 : 0;
    const nonEssentialPct = income > 0 ? (nonEssential / income) * 100 : 0;
    const savingsPct = income > 0 ? (savingsCategories / income) * 100 : 0;
    return (
      <>
        <div>
          Total income:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
            {formatCurrency(income, currency)}
          </span>
        </div>
        <div>
          Essential:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
            {essentialPct.toFixed(1)}%
          </span>
          {' · '}
          Non-essential:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
            {nonEssentialPct.toFixed(1)}%
          </span>
          {' · '}
          Savings categories:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
            {savingsPct.toFixed(1)}%
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        Total income:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
          {formatCurrency(income, currency)}
        </span>
      </div>
      <div>
        Essential:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
          {formatCurrency(essential, currency)}
        </span>
        {' · '}
        Non-essential:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
          {formatCurrency(nonEssential, currency)}
        </span>
        {' · '}
        Savings categories:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
          {formatCurrency(savingsCategories, currency)}
        </span>
      </div>
    </>
  );
};

const renderSpendingMeta = (stats, currency, cumulativeMode, valueMode) => {
  const essential = stats[
    cumulativeMode === 'cumulative' ? 'totalCumulativeEssential' : 'totalMonthlyEssential'
  ] ?? stats.totalCumulativeEssential;
  const nonEssential = stats[
    cumulativeMode === 'cumulative' ? 'totalCumulativeNonEssential' : 'totalMonthlyNonEssential'
  ] ?? stats.totalCumulativeNonEssential;
  const total = essential + nonEssential;
  const income = stats.totalCumulativeIncome;

  if (valueMode === 'percentage') {
    const essentialPct = income > 0 ? (essential / income) * 100 : 0;
    const nonEssentialPct = income > 0 ? (nonEssential / income) * 100 : 0;
    const totalPct = income > 0 ? (total / income) * 100 : 0;
    return (
      <>
        <div>
          Essential:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
            {essentialPct.toFixed(1)}%
          </span>
        </div>
        <div>
          Non-essential:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
            {nonEssentialPct.toFixed(1)}%
          </span>
          {' · '}
          Total:{' '}
          <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
            {totalPct.toFixed(1)}%
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        Essential:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
          {formatCurrency(essential, currency)}
        </span>
      </div>
      <div>
        Non-essential:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
          {formatCurrency(nonEssential, currency)}
        </span>
        {' · '}
        Total:{' '}
        <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
          {formatCurrency(total, currency)}
        </span>
      </div>
    </>
  );
};

const renderSavedMeta = (stats, currency, cumulativeMode, valueMode) => {
  if (valueMode === 'percentage') {
    const avgMeta = formatSavingRateGoalMeta(stats.avgSavingRate);
    const overallMeta = formatSavingRateGoalMeta(stats.overallSavingRate);
    const displayRate = cumulativeMode === 'cumulative'
      ? stats.overallSavingRate
      : stats.avgSavingRate;
    const meta = cumulativeMode === 'cumulative' ? overallMeta : avgMeta;
    const label = cumulativeMode === 'cumulative' ? 'Overall' : 'Average';
    return (
      <>
        <div>
          {label}:{' '}
          <span style={{ fontWeight: 600, color: meta.color }}>
            {displayRate.toFixed(1)}%
          </span>
          <span className="chart-meta-subtle">
            ({meta.percentOfGoal}% of {SAVINGS_RATE_GOAL}% goal)
          </span>
        </div>
        {cumulativeMode === 'cumulative' && (
          <div>
            Monthly average:{' '}
            <span style={{ fontWeight: 600, color: avgMeta.color }}>
              {stats.avgSavingRate.toFixed(1)}%
            </span>
          </div>
        )}
      </>
    );
  }

  const overallMeta = formatSavingRateGoalMeta(stats.overallSavingRate);
  const totalSaved = cumulativeMode === 'cumulative'
    ? stats.totalCumulative
    : stats.totalMonthlySavings;
  const avgSaved = stats.avgMonthlySavings ?? 0;
  const avgGoalMeta = formatSavingsAmountGoalMeta(avgSaved, currency);

  return (
    <>
      <div>
        {cumulativeMode === 'cumulative' ? 'Total saved' : 'Average saved'}:{' '}
        <span
          style={{
            fontWeight: 600,
            color: totalSaved >= 0 ? COCKPIT_COLORS.cumulative : COCKPIT_COLORS.nonEssential
          }}
        >
          {formatCurrency(cumulativeMode === 'cumulative' ? totalSaved : avgSaved, currency)}
        </span>
        {cumulativeMode === 'normal' && (
          <span className="chart-meta-subtle"> ({avgGoalMeta.label})</span>
        )}
      </div>
      <div>
        Saved of income:{' '}
        <span style={{ fontWeight: 600, color: overallMeta.color }}>
          {stats.overallSavingRate.toFixed(1)}%
        </span>
        <span className="chart-meta-subtle">
          ({overallMeta.percentOfGoal}% of {SAVINGS_RATE_GOAL}% goal)
        </span>
      </div>
    </>
  );
};

const renderIncomeTooltip = (data, currency, cumulativeMode, valueMode) => {
  const keys = getIncomeSeriesKeys(cumulativeMode, valueMode);
  return (
    <>
      <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
        Income: {formatCurrency(data.monthlyIncome, currency)}
        {cumulativeMode === 'cumulative' && (
          <span style={{ color: COCKPIT_COLORS.cumulative, fontWeight: 600 }}>
            {' '}(total {formatCurrency(data.cumulativeIncome, currency)})
          </span>
        )}
      </p>
      <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.essential }}>
        Essential: {formatValue(data[keys.essential], valueMode, currency)}
      </p>
      <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential }}>
        Non-essential: {formatValue(data[keys.nonEssential], valueMode, currency)}
      </p>
      <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.cumulative }}>
        Savings allocation: {formatValue(data[keys.savingsAllocation], valueMode, currency)}
      </p>
    </>
  );
};

const renderSpendingTooltip = (data, currency, cumulativeMode, valueMode) => {
  const keys = getSpendingSeriesKeys(cumulativeMode, valueMode);
  const totalValue = cumulativeMode === 'cumulative'
    ? data[valueMode === 'percentage' ? 'cumulativeSpendingPct' : 'cumulativeSpending']
    : (valueMode === 'percentage'
      ? data.monthlyEssentialPct + data.monthlyNonEssentialPct
      : data.monthlyEssential + data.monthlyNonEssential);

  return (
    <>
      <p style={{ margin: 0, color: COCKPIT_COLORS.essential }}>
        Essential: {formatValue(data[keys.essential], valueMode, currency)}
      </p>
      <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential }}>
        Non-essential: {formatValue(data[keys.nonEssential], valueMode, currency)}
      </p>
      <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential, fontWeight: 600 }}>
        Total spent: {formatValue(totalValue, valueMode, currency)}
      </p>
    </>
  );
};

const renderSavedTooltip = (data, currency, cumulativeMode, valueMode) => {
  const savedKey = getSavedDataKey(cumulativeMode, valueMode);
  return (
    <>
      <p style={{ margin: 0, color: COCKPIT_COLORS.cumulative }}>
        {cumulativeMode === 'cumulative' ? 'Cumulative' : 'This month'}:{' '}
        {formatValue(data[savedKey], valueMode, currency)}
      </p>
      {valueMode === 'absolute' && (
        <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-secondary)' }}>
          Saved: {data.savingRate.toFixed(1)}% of income
        </p>
      )}
      {valueMode === 'percentage' && (
        <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-secondary)' }}>
          Amount: {formatCurrency(data.monthlySavings, currency)}
        </p>
      )}
    </>
  );
};

const VIEW_TITLES = {
  income: 'Income Split',
  saved: 'Saved',
  spending: 'Spending'
};

export const getCockpitViewConfig = (chartView, cumulativeMode, valueMode, currency = 'CHF') => {
  const titles = {
    income: VIEW_TITLES.income,
    saved: cumulativeMode === 'cumulative' && valueMode === 'absolute'
      ? 'Total Saved'
      : VIEW_TITLES.saved,
    spending: cumulativeMode === 'cumulative'
      ? 'Cumulative Spending'
      : VIEW_TITLES.spending
  };

  const showGoalLine = chartView === 'saved' && (
    valueMode === 'percentage'
    || (cumulativeMode === 'normal' && valueMode === 'absolute')
  );
  const goalLineValue = showGoalLine
    ? getGoalLineValue(chartView, cumulativeMode, valueMode, currency)
    : null;
  const goalLineLabel = goalLineValue !== null
    ? getGoalLineLabel(chartView, cumulativeMode, valueMode, currency)
    : null;

  return {
    title: titles[chartView],
    showLegend: chartView === 'income' || chartView === 'spending',
    yAxisIsRate: valueMode === 'percentage',
    showGoalLine,
    goalLineValue,
    goalLineLabel,
    renderMeta: (stats, currency) => {
      if (chartView === 'income') return renderIncomeMeta(stats, currency, cumulativeMode, valueMode);
      if (chartView === 'spending') return renderSpendingMeta(stats, currency, cumulativeMode, valueMode);
      return renderSavedMeta(stats, currency, cumulativeMode, valueMode);
    }
  };
};

export const COCKPIT_VIEW_OPTIONS = [
  {
    key: 'income',
    label: 'Income split',
    title: 'How income is allocated',
    color: COCKPIT_COLORS.cumulative
  },
  {
    key: 'saved',
    label: 'Saved',
    title: 'Savings over the selected period',
    color: COCKPIT_COLORS.cumulative
  },
  {
    key: 'spending',
    label: 'Spending',
    title: 'Essential and non-essential spending',
    color: COCKPIT_COLORS.nonEssential
  }
];

export const COCKPIT_VIEW_KEYS = COCKPIT_VIEW_OPTIONS.map((option) => option.key);

const renderCockpitTooltipContent = (chartView, data, currency, cumulativeMode, valueMode) => {
  if (chartView === 'income') return renderIncomeTooltip(data, currency, cumulativeMode, valueMode);
  if (chartView === 'spending') return renderSpendingTooltip(data, currency, cumulativeMode, valueMode);
  return renderSavedTooltip(data, currency, cumulativeMode, valueMode);
};

export const CockpitTooltip = ({
  active,
  payload,
  chartView,
  cumulativeMode,
  valueMode,
  defaultCurrency,
  tooltipStyle
}) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.month}</p>
      {renderCockpitTooltipContent(chartView, data, defaultCurrency, cumulativeMode, valueMode)}
    </div>
  );
};

export const getGoalLineValue = (chartView, cumulativeMode, valueMode, currency = 'CHF') => {
  if (chartView !== 'saved') return null;
  if (valueMode === 'percentage') return SAVINGS_RATE_GOAL;
  if (cumulativeMode === 'normal' && valueMode === 'absolute') {
    return getSavingsGoalForCurrency(currency);
  }
  return null;
};

export const getGoalLineLabel = (chartView, cumulativeMode, valueMode, currency) => {
  const value = getGoalLineValue(chartView, cumulativeMode, valueMode);
  if (value === null) return null;
  if (valueMode === 'percentage') return `Goal: ${SAVINGS_RATE_GOAL}%`;
  return `Goal: ${formatCurrency(value, currency)}`;
};
