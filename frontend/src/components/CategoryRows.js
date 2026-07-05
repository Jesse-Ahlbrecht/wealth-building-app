import React from 'react';
import { formatCurrency } from '../utils';
import ExpenseSortControls from './ExpenseSortControls';

const CategoryRows = ({
  monthKey,
  sectionPrefix,
  categories,
  type,
  defaultCurrency,
  expandedCategories,
  toggleCategory,
  getCount,
  getTransactions,
  renderTransactionItem,
  showSortControls = false,
  sortField,
  sortDirection,
  onSortToggle,
  footer
}) => {
  const entries = Object.entries(categories || {});
  if (entries.length === 0) return null;
  const maxAmount = Math.max(...entries.map(([, amount]) => amount));

  return (
    <div className="category-list">
      {entries
        .sort(([, a], [, b]) => b - a)
        .map(([category, amount]) => {
          const categoryKey = `${monthKey}-${sectionPrefix}-${category}`;
          const isExpanded = expandedCategories[categoryKey];
          const transactionCount = getCount(category, type);

          return (
            <div key={category} style={{ marginLeft: '24px', marginTop: '4px' }}>
              <div
                className="category-item category-subitem"
                onClick={() => toggleCategory(categoryKey)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <div className="category-name">
                    <span className="expand-arrow" style={{ marginRight: '8px' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    {category}
                    {transactionCount > 0 && (
                      <span className="transaction-count">({transactionCount})</span>
                    )}
                  </div>
                  <div className="category-bar">
                    <div
                      className={`category-bar-fill ${type === 'income' || type === 'savings' ? 'category-bar-income' : ''}`}
                      style={{ width: `${maxAmount > 0 ? (amount / maxAmount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="category-amount">
                  {formatCurrency(amount, defaultCurrency)}
                </div>
              </div>
              {isExpanded && transactionCount > 0 && (
                <div className="transaction-list-wrapper" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                  {showSortControls && (
                    <ExpenseSortControls
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSortToggle={onSortToggle}
                    />
                  )}
                  <div className="transaction-list">
                    {getTransactions(category, type).map((txn, idx) =>
                      renderTransactionItem(txn, idx, { dismissible: type !== 'income' })
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      {footer}
    </div>
  );
};

export default CategoryRows;
