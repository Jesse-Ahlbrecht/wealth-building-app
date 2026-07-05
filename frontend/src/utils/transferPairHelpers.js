import { getMonthKeyFromDate } from './dateHelpers';

export { getMonthKeyFromDate };

export const getPairedHashesForMonth = (pairsInMonth) => {
  const hashes = new Set();
  pairsInMonth.forEach((pair) => {
    if (pair?.outflow?.transaction_hash) hashes.add(pair.outflow.transaction_hash);
    if (pair?.inflow?.transaction_hash) hashes.add(pair.inflow.transaction_hash);
  });
  return hashes;
};

export const getUnpairedInternalTransfersForMonth = (internalTransferTransactions, pairsInMonth) => {
  const pairedHashes = getPairedHashesForMonth(pairsInMonth);
  return (internalTransferTransactions || []).filter(
    (txn) => txn?.transaction_hash && !pairedHashes.has(txn.transaction_hash)
  );
};
