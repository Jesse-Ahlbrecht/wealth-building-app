import React, { createContext, useContext, useMemo } from 'react';
import { transactionsAPI } from '../api/transactions';
import { useLazyPairData } from '../hooks/useLazyPairData';
import { buildPairIndex, getMonthPairBundle } from '../utils/pairIndexHelpers';

const EMPTY_TRANSFER = { pairs: [], unmatched: [] };
const EMPTY_IBKR = { pairs: [] };
const EMPTY_TXNS = [];

const PairDataContext = createContext(null);
const PairIndexContext = createContext(null);

const parsePairResponse = (raw, { includeUnmatched = false } = {}) => ({
  pairs: Array.isArray(raw?.pairs) ? raw.pairs : [],
  ...(includeUnmatched ? { unmatched: Array.isArray(raw?.unmatched) ? raw.unmatched : [] } : {})
});

export function PairDataProvider({ children }) {
  const { data: transferPairData, reload: reloadTransferPairs } = useLazyPairData(
    transactionsAPI.getTransferPairs,
    (raw) => parsePairResponse(raw, { includeUnmatched: true }),
    EMPTY_TRANSFER
  );
  const { data: ibkrDepositPairData, reload: reloadIbkrDepositPairs } = useLazyPairData(
    transactionsAPI.getIbkrDepositPairs,
    parsePairResponse,
    EMPTY_IBKR
  );

  const pairIndex = useMemo(
    () => buildPairIndex(transferPairData.pairs, ibkrDepositPairData.pairs),
    [transferPairData.pairs, ibkrDepositPairData.pairs]
  );

  const reloadValue = useMemo(() => ({
    reloadTransferPairs,
    reloadIbkrDepositPairs
  }), [reloadTransferPairs, reloadIbkrDepositPairs]);

  return (
    <PairDataContext.Provider value={reloadValue}>
      <PairIndexContext.Provider value={pairIndex}>
        {children}
      </PairIndexContext.Provider>
    </PairDataContext.Provider>
  );
}

export function usePairReloads() {
  const context = useContext(PairDataContext);
  if (!context) {
    throw new Error('usePairReloads must be used within PairDataProvider');
  }
  return context;
}

export function useReloadIbkrDepositPairs() {
  return usePairReloads().reloadIbkrDepositPairs;
}

function usePairIndex() {
  const pairIndex = useContext(PairIndexContext);
  if (!pairIndex) {
    throw new Error('usePairIndex must be used within PairDataProvider');
  }
  return pairIndex;
}

export function useMonthPairBundle(monthKey, internalTransferTransactions = EMPTY_TXNS) {
  const pairIndex = usePairIndex();
  return useMemo(
    () => getMonthPairBundle(pairIndex, monthKey, internalTransferTransactions),
    [pairIndex, monthKey, internalTransferTransactions]
  );
}
