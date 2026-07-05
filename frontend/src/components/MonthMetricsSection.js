import React from 'react';
import { formatCurrency } from '../utils';
import { getSavingsGoalForCurrency } from '../utils/finance';
import MetricBar from './MetricBar';

const MonthMetricsSection = ({
  income,
  essentialTotal,
  nonEssentialTotal,
  savingsCategoryTotal,
  splitExpensesTotal,
  savingsMetricValue,
  metricMaxValue,
  defaultCurrency,
  isCurrentMonth,
  predictedEssentialAverage,
  predictedEssentialDifference
}) => (
  <div className="metrics-bar-charts">
    <MetricBar
      label="Income"
      value={income}
      maxValue={metricMaxValue}
      currency={defaultCurrency}
      type="positive"
    />
    {(essentialTotal > 0 || nonEssentialTotal > 0 || savingsCategoryTotal > 0) ? (
      <>
        <div className="metric-bar-item">
          <div className="metric-bar-header">
            <span className="metric-bar-label">Essential Expenses</span>
            <div className="metric-bar-value negative">
              {formatCurrency(essentialTotal, defaultCurrency)}
              {isCurrentMonth && predictedEssentialAverage > 0 && (
                <span className="metric-bar-meta" style={{ marginLeft: '8px', fontSize: '14px', opacity: 0.7 }}>
                  (avg: {formatCurrency(predictedEssentialAverage, defaultCurrency)})
                </span>
              )}
            </div>
          </div>
          <div className="metric-bar-container">
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <div
                className="metric-bar-fill negative"
                style={{
                  width: `${metricMaxValue > 0 ? (essentialTotal / metricMaxValue) * 100 : 0}%`,
                  borderRadius: (isCurrentMonth && predictedEssentialDifference > 0) ? '8px 0 0 8px' : '8px'
                }}
              />
              {isCurrentMonth && predictedEssentialDifference > 0 && (
                <div
                  style={{
                    width: `${metricMaxValue > 0 ? (predictedEssentialDifference / metricMaxValue) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.25), rgba(220, 38, 38, 0.15))',
                    borderRadius: '0 8px 8px 0',
                    minWidth: predictedEssentialDifference > 0 ? '2px' : '0'
                  }}
                  title={`Predicted essential gap: ${formatCurrency(predictedEssentialDifference, defaultCurrency)}`}
                />
              )}
            </div>
          </div>
        </div>
        <MetricBar
          label="Non-Essential Expenses"
          value={nonEssentialTotal}
          maxValue={metricMaxValue}
          currency={defaultCurrency}
          type="negative"
        />
      </>
    ) : (
      <MetricBar
        label="Expenses"
        value={splitExpensesTotal}
        maxValue={metricMaxValue}
        currency={defaultCurrency}
        type="negative"
      />
    )}
    <div className="metric-bar-item">
      <div className="metric-bar-header">
        <span className="metric-bar-label">Savings</span>
        <div className={`metric-bar-value ${savingsMetricValue >= 0 ? 'positive' : 'negative'}`}>
          {savingsMetricValue >= 0 ? '+' : ''}{formatCurrency(savingsMetricValue, defaultCurrency)}
        </div>
      </div>
      <div className="metric-bar-container">
        <div
          className={`metric-bar-fill ${savingsMetricValue >= 0 ? 'positive' : 'negative'}`}
          style={{ width: `${metricMaxValue > 0 ? (Math.abs(savingsMetricValue) / metricMaxValue) * 100 : 0}%` }}
        />
      </div>
      <div className="metric-bar-footer" style={{ fontSize: '12px', marginTop: '8px' }}>
        {`${((savingsMetricValue / getSavingsGoalForCurrency(defaultCurrency)) * 100).toFixed(0)}% of goal`}
      </div>
    </div>
  </div>
);

export default MonthMetricsSection;
