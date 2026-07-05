import React from 'react';
import { formatCurrency } from '../utils';

const PredictedEssentialAverageMeta = ({ average, currency }) => (
  <span className="month-allocation-legend-meta">
    (avg: {formatCurrency(average, currency)})
  </span>
);

export default PredictedEssentialAverageMeta;
