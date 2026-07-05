import { BROKER_SAVINGS_CASH } from './categoryHelpers';

export const IBKR_KEYWORDS = ['interactive brokers', 'ibkr'];

export const isIbkrBankTransfer = (txn) => {
  const text = `${txn?.recipient || ''} ${txn?.description || ''}`.toLowerCase();
  return IBKR_KEYWORDS.some((keyword) => text.includes(keyword));
};

export const normalizeIbkrBankLeg = (bank) => ({
  ...bank,
  amount: -Math.abs(bank.amount),
  type: bank.type || 'expense'
});

export const ibkrDepositToTransaction = (deposit, defaultCurrency) => ({
  date: deposit.date,
  recipient: deposit.security || 'Deposit',
  description: BROKER_SAVINGS_CASH,
  amount: Math.abs(deposit.amount),
  currency: deposit.currency || defaultCurrency,
  account: 'Interactive Brokers'
});

export const getPairedBankHashesForMonth = (pairsInMonth) => {
  const hashes = new Set();
  pairsInMonth.forEach((pair) => {
    if (pair?.bank?.transaction_hash) hashes.add(pair.bank.transaction_hash);
  });
  return hashes;
};

export const getUnpairedIbkrBankTransfersForMonth = (internalTransferTransactions, pairsInMonth) => {
  const pairedHashes = getPairedBankHashesForMonth(pairsInMonth);
  return (internalTransferTransactions || []).filter(
    (txn) => isIbkrBankTransfer(txn) && txn?.transaction_hash && !pairedHashes.has(txn.transaction_hash)
  );
};
