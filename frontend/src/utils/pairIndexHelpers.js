import { getMonthKeyFromDate } from './dateHelpers';
import { getUnpairedInternalTransfersForMonth } from './transferPairHelpers';
import { getUnpairedIbkrBankTransfersForMonth } from './ibkrDepositPairHelpers';

const EMPTY_TXNS = [];

export const EMPTY_PAIR_SLICE = {
  transferPairsInMonth: [],
  ibkrDepositPairsInMonth: [],
  ibkrMatchByBankHash: new Map()
};

export const EMPTY_PAIR_BUNDLE = {
  ...EMPTY_PAIR_SLICE,
  unpairedInternalTransfers: [],
  unpairedIbkrBankTransfers: []
};

export const getInternalTransferTransactions = (month) => (
  month?.internalTransferTotal > 0
    ? (month.internalTransferTransactions ?? EMPTY_TXNS)
    : EMPTY_TXNS
);

export const getInternalTxnFingerprint = (internalTransferTransactions = EMPTY_TXNS) => {
  if (!internalTransferTransactions.length) return '';
  return internalTransferTransactions
    .map((txn) => txn.transaction_hash || `${txn.date}|${txn.amount}|${txn.recipient}`)
    .join('\n');
};

let cachedPairIndex = null;
const sliceCache = new Map();
const unpairedCache = new Map();

const resetCachesIfNeeded = (pairIndex) => {
  if (cachedPairIndex !== pairIndex) {
    cachedPairIndex = pairIndex;
    sliceCache.clear();
    unpairedCache.clear();
  }
};

const indexPairsByMonth = (pairs, getLegDates) => {
  const byMonth = {};
  (pairs || []).forEach((pair) => {
    const months = new Set(
      getLegDates(pair).map(getMonthKeyFromDate).filter(Boolean)
    );
    months.forEach((monthKey) => {
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = [];
      }
      byMonth[monthKey].push(pair);
    });
  });
  return byMonth;
};

export const buildPairIndex = (transferPairs, ibkrPairs) => ({
  transferByMonth: indexPairsByMonth(transferPairs, (pair) => [
    pair?.outflow?.date,
    pair?.inflow?.date
  ]),
  ibkrByMonth: indexPairsByMonth(ibkrPairs, (pair) => [
    pair?.bank?.date,
    pair?.deposit?.date
  ])
});

export const getMonthPairSlice = (pairIndex, monthKey) => {
  resetCachesIfNeeded(pairIndex);
  if (sliceCache.has(monthKey)) {
    return sliceCache.get(monthKey);
  }
  const transferPairsInMonth = pairIndex.transferByMonth[monthKey] || [];
  const ibkrDepositPairsInMonth = pairIndex.ibkrByMonth[monthKey] || [];
  const ibkrMatchByBankHash = new Map();
  ibkrDepositPairsInMonth.forEach((pair) => {
    if (pair?.bank?.transaction_hash) {
      ibkrMatchByBankHash.set(pair.bank.transaction_hash, pair);
    }
  });
  const slice = { transferPairsInMonth, ibkrDepositPairsInMonth, ibkrMatchByBankHash };
  sliceCache.set(monthKey, slice);
  return slice;
};

export const getMonthPairUnpaired = (pairIndex, monthKey, slice, internalTransferTransactions = EMPTY_TXNS) => {
  resetCachesIfNeeded(pairIndex);
  const cacheKey = `${monthKey}:${getInternalTxnFingerprint(internalTransferTransactions)}`;
  if (unpairedCache.has(cacheKey)) {
    return unpairedCache.get(cacheKey);
  }
  const unpaired = {
    unpairedInternalTransfers: getUnpairedInternalTransfersForMonth(
      internalTransferTransactions,
      slice.transferPairsInMonth
    ),
    unpairedIbkrBankTransfers: getUnpairedIbkrBankTransfersForMonth(
      internalTransferTransactions,
      slice.ibkrDepositPairsInMonth
    )
  };
  unpairedCache.set(cacheKey, unpaired);
  return unpaired;
};

export const getMonthPairBundle = (pairIndex, monthKey, internalTransferTransactions = EMPTY_TXNS) => {
  const slice = getMonthPairSlice(pairIndex, monthKey);
  return {
    ...slice,
    ...getMonthPairUnpaired(pairIndex, monthKey, slice, internalTransferTransactions)
  };
};
