export const INTERNAL_TRANSFER_CATEGORY = 'Internal Transfer';

export const BROKER_SAVINGS_INVESTMENTS = 'Interactive Brokers Investments';
export const BROKER_SAVINGS_CASH = 'Interactive Brokers Cash';

export const SAVINGS_CATEGORY_NAMES = new Set([
  'Transfer',
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

const normalizeBrokerSavingsTransaction = (txn, category) => {
  const isBuy = txn.type === 'buy';
  const amount = Math.abs(txn.amount || 0);
  const shares = txn.shares ? `${txn.shares} shares · ` : '';

  return {
    date: txn.date,
    amount: isBuy ? -amount : amount,
    currency: txn.currency,
    recipient: txn.security || txn.symbol || 'Interactive Brokers',
    description: isBuy
      ? `${shares}${txn.symbol || ''}`.trim()
      : (txn.type === 'forex' ? 'FX conversion' : txn.type),
    account: txn.account,
    category,
    type: 'expense'
  };
};

export const buildBrokerMonthlySavings = (broker) => {
  const byMonth = {};

  const ensureMonth = (monthKey) => {
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { savingsCategories: {}, savingsTransactions: {} };
    }
    return byMonth[monthKey];
  };

  const addToCategory = (monthKey, category, txn, signedAmount) => {
    if (!signedAmount) return;
    const month = ensureMonth(monthKey);
    month.savingsCategories[category] = (month.savingsCategories[category] || 0) + signedAmount;
    month.savingsTransactions[category] = month.savingsTransactions[category] || [];
    month.savingsTransactions[category].push(normalizeBrokerSavingsTransaction(txn, category));
  };

  (broker?.transactions || []).forEach((txn) => {
    if (txn.account !== 'Interactive Brokers') return;
    const monthKey = (txn.date || '').slice(0, 7);
    if (!monthKey || monthKey.length !== 7) return;

    const amount = Math.abs(txn.amount || 0);
    if (!amount) return;

    if (txn.type === 'buy') {
      addToCategory(monthKey, BROKER_SAVINGS_INVESTMENTS, txn, amount);
      return;
    }

    if (txn.type === 'deposit' || txn.type === 'sell') {
      addToCategory(monthKey, BROKER_SAVINGS_CASH, txn, amount);
      return;
    }

    if (txn.type === 'withdrawal') {
      addToCategory(monthKey, BROKER_SAVINGS_CASH, txn, -amount);
      return;
    }

    if (txn.type === 'forex') {
      addToCategory(monthKey, BROKER_SAVINGS_CASH, txn, amount);
    }
  });

  return byMonth;
};

export const enrichSummaryWithBrokerSavings = (summary, brokerByMonth) => {
  if (!Array.isArray(summary) || summary.length === 0 || !brokerByMonth || Object.keys(brokerByMonth).length === 0) {
    return summary;
  }

  return summary.map((month) => {
    const brokerMonth = brokerByMonth[month.month];
    if (!brokerMonth) return month;

    const savingsCategories = { ...(month.savingsCategories || {}) };
    const savingsTransactions = { ...(month.savingsTransactions || {}) };

    Object.entries(brokerMonth.savingsCategories).forEach(([category, amount]) => {
      if (!amount) return;
      savingsCategories[category] = (savingsCategories[category] || 0) + amount;
    });

    Object.entries(brokerMonth.savingsTransactions).forEach(([category, txns]) => {
      savingsTransactions[category] = [...(savingsTransactions[category] || []), ...txns];
    });

    return { ...month, savingsCategories, savingsTransactions };
  });
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
