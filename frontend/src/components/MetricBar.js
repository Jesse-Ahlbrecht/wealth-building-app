import React from 'react';
import { formatCurrency } from '../utils';

const MetricBar = ({ label, value, maxValue, currency, type = 'positive' }) => {
  const percentage = maxValue > 0 ? (Math.abs(value) / maxValue) * 100 : 0;

  return (
    <div className="metric-bar-item">
      <div className="metric-bar-header">
        <span className="metric-bar-label">{label}</span>
        <div className={`metric-bar-value ${type}`}>
          {formatCurrency(value, currency)}
        </div>
      </div>
      <div className="metric-bar-container">
        <div
          className={`metric-bar-fill ${type}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default MetricBar;
