import React from 'react';
import { formatCurrency } from '../utils';
import { sumCategoryAmounts } from '../utils/categoryHelpers';
import CollapsibleBreakdownSection from './CollapsibleBreakdownSection';
import CategoryRows from './CategoryRows';
import CategoryTotalFooter from './CategoryTotalFooter';

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
