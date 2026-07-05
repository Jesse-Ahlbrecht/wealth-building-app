import { useMemo } from 'react';
import { getSavingsCategoryTransactions } from '../utils/categoryHelpers';
import { parseExpenseSort, sortTransactions } from '../utils/transactionSortHelpers';

const predictionTypeFor = (type) => (type === 'income' ? 'income' : 'expense');

export function useCategoryTransactionIndex({ month, expenseSort, predictions, isCurrentMonth }) {
  return useMemo(() => {
    const sortConfig = parseExpenseSort(expenseSort);
    const txnCache = new Map();
    const countCache = new Map();

    const rawForCategory = (category, type) => {
      if (type === 'savings') {
        return getSavingsCategoryTransactions(month, category);
      }
      const field = type === 'income' ? 'incomeTransactions' : 'expenseTransactions';
      return month?.[field]?.[category] || [];
    };

    const predictionsFor = (category, type) => {
      if (!isCurrentMonth || !predictions?.length || type === 'savings') {
        return [];
      }
      const txnType = predictionTypeFor(type);
      return predictions.filter((p) => p.category === category && p.type === txnType);
    };

    const getCount = (category, type) => {
      const key = `${type}:${category}`;
      if (countCache.has(key)) {
        return countCache.get(key);
      }
      const count = rawForCategory(category, type).length + predictionsFor(category, type).length;
      countCache.set(key, count);
      return count;
    };

    const getTransactions = (category, type) => {
      const key = `${type}:${category}`;
      if (txnCache.has(key)) {
        return txnCache.get(key);
      }
      const list = [...rawForCategory(category, type), ...predictionsFor(category, type)];
      const sorted = sortTransactions(list, type, sortConfig);
      txnCache.set(key, sorted);
      return sorted;
    };

    return { getCount, getTransactions, sortConfig };
  }, [month, expenseSort, predictions, isCurrentMonth]);
}
