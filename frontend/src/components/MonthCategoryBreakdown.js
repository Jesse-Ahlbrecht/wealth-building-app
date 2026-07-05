import React from 'react';
import { formatCurrency } from '../utils';
import { sumCategoryAmounts } from '../utils/categoryHelpers';
import CollapsibleBreakdownSection from './CollapsibleBreakdownSection';
import ExpenseSortControls from './ExpenseSortControls';

const CategoryTotalFooter = ({ label, total, defaultCurrency, subtitle, indent = false }) => (
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
        {formatCurrency(total, defaultCurrency)}
      </span>
    </div>
  </div>
);

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

const MonthCategoryBreakdown = ({
  month,
  defaultCurrency,
  isCurrentMonth,
  expandedCategories,
  expandedSections,
  setExpandedSections,
  toggleCategory,
  essentialExpenses,
  essentialTotal,
  nonEssentialWithoutOther,
  nonEssentialWithoutOtherTotal,
  otherExpenseAmount,
  savingsCategories,
  savingsCategoryTotal,
  predictedEssentialAverage,
  getCount,
  getTransactions,
  renderTransactionItem,
  sortField,
  sortDirection,
  onSortToggle
}) => {
  const monthKey = month.month;
  const incomeTotal = sumCategoryAmounts(month.incomeCategories);
  const rowProps = {
    monthKey,
    defaultCurrency,
    expandedCategories,
    toggleCategory,
    getCount,
    getTransactions,
    renderTransactionItem,
    sortField,
    sortDirection,
    onSortToggle
  };

  return (
    <>
      {otherExpenseAmount > 0 && (
        <CollapsibleBreakdownSection
          monthKey={monthKey}
          sectionId="needs-review-section"
          title="Needs Review"
          total={otherExpenseAmount}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          className="needs-review-section"
        >
          <CategoryRows
            {...rowProps}
            sectionPrefix="needs-review"
            categories={{ Other: otherExpenseAmount }}
            type="expense"
            showSortControls
          />
        </CollapsibleBreakdownSection>
      )}

      {Object.keys(essentialExpenses).length > 0 && (
        <CollapsibleBreakdownSection
          monthKey={monthKey}
          sectionId="essential-section"
          title="Essential Expenses"
          total={essentialTotal}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          footer={(
            <CategoryTotalFooter
              label="Total Essential"
              total={essentialTotal}
              defaultCurrency={defaultCurrency}
              subtitle={isCurrentMonth && predictedEssentialAverage > 0 ? (
                <span style={{ fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>
                  (avg: {formatCurrency(predictedEssentialAverage, defaultCurrency)})
                </span>
              ) : null}
            />
          )}
        >
          <CategoryRows
            {...rowProps}
            sectionPrefix="essential"
            categories={essentialExpenses}
            type="expense"
            showSortControls
          />
        </CollapsibleBreakdownSection>
      )}

      {Object.keys(nonEssentialWithoutOther).length > 0 && (
        <CollapsibleBreakdownSection
          monthKey={monthKey}
          sectionId="nonessential-section"
          title="Non-Essential Expenses"
          total={nonEssentialWithoutOtherTotal}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          footer={(
            <CategoryTotalFooter
              label="Total Non-Essential"
              total={nonEssentialWithoutOtherTotal}
              defaultCurrency={defaultCurrency}
            />
          )}
        >
          <CategoryRows
            {...rowProps}
            sectionPrefix="nonessential"
            categories={nonEssentialWithoutOther}
            type="expense"
            showSortControls
          />
        </CollapsibleBreakdownSection>
      )}

      {Object.keys(savingsCategories).length > 0 && (
        <CollapsibleBreakdownSection
          monthKey={monthKey}
          sectionId="savings-section"
          title="Savings Movements"
          total={savingsCategoryTotal}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          footer={(
            <CategoryTotalFooter
              label="Total Savings Movements"
              total={savingsCategoryTotal}
              defaultCurrency={defaultCurrency}
              indent
            />
          )}
        >
          <CategoryRows
            {...rowProps}
            sectionPrefix="savings"
            categories={savingsCategories}
            type="savings"
            showSortControls
          />
        </CollapsibleBreakdownSection>
      )}

      {incomeTotal > 0 && (
        <CollapsibleBreakdownSection
          monthKey={monthKey}
          sectionId="income-section"
          title="Income"
          total={incomeTotal}
          defaultCurrency={defaultCurrency}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          footer={(
            <CategoryTotalFooter
              label="Total Income"
              total={incomeTotal}
              defaultCurrency={defaultCurrency}
            />
          )}
        >
          <CategoryRows
            {...rowProps}
            sectionPrefix="income"
            categories={month.incomeCategories}
            type="income"
          />
        </CollapsibleBreakdownSection>
      )}
    </>
  );
};

export default MonthCategoryBreakdown;
