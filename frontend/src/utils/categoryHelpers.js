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

export const classifyExpenseCategory = (category, essentialSet, includeLoanPayments) => {
  const isLoanPayment = isLoanPaymentCategory(category);

  if (SAVINGS_CATEGORY_NAMES.has(category) && !(isLoanPayment && !includeLoanPayments)) {
    return 'savings';
  }
  if (includeLoanPayments && isLoanPayment) {
    return 'skip';
  }
  if (!includeLoanPayments && isLoanPayment) {
    return 'essential';
  }
  return essentialSet.has(category.toLowerCase()) ? 'essential' : 'nonEssential';
};

export const splitExpenseCategoryAmounts = (expenseCategories, essentialCategories, includeLoanPayments) => {
  const essential = {};
  const nonEssential = {};
  const savingsCategories = {};

  if (!expenseCategories || Object.keys(expenseCategories).length === 0) {
    return { essential, nonEssential, savingsCategories };
  }

  const essentialSet = buildEssentialCategorySet(essentialCategories);

  Object.entries(expenseCategories).forEach(([category, amount]) => {
    const bucket = classifyExpenseCategory(category, essentialSet, includeLoanPayments);
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
    if (SAVINGS_CATEGORY_NAMES.has(category)) {
      groups.savings.push(category);
      return;
    }
    if (essentialSet.has(category.toLowerCase())) {
      groups.essential.push(category);
      return;
    }
    groups.nonEssential.push(category);
  });

  return groups;
};

export const getLoanPaymentFromExpenseCategories = (expenseCategories) => {
  if (!expenseCategories) return 0;
  const loanCategory = Object.keys(expenseCategories).find(isLoanPaymentCategory);
  if (!loanCategory) return 0;
  const value = expenseCategories[loanCategory];
  return typeof value === 'number' ? value : (value?.total || 0);
};
