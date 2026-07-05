export const INTERNAL_TRANSFER_CATEGORY = 'Internal Transfer';

export const BROKER_SAVINGS_INVESTMENTS = 'Interactive Brokers Investments';
export const BROKER_SAVINGS_CASH = 'Interactive Brokers Cash';

export const SAVINGS_CATEGORY_NAMES = new Set([
  INTERNAL_TRANSFER_CATEGORY,
  'Loan Payment',
  'Investment Account Payment',
  BROKER_SAVINGS_INVESTMENTS,
  BROKER_SAVINGS_CASH
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

export const normalizeCategoryEntry = (entry) => {
  if (typeof entry === 'string') {
    return { name: entry, source: 'system' };
  }
  return {
    name: entry?.name || '',
    source: entry?.source || 'system'
  };
};

export const normalizeCategoryList = (entries) =>
  (Array.isArray(entries) ? entries : []).map(normalizeCategoryEntry).filter((entry) => entry.name);

export const getCategoryNames = (entries) => normalizeCategoryList(entries).map((entry) => entry.name);

export const groupIncomeCategoryNames = (categories) => {
  const groups = { income: [], custom: [] };
  const seen = { income: new Set(), custom: new Set() };

  normalizeCategoryList(categories).forEach(({ name, source }) => {
    const bucket = source === 'custom' ? 'custom' : 'income';
    if (seen[bucket].has(name)) return;
    seen[bucket].add(name);
    groups[bucket].push(name);
  });

  return groups;
};

export const groupExpenseCategoryNames = (categories, essentialCategories) => {
  const essentialSet = buildEssentialCategorySet(essentialCategories);
  const groups = { essential: [], nonEssential: [], savings: [], custom: [] };
  const seen = { essential: new Set(), nonEssential: new Set(), savings: new Set(), custom: new Set() };

  normalizeCategoryList(categories).forEach(({ name, source }) => {
    if (source === 'custom') {
      if (seen.custom.has(name)) return;
      seen.custom.add(name);
      groups.custom.push(name);
      return;
    }
    const bucket = classifyExpenseCategory(name, essentialSet);
    if (bucket === 'skip') return;
    if (seen[bucket]?.has(name)) return;
    seen[bucket].add(name);
    groups[bucket].push(name);
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

export const getSavingsCategoryTransactions = (month, category) => {
  const fromSavings = month?.savingsTransactions?.[category] || [];
  if (fromSavings.length > 0) {
    return fromSavings;
  }
  return month?.expenseTransactions?.[category] || [];
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
