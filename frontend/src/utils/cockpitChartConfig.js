import React from 'react';
import { formatCurrency } from '../utils';
import { SAVINGS_RATE_GOAL, formatSavingRateGoalMeta } from '../utils/finance';

export const COCKPIT_COLORS = {
  cumulative: '#22c55e',
  cumulativeSelected: '#16a34a',
  rate: '#3b82f6',
  rateSelected: '#2563eb',
  essential: '#94a3b8',
  nonEssential: '#ef4444',
  nonEssentialSelected: '#dc2626',
  dot: '#64748b',
  dotSelected: '#334155'
};

const renderIncomeMeta = (stats, currency) => (
  <>
    <div>
      Total income:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
        {formatCurrency(stats.totalCumulativeIncome, currency)}
      </span>
    </div>
    <div>
      Essential:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
        {formatCurrency(stats.totalCumulativeEssential, currency)}
      </span>
      {' · '}
      Non-essential:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
        {formatCurrency(stats.totalCumulativeNonEssential, currency)}
      </span>
      {' · '}
      Savings categories:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.cumulative }}>
        {formatCurrency(stats.totalCumulativeSavingsCategories, currency)}
      </span>
    </div>
  </>
);

const renderSpendingMeta = (stats, currency) => (
  <>
    <div>
      Essential:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.essential }}>
        {formatCurrency(stats.totalCumulativeEssential, currency)}
      </span>
    </div>
    <div>
      Non-essential:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
        {formatCurrency(stats.totalCumulativeNonEssential, currency)}
      </span>
      {' · '}
      Total:{' '}
      <span style={{ fontWeight: 600, color: COCKPIT_COLORS.nonEssential }}>
        {formatCurrency(stats.totalCumulativeSpending, currency)}
      </span>
    </div>
  </>
);

const renderRateMeta = (stats) => {
  const avgMeta = formatSavingRateGoalMeta(stats.avgSavingRate);
  const overallMeta = formatSavingRateGoalMeta(stats.overallSavingRate);
  return (
    <>
      <div>
        Average:{' '}
        <span style={{ fontWeight: 600, color: avgMeta.color }}>
          {stats.avgSavingRate.toFixed(1)}%
        </span>
        <span className="chart-meta-subtle">
          ({avgMeta.percentOfGoal}% of {SAVINGS_RATE_GOAL}% goal)
        </span>
      </div>
      <div>
        Overall:{' '}
        <span style={{ fontWeight: 600, color: overallMeta.color }}>
          {stats.overallSavingRate.toFixed(1)}%
        </span>
        <span className="chart-meta-subtle"> of income saved</span>
      </div>
    </>
  );
};

const renderCumulativeMeta = (stats, currency) => {
  const overallMeta = formatSavingRateGoalMeta(stats.overallSavingRate);
  return (
    <>
      <div>
        Total saved:{' '}
        <span
          style={{
            fontWeight: 600,
            color: stats.totalCumulative >= 0 ? COCKPIT_COLORS.cumulative : COCKPIT_COLORS.nonEssential
          }}
        >
          {formatCurrency(stats.totalCumulative, currency)}
        </span>
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

const renderIncomeTooltip = (data, currency) => (
  <>
    <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
      Income: {formatCurrency(data.monthlyIncome, currency)}
      <span style={{ color: COCKPIT_COLORS.cumulative, fontWeight: 600 }}>
        {' '}(total {formatCurrency(data.cumulativeIncome, currency)})
      </span>
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.essential }}>
      Essential: {formatCurrency(data.monthlyEssential, currency)}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {' '}(cum. {formatCurrency(data.cumulativeEssential, currency)})
      </span>
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential }}>
      Non-essential: {formatCurrency(data.monthlyNonEssential, currency)}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {' '}(cum. {formatCurrency(data.cumulativeNonEssential, currency)})
      </span>
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.cumulative }}>
      Savings categories: {formatCurrency(data.monthlySavingsCategories, currency)}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {' '}(cum. {formatCurrency(data.cumulativeSavingsCategories, currency)})
      </span>
    </p>
    {data.monthlySavingsAllocation > data.monthlySavingsCategories && (
      <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-secondary)' }}>
        Other savings: {formatCurrency(
          data.monthlySavingsAllocation - data.monthlySavingsCategories,
          currency
        )}
      </p>
    )}
  </>
);

