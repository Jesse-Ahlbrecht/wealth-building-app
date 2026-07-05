export const IBKR_KEYWORDS = ['interactive brokers', 'ibkr'];

export const isIbkrBankTransfer = (txn) => {
  const text = `${txn?.recipient || ''} ${txn?.description || ''}`.toLowerCase();
  return IBKR_KEYWORDS.some((keyword) => text.includes(keyword));
};

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
