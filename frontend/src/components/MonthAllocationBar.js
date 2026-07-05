import React, { useMemo } from 'react';
import { formatCurrency } from '../utils';
import {
  formatPercentOf,
  formatSavingsAmountGoalMeta,
  percentOf
} from '../utils/finance';
import { COCKPIT_COLORS, cockpitColorWithOpacity } from '../utils/cockpitChartConfig';
import PredictedEssentialAverageMeta from './PredictedEssentialAverageMeta';

const SEGMENT_CONFIG = {
  essential: { color: COCKPIT_COLORS.essential, sectionKey: 'essential' },
  nonEssential: { color: COCKPIT_COLORS.nonEssential, sectionKey: 'nonEssential' },
  expenses: { color: COCKPIT_COLORS.nonEssential, sectionKey: 'nonEssential' },
  savings: { color: COCKPIT_COLORS.cumulative, sectionKey: 'savings' }
};

const PREDICTED_ESSENTIAL_HATCH = (() => {
  const strong = cockpitColorWithOpacity(COCKPIT_COLORS.essential, 0.55);
  const light = cockpitColorWithOpacity(COCKPIT_COLORS.essential, 0.25);
  return `repeating-linear-gradient(-45deg, ${strong}, ${strong} 4px, ${light} 4px, ${light} 8px)`;
})();

const MIN_LEGEND_COLUMN_PCT = 22;

const computeLegendPositions = (segments) => {
  let offset = 0;
  return segments.map((segment) => {
    const start = offset;
    const center = start + segment.widthPct / 2;
    offset += segment.widthPct;

    let align = 'center';
    if (segment.key === 'essential' || segment.key === 'expenses') {
      align = 'start';
    } else if (segment.key === 'savings' || segment.key === 'overspend') {
      align = 'end';
    }

    return {
      key: segment.key,
      start,
      center,
      widthPct: segment.widthPct,
      maxWidthPct: Math.max(segment.widthPct, MIN_LEGEND_COLUMN_PCT),
      align
    };
  });
};

const getLegendItemStyle = (position) => {
  const { align, start, center, maxWidthPct } = position;

  if (align === 'start') {
    return { left: `${start}%`, maxWidth: `${maxWidthPct}%` };
  }
  if (align === 'end') {
    return { right: 0, width: 'max-content', maxWidth: '100%' };
  }
  return {
    left: `${center}%`,
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: `${Math.max(maxWidthPct, MIN_LEGEND_COLUMN_PCT)}%`
  };
};

const buildLegendEntry = (key, ctx) => {
  const { currency, income, hasIncome } = ctx;
  const amountFor = (value) => (hasIncome ? formatCurrency(value, currency) : '—');
  const pctFor = (value) => formatPercentOf(value, income);

  if (key === 'essential') {
    return {
      label: 'Essential',
      labelMod: 'essential',
      valueMod: 'essential',
      amount: amountFor(ctx.essentialTotal),
      pct: pctFor(ctx.essentialTotal),
      meta: ctx.isCurrentMonth && ctx.predictedEssentialAverage > 0 ? (
        <PredictedEssentialAverageMeta
          average={ctx.predictedEssentialAverage}
          currency={currency}
        />
      ) : null
    };
  }

  if (key === 'overspend') {
    return {
      label: 'Overspend',
      labelMod: 'nonEssential',
      valueMod: 'negative',
      amount: amountFor(ctx.savingsValue),
      pct: pctFor(ctx.savingsValue),
      goal: 'Over budget'
    };
  }

  if (key === 'nonEssential') {
    return {
      label: 'Non-essential',
      labelMod: 'nonEssential',
      valueMod: 'nonEssential',
      amount: amountFor(ctx.nonEssentialTotal),
      pct: pctFor(ctx.nonEssentialTotal)
    };
  }

  if (key === 'expenses') {
    return {
      label: 'Expenses',
      labelMod: 'nonEssential',
      valueMod: 'nonEssential',
      amount: amountFor(ctx.splitExpensesTotal),
      pct: pctFor(ctx.splitExpensesTotal)
    };
  }

  const savingsGoal = formatSavingsAmountGoalMeta(ctx.savingsValue, currency);
  return {
    label: 'Savings',
    labelMod: 'savings',
    valueMod: ctx.savingsValue >= 0 ? 'positive' : 'negative',
    amount: hasIncome ? (
      <>
        {ctx.savingsValue >= 0 ? '+' : ''}{formatCurrency(ctx.savingsValue, currency)}
      </>
    ) : '—',
    pct: pctFor(ctx.savingsValue),
    goal: !ctx.hasExpenseSplit ? savingsGoal.label : null,
    goalColor: !ctx.hasExpenseSplit ? savingsGoal.color : null
  };
};

