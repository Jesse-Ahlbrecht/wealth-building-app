import React, { useMemo } from 'react';
import CategoryRows from './CategoryRows';
import CategoryTotalFooter from './CategoryTotalFooter';
import PredictedEssentialAverageMeta from './PredictedEssentialAverageMeta';

const MonthCategoryBreakdown = ({
  month,
  defaultCurrency,
  isCurrentMonth,
  activeSection,
  incomeTotal,
  expandedCategories,
  toggleCategory,
  essentialExpenses,
  essentialTotal,
  nonEssentialExpenses,
  nonEssentialTotal,
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

  const rowProps = useMemo(() => ({
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
  }), [
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
  ]);

  const essentialAvgSubtitle = isCurrentMonth && predictedEssentialAverage > 0 ? (
    <PredictedEssentialAverageMeta
      average={predictedEssentialAverage}
      currency={defaultCurrency}
    />
  ) : null;

  const sections = useMemo(() => ({
    essential: {
      categories: essentialExpenses,
      sectionPrefix: 'essential',
      footerLabel: 'Total Essential',
      total: essentialTotal,
      type: 'expense',
      showSortControls: true,
      subtitle: essentialAvgSubtitle
    },
    nonEssential: {
      categories: nonEssentialExpenses,
      sectionPrefix: 'nonessential',
      footerLabel: 'Total Non-Essential',
      total: nonEssentialTotal,
      type: 'expense',
      showSortControls: true
    },
    savings: {
      categories: savingsCategories,
      sectionPrefix: 'savings',
      footerLabel: 'Total Savings Movements',
      total: savingsCategoryTotal,
      type: 'savings',
      showSortControls: true,
      indent: true
    },
    income: {
      categories: month.incomeCategories,
      sectionPrefix: 'income',
      footerLabel: 'Total Income',
      total: incomeTotal,
      type: 'income'
    }
  }), [
    essentialExpenses,
    essentialTotal,
    essentialAvgSubtitle,
    nonEssentialExpenses,
    nonEssentialTotal,
    savingsCategories,
    savingsCategoryTotal,
    month.incomeCategories,
    incomeTotal
  ]);

  if (!activeSection) {
    return null;
  }

  const section = sections[activeSection];
  if (!section || Object.keys(section.categories).length === 0) {
    return null;
  }

  if (activeSection === 'income' && incomeTotal <= 0) {
    return null;
  }

  return (
    <div className="month-breakdown-panel">
      <CategoryRows
        {...rowProps}
        sectionPrefix={section.sectionPrefix}
        categories={section.categories}
        type={section.type}
        showSortControls={section.showSortControls}
      />
      <CategoryTotalFooter
        label={section.footerLabel}
        total={section.total}
        defaultCurrency={defaultCurrency}
        subtitle={section.subtitle}
        indent={section.indent}
      />
    </div>
  );
};

export default React.memo(MonthCategoryBreakdown);