const renderSpendingTooltip = (data, currency) => (
  <>
    <p style={{ margin: 0, color: COCKPIT_COLORS.essential }}>
      Essential: {formatCurrency(data.monthlyEssential, currency)}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {' '}(cum. {formatCurrency(data.cumulativeEssential, currency)})
      </span>
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential }}>
      Non-essential: {formatCurrency(data.monthlyNonEssential, currency)}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {' '}(cum. {formatCurrency(data.cumulativeNonEssential, currency)})
      </span>
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.nonEssential, fontWeight: 600 }}>
      Total spent: {formatCurrency(data.cumulativeSpending, currency)}
    </p>
  </>
);

const renderRateTooltip = (data, currency) => (
  <>
    <p style={{ margin: 0, color: COCKPIT_COLORS.rate }}>
      Saved: {data.savingRate.toFixed(1)}% of income
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-secondary)' }}>
      Amount: {formatCurrency(data.monthlySavings, currency)}
    </p>
  </>
);

const renderCumulativeTooltip = (data, currency) => (
  <>
    <p style={{ margin: 0, color: COCKPIT_COLORS.cumulative }}>
      This month: {formatCurrency(data.monthlySavings, currency)}
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: COCKPIT_COLORS.rate }}>
      Cumulative: {formatCurrency(data.cumulativeSavings, currency)}
    </p>
    <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-secondary)' }}>
      Saved: {data.savingRate.toFixed(1)}% of income
    </p>
  </>
);

export const COCKPIT_VIEWS = {
  cumulative: {
    title: 'Total Saved (Last 12 Months)',
    showLegend: false,
    yAxisIsRate: false,
    showGoalLine: false,
    renderMeta: renderCumulativeMeta,
    renderTooltip: renderCumulativeTooltip
  },
  rate: {
    title: 'Savings Rate (Last 12 Months)',
    showLegend: false,
    yAxisIsRate: true,
    showGoalLine: true,
    renderMeta: renderRateMeta,
    renderTooltip: renderRateTooltip
  },
  income: {
    title: 'Income Split (Last 12 Months)',
    showLegend: true,
    yAxisIsRate: false,
    showGoalLine: false,
    renderMeta: renderIncomeMeta,
    renderTooltip: renderIncomeTooltip
  },
  spending: {
    title: 'Cumulative Spending (Last 12 Months)',
    showLegend: true,
    yAxisIsRate: false,
    showGoalLine: false,
    renderMeta: renderSpendingMeta,
    renderTooltip: renderSpendingTooltip
  }
};

export const COCKPIT_VIEW_OPTIONS = [
  {
    key: 'income',
    label: 'Income split',
    title: 'How cumulative income is allocated',
    color: COCKPIT_COLORS.cumulative
  },
  {
    key: 'cumulative',
    label: 'Saved',
    title: 'Cumulative savings over the last 12 months',
    color: COCKPIT_COLORS.cumulative
  },
  {
    key: 'rate',
    label: 'Save rate',
    title: 'Monthly savings as a percentage of income',
    color: COCKPIT_COLORS.rate
  },
  {
    key: 'spending',
    label: 'Spending',
    title: 'Essential and non-essential spending',
    color: COCKPIT_COLORS.nonEssential
  }
];

export const COCKPIT_VIEW_KEYS = COCKPIT_VIEW_OPTIONS.map((option) => option.key);

export const CockpitTooltip = ({ active, payload, chartView, defaultCurrency, tooltipStyle }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const view = COCKPIT_VIEWS[chartView];
  return (
    <div style={tooltipStyle}>
      <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.month}</p>
      {view.renderTooltip(data, defaultCurrency)}
    </div>
  );
};
