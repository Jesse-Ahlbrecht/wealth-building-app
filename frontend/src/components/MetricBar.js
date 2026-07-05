import React from 'react';
import { formatCurrency } from '../utils';

const MetricBar = ({
  label,
  value,
  maxValue,
  currency,
  type = 'positive',
  valueMeta = null,
  overlayValue = 0,
  overlayTitle = null
}) => {
  const percentage = maxValue > 0 ? (Math.abs(value) / maxValue) * 100 : 0;
  const overlayPercentage = maxValue > 0 ? (Math.abs(overlayValue) / maxValue) * 100 : 0;
  const hasOverlay = overlayValue > 0;

  return (
    <div className="metric-bar-item">
      <div className="metric-bar-header">
        <span className="metric-bar-label">{label}</span>
        <div className={`metric-bar-value ${type}`}>
          {formatCurrency(value, currency)}
          {valueMeta}
        </div>
      </div>
      <div className="metric-bar-container">
        {hasOverlay ? (
          <div className="metric-bar-fill-row">
            <div
              className={`metric-bar-fill ${type}`}
              style={{ width: `${percentage}%`, borderRadius: '8px 0 0 8px' }}
            />
            <div
              className="metric-bar-fill-overlay"
              style={{ width: `${overlayPercentage}%` }}
              title={overlayTitle || undefined}
            />
          </div>
        ) : (
          <div
            className={`metric-bar-fill ${type}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
};

export default MetricBar;
