import { getMonthKeyFromDate } from './dateHelpers';
import { getUnpairedInternalTransfersForMonth } from './transferPairHelpers';
import { getUnpairedIbkrBankTransfersForMonth } from './ibkrDepositPairHelpers';

const EMPTY_TXNS = [];

export const EMPTY_PAIR_BUNDLE = {
  transferPairsInMonth: [],
  ibkrDepositPairsInMonth: [],
  ibkrMatchByBankHash: new Map(),
  unpairedInternalTransfers: [],
  unpairedIbkrBankTransfers: []
};

export const getInternalTransferTransactions = (month) => (
  month?.internalTransferTotal > 0
    ? (month.internalTransferTransactions ?? EMPTY_TXNS)
    : EMPTY_TXNS
);

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

export const getMonthPairBundle = (pairIndex, monthKey, internalTransferTransactions = EMPTY_TXNS) => {
  const transferPairsInMonth = pairIndex.transferByMonth[monthKey] || [];
  const ibkrDepositPairsInMonth = pairIndex.ibkrByMonth[monthKey] || [];
  const ibkrMatchByBankHash = new Map();
  ibkrDepositPairsInMonth.forEach((pair) => {
    if (pair?.bank?.transaction_hash) {
      ibkrMatchByBankHash.set(pair.bank.transaction_hash, pair);
    }
  });
  return {
    transferPairsInMonth,
    ibkrDepositPairsInMonth,
    ibkrMatchByBankHash,
    unpairedInternalTransfers: getUnpairedInternalTransfersForMonth(
      internalTransferTransactions,
      transferPairsInMonth
    ),
    unpairedIbkrBankTransfers: getUnpairedIbkrBankTransfersForMonth(
      internalTransferTransactions,
      ibkrDepositPairsInMonth
    )
  };
};
