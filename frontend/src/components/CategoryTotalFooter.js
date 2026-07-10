import React from 'react';
import { formatCurrency } from '../utils';
import { formatPercentOf } from '../utils/finance';
import { useCockpitDisplay } from '../context/CockpitDisplayContext';

const CategoryTotalFooter = ({
  label,
  total,
  defaultCurrency,
  subtitle,
  indent = false,
  incomeTotal = 0
}) => {
  const { valueMode } = useCockpitDisplay();
  return (
  <div style={{
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--color-border-primary)',
    ...(indent ? { marginLeft: '24px' } : {})
  }}>
    <div className="category-item category-subitem" style={{ fontWeight: '600' }}>
      <span className="category-name">
        {label}
        {subtitle}
      </span>
      <span className="stat-value" style={{ fontWeight: '700' }}>
        {valueMode === 'percentage'
          ? formatPercentOf(total, incomeTotal)
          : formatCurrency(total, defaultCurrency)}
      </span>
    </div>
  </div>
  );
};

export default CategoryTotalFooter;