const AllocationLegendItem = ({ entry }) => {
  const valueClassName = entry.valueMod === 'positive' || entry.valueMod === 'negative'
    ? `month-allocation-legend-value ${entry.valueMod}`
    : `month-allocation-legend-value month-allocation-legend-value--${entry.valueMod}`;

  return (
    <>
      <span className={`month-allocation-legend-label month-allocation-legend-label--${entry.labelMod}`}>
        {entry.label}
      </span>
      <span className={valueClassName}>
        {entry.amount}
        {entry.meta}
      </span>
      <span className="month-allocation-legend-pct">{entry.pct}</span>
      {entry.goal && (
        <span
          className="month-allocation-legend-goal"
          style={entry.goalColor ? { color: entry.goalColor } : undefined}
        >
          {entry.goal}
        </span>
      )}
    </>
  );
};

const MonthAllocationBar = ({
  income,
  essentialTotal,
  nonEssentialTotal,
  hasExpenseSplit,
  splitExpensesTotal,
  savingsValue,
  currency,
  isCurrentMonth,
  predictedEssentialAverage,
  predictedEssentialDifference,
  showPredictedGap,
  barEffectiveEssential,
  expenseBarTotal,
  activeSection,
  onSectionClick,
  sectionAvailability = {}
}) => {
  const isOverspent = savingsValue < 0;
  const hasIncome = income > 0;

  const barSegments = useMemo(() => {
    const buildSegment = (key, label, value, widthPct) => ({
      key,
      sectionKey: SEGMENT_CONFIG[key].sectionKey,
      label,
      value,
      widthPct,
      fillColor: SEGMENT_CONFIG[key].color
    });

    if (!hasIncome) {
      return [];
    }

    if (isOverspent) {
      if (hasExpenseSplit) {
        return [
          buildSegment(
            'essential',
            'Essential',
            essentialTotal,
            percentOf(showPredictedGap ? barEffectiveEssential : essentialTotal, expenseBarTotal)
          ),
          buildSegment('nonEssential', 'Non-essential', nonEssentialTotal, percentOf(nonEssentialTotal, expenseBarTotal))
        ].filter((segment) => segment.widthPct > 0);
      }
      return [
        buildSegment('expenses', 'Expenses', splitExpensesTotal, 100)
      ].filter((segment) => segment.widthPct > 0);
    }

    if (hasExpenseSplit) {
      return [
        buildSegment('essential', 'Essential', essentialTotal, percentOf(barEffectiveEssential, income)),
        buildSegment('nonEssential', 'Non-essential', nonEssentialTotal, percentOf(nonEssentialTotal, income)),
        buildSegment('savings', 'Savings', savingsValue, percentOf(savingsValue, income))
      ].filter((segment) => segment.widthPct > 0 || segment.value !== 0);
    }

    return [
      buildSegment('expenses', 'Expenses', splitExpensesTotal, percentOf(splitExpensesTotal, income)),
      buildSegment('savings', 'Savings', savingsValue, percentOf(savingsValue, income))
    ].filter((segment) => segment.widthPct > 0 || segment.value !== 0);
  }, [
    hasIncome,
    isOverspent,
    hasExpenseSplit,
    essentialTotal,
    barEffectiveEssential,
    expenseBarTotal,
    nonEssentialTotal,
    splitExpensesTotal,
    savingsValue,
    showPredictedGap,
    income
  ]);

  const legendContext = useMemo(() => ({
    currency,
    income,
    hasIncome,
    essentialTotal,
    nonEssentialTotal,
    splitExpensesTotal,
    savingsValue,
    hasExpenseSplit,
    isCurrentMonth,
    predictedEssentialAverage
  }), [
    currency,
    income,
    hasIncome,
    essentialTotal,
    nonEssentialTotal,
    splitExpensesTotal,
    savingsValue,
    hasExpenseSplit,
    isCurrentMonth,
    predictedEssentialAverage
  ]);

  const legendItems = useMemo(() => {
    const positions = computeLegendPositions(barSegments);
    if (isOverspent) {
      positions.push({ key: 'overspend', align: 'end' });
    }
    return positions.map((position) => ({
      position,
      entry: buildLegendEntry(position.key, legendContext)
    }));
  }, [barSegments, isOverspent, legendContext]);

  const ariaLabel = useMemo(() => {
    if (!hasIncome) return 'No income recorded';
    const parts = barSegments.map((segment) => `${segment.label}: ${formatCurrency(segment.value, currency)}`);
    if (isOverspent) {
      parts.push(`Overspend: ${formatCurrency(savingsValue, currency)}`);
    }
    return parts.join(', ');
  }, [barSegments, currency, hasIncome, isOverspent, savingsValue]);

  const incomeClickable = Boolean(sectionAvailability.income);

  const segmentClassName = (segment) => {
    const clickable = Boolean(sectionAvailability[segment.sectionKey]);
    const classes = [
      'month-allocation-segment',
      activeSection === segment.sectionKey ? 'month-allocation-segment--selected' : '',
      clickable ? 'month-allocation-segment--clickable' : 'month-allocation-segment--static'
    ].filter(Boolean).join(' ');
    return classes;
  };

  const segmentRadius = (index, total) => {
    if (total === 1) return '8px';
    if (index === 0) return '8px 0 0 8px';
    if (index === total - 1) return '0 8px 8px 0';
    return undefined;
  };

  const handleSegmentClick = (segment) => {
    if (!sectionAvailability[segment.sectionKey]) return;
    onSectionClick(segment.sectionKey);
  };

  return (
    <div className={`month-allocation metrics-bar-charts ${activeSection ? 'month-allocation--has-selection' : ''}`}>
      <button
        type="button"
        className={`month-allocation-header ${incomeClickable ? 'month-allocation-header--clickable' : ''} ${activeSection === 'income' ? 'month-allocation-header--selected' : ''}`}
        onClick={() => incomeClickable && onSectionClick('income')}
        disabled={!incomeClickable}
      >
        <span className="month-allocation-label">Income</span>
        <span className="month-allocation-income">{formatCurrency(income, currency)}</span>
      </button>

      <div
        className="month-allocation-bar"
        role="group"
        aria-label={ariaLabel}
      >
        {hasIncome && barSegments.map((segment, index) => {
          const clickable = Boolean(sectionAvailability[segment.sectionKey]);

          if (segment.key === 'essential' && showPredictedGap) {
            return (
              <button
                key={segment.key}
                type="button"
                className={segmentClassName(segment)}
                style={{ width: `${segment.widthPct}%`, borderRadius: segmentRadius(index, barSegments.length) }}
                onClick={() => handleSegmentClick(segment)}
                disabled={!clickable}
                title={`Essential: ${formatCurrency(essentialTotal, currency)} (${formatPercentOf(essentialTotal, income)} of income)`}
                aria-expanded={activeSection === segment.sectionKey}
              >
                <div
                  className="month-allocation-segment-fill"
                  style={{
                    width: `${barEffectiveEssential > 0 ? (essentialTotal / barEffectiveEssential) * 100 : 0}%`,
                    backgroundColor: segment.fillColor
                  }}
                />
                <div
                  className="month-allocation-segment--predicted"
                  style={{
                    width: `${barEffectiveEssential > 0 ? (predictedEssentialDifference / barEffectiveEssential) * 100 : 0}%`,
                    background: PREDICTED_ESSENTIAL_HATCH
                  }}
                  title={`Predicted essential gap: ${formatCurrency(predictedEssentialDifference, currency)}`}
                />
              </button>
            );
          }

          return (
            <button
              key={segment.key}
              type="button"
              className={segmentClassName(segment)}
              style={{
                width: `${segment.widthPct}%`,
                backgroundColor: segment.fillColor,
                borderRadius: segmentRadius(index, barSegments.length)
              }}
              onClick={() => handleSegmentClick(segment)}
              disabled={!clickable}
              title={`${segment.label}: ${formatCurrency(segment.value, currency)} (${formatPercentOf(segment.value, income)} of income)`}
              aria-expanded={activeSection === segment.sectionKey}
            />
          );
        })}
      </div>

      <div className="month-allocation-legend">
        {legendItems.map(({ position, entry }) => (
          <div
            key={position.key}
            className={`month-allocation-legend-item month-allocation-legend-item--align-${position.align}`}
            style={getLegendItemStyle(position)}
          >
            <AllocationLegendItem entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(MonthAllocationBar);
