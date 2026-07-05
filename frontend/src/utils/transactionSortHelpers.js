export const parseExpenseSort = (expenseSort) => {
  const [sortFieldRaw, sortDirectionRaw] = (expenseSort || 'amount_desc').split('_');
  const sortField = ['amount', 'date', 'recipient'].includes(sortFieldRaw) ? sortFieldRaw : 'amount';
  const sortDirection = sortDirectionRaw === 'asc' ? 'asc' : 'desc';
  return { sortField, sortDirection };
};

export const sortTransactions = (transactions, type, { sortField, sortDirection }) => {
  const sorted = [...(transactions || [])];
  const getAmount = (txn) => Math.abs(txn.amount || 0);
  const getDate = (txn) => {
    const value = txn?.date ? new Date(txn.date).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  };
  const getRecipient = (txn) => (txn?.recipient || '').toString().toLowerCase();

  if (type === 'expense' || type === 'savings') {
    const directionMultiplier = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'amount') {
      return sorted.sort((a, b) => {
        const amountDelta = (getAmount(a) - getAmount(b)) * directionMultiplier;
        return amountDelta !== 0 ? amountDelta : getDate(b) - getDate(a);
      });
    }
    if (sortField === 'recipient') {
      return sorted.sort((a, b) => {
        const recipientDelta = getRecipient(a).localeCompare(getRecipient(b)) * directionMultiplier;
        return recipientDelta !== 0 ? recipientDelta : getDate(b) - getDate(a);
      });
    }
    return sorted.sort((a, b) => {
      const dateDelta = (getDate(a) - getDate(b)) * directionMultiplier;
      return dateDelta !== 0 ? dateDelta : getAmount(b) - getAmount(a);
    });
  }

  return sorted.sort((a, b) => getDate(b) - getDate(a));
};
