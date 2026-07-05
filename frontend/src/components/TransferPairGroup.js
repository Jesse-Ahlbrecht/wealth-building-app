import React from 'react';
import { formatCurrency } from '../utils';

const dayDiffLabel = (dayDiff) =>
  dayDiff > 0 ? `${dayDiff} day${dayDiff === 1 ? '' : 's'} apart` : 'Same day';

const TransferPairGroup = ({
  pairKey,
  isExpanded,
  onToggle,
  label,
  dayDiff,
  amount,
  currency,
  defaultCurrency,
  children
}) => (
  <div className="transfer-pair-group">
    <button
      type="button"
      className="transfer-pair-header"
      onClick={() => onToggle(pairKey)}
    >
      <span className="transfer-pair-header-main">
        <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
        <span>{label}</span>
        <span className="transfer-pair-meta">{dayDiffLabel(dayDiff)}</span>
      </span>
      <span className="transfer-pair-amount">
        {formatCurrency(Math.abs(amount), currency || defaultCurrency)}
      </span>
    </button>
    {isExpanded && (
      <div className="transfer-pair-legs">
        {children}
      </div>
    )}
  </div>
);

export default TransferPairGroup;
