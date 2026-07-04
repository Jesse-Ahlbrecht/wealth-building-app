import React from 'react';
import { formatCurrency } from '../utils';

const CollapsibleBreakdownSection = ({
  monthKey,
  sectionId,
  title,
  total,
  defaultCurrency,
  expandedSections,
  setExpandedSections,
  children,
  footer
}) => {
  const sectionKey = `${monthKey}-${sectionId}`;
  const isExpanded = expandedSections[sectionKey];

  return (
    <div className="categories-section">
      <div
        className="category-item category-section-header"
        onClick={() => {
          setExpandedSections((prev) => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
          }));
        }}
        style={{
          cursor: 'pointer',
          fontWeight: '600',
          marginBottom: isExpanded ? '8px' : '0'
        }}
      >
        <div style={{ flex: 1 }}>
          <span className="category-name">
            <span className="expand-arrow" style={{ marginRight: '8px' }}>
              {isExpanded ? '▼' : '▶'}
            </span>
            {title}
          </span>
        </div>
        <span className="stat-value" style={{ fontWeight: '700' }}>
          {formatCurrency(total, defaultCurrency)}
        </span>
      </div>
      {isExpanded && children}
      {isExpanded && footer}
    </div>
  );
};

export default CollapsibleBreakdownSection;
