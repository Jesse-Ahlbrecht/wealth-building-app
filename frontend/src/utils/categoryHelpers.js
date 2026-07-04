export const SAVINGS_CATEGORY_NAMES = new Set([
  'Transfer',
  'Internal Transfer',
  'Loan Payment',
  'Investment Account Payment'
]);

export const isLoanPaymentCategory = (category) => {
  if (!category) return false;
  const normalized = category.toLowerCase();
  return normalized.includes('loan payment') || normalized.includes('loan');
};

export const buildEssentialCategorySet = (essentialCategories) =>
  new Set((essentialCategories || []).map((category) => category.toLowerCase()));

export const classifyExpenseCategory = (category, essentialSet) => {
  if (SAVINGS_CATEGORY_NAMES.has(category)) {
    return 'savings';
  }
  if (isLoanPaymentCategory(category)) {
    return 'skip';
  }
  return essentialSet.has(category.toLowerCase()) ? 'essential' : 'nonEssential';
};

export const splitExpenseCategoryAmounts = (expenseCategories, essentialCategories, essentialSet = null) => {
  const essential = {};
  const nonEssential = {};
  const savingsCategories = {};

  if (!expenseCategories || Object.keys(expenseCategories).length === 0) {
    return { essential, nonEssential, savingsCategories };
  }

  const set = essentialSet ?? buildEssentialCategorySet(essentialCategories);

  Object.entries(expenseCategories).forEach(([category, amount]) => {
    const bucket = classifyExpenseCategory(category, set);
    if (bucket === 'skip') return;
    if (bucket === 'savings') savingsCategories[category] = amount;
    else if (bucket === 'essential') essential[category] = amount;
    else nonEssential[category] = amount;
  });

  return { essential, nonEssential, savingsCategories };
};

export const groupExpenseCategoryNames = (categories, essentialCategories) => {
  const essentialSet = buildEssentialCategorySet(essentialCategories);
  const groups = { essential: [], nonEssential: [], savings: [] };

  (categories || []).forEach((category) => {
    const bucket = classifyExpenseCategory(category, essentialSet);
    if (bucket === 'skip') return;
    if (bucket === 'savings') groups.savings.push(category);
    else if (bucket === 'essential') groups.essential.push(category);
    else groups.nonEssential.push(category);
  });

  return groups;
};

export const sumCategoryAmounts = (categories) =>
  Object.values(categories || {}).reduce((sum, value) => sum + (value || 0), 0);

export const mergeSavingsCategories = (month, expenseSavingsCategories) => {
  const merged = { ...(month.savingsCategories || {}) };
  Object.entries(expenseSavingsCategories).forEach(([category, amount]) => {
    merged[category] = (merged[category] || 0) + amount;
  });
  return merged;
};

export const computeMonthExpenseBreakdown = (month, essentialCategories, essentialSet = null) => {
  const income = month.income || 0;
  const set = essentialSet ?? buildEssentialCategorySet(essentialCategories);
  const { essential, nonEssential, savingsCategories: expenseSavingsCategories } =
    splitExpenseCategoryAmounts(month.expenseCategories, essentialCategories, set);

  const essentialTotal = sumCategoryAmounts(essential);
  const nonEssentialTotal = sumCategoryAmounts(nonEssential);
  const splitExpensesTotal = essentialTotal + nonEssentialTotal;
  const savings = income - splitExpensesTotal;
  const savingRate = income > 0 ? (savings / income) * 100 : 0;

  return {
    essential,
    nonEssential,
    expenseSavingsCategories,
    essentialTotal,
    nonEssentialTotal,
    splitExpensesTotal,
    savings,
    savingRate,
    income
  };
};
