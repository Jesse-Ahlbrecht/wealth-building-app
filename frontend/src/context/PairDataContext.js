import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { transactionsAPI } from '../api/transactions';
import { useLazyPairData } from '../hooks/useLazyPairData';
import {
  buildPairIndex,
  getInternalTransferTransactions,
  getMonthPairBundle
} from '../utils/pairIndexHelpers';

const EMPTY_TRANSFER = { pairs: [], unmatched: [] };
const EMPTY_IBKR = { pairs: [] };
const LAZY_PAIR_OPTS = { autoLoad: false };

const PairDataContext = createContext(null);
const PairIndexContext = createContext(null);

const parsePairResponse = (raw, { includeUnmatched = false } = {}) => ({
  pairs: Array.isArray(raw?.pairs) ? raw.pairs : [],
  ...(includeUnmatched ? { unmatched: Array.isArray(raw?.unmatched) ? raw.unmatched : [] } : {})
});

export function PairDataProvider({ children }) {
  const { data: transferPairData, reload: reloadTransferPairs, load: loadTransferPairs } = useLazyPairData(
    transactionsAPI.getTransferPairs,
    (raw) => parsePairResponse(raw, { includeUnmatched: true }),
    EMPTY_TRANSFER,
    LAZY_PAIR_OPTS
  );
  const { data: ibkrDepositPairData, reload: reloadIbkrDepositPairs, load: loadIbkrDepositPairs } = useLazyPairData(
    transactionsAPI.getIbkrDepositPairs,
    parsePairResponse,
    EMPTY_IBKR,
    LAZY_PAIR_OPTS
  );

  const loadInFlightRef = useRef(null);
  const ensureLoaded = useCallback(() => {
    if (!loadInFlightRef.current) {
      loadInFlightRef.current = Promise.all([loadTransferPairs(), loadIbkrDepositPairs()])
        .finally(() => {
          loadInFlightRef.current = null;
        });
    }
    return loadInFlightRef.current;
  }, [loadTransferPairs, loadIbkrDepositPairs]);

  const pairIndex = useMemo(
    () => buildPairIndex(transferPairData.pairs, ibkrDepositPairData.pairs),
    [transferPairData.pairs, ibkrDepositPairData.pairs]
  );

  const reloadValue = useMemo(() => ({
    reloadTransferPairs,
    reloadIbkrDepositPairs,
    ensureLoaded
  }), [reloadTransferPairs, reloadIbkrDepositPairs, ensureLoaded]);

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

function useEnsurePairData(active = true) {
  const { ensureLoaded } = usePairReloads();
  useEffect(() => {
    if (active) {
      ensureLoaded();
    }
  }, [active, ensureLoaded]);
}

function usePairIndex() {
  const pairIndex = useContext(PairIndexContext);
  if (!pairIndex) {
    throw new Error('usePairIndex must be used within PairDataProvider');
  }
  return pairIndex;
}

export function useMonthPairBundle(monthKey, internalTransferTransactions) {
  useEnsurePairData(Boolean(monthKey));
  const pairIndex = usePairIndex();
  return useMemo(
    () => (monthKey
      ? getMonthPairBundle(pairIndex, monthKey, internalTransferTransactions)
      : null),
    [pairIndex, monthKey, internalTransferTransactions]
  );
}

export function useMonthPairBundles(months) {
  useEnsurePairData(Boolean(months?.length));
  const pairIndex = usePairIndex();
  return useMemo(() => {
    const bundles = {};
    (months || []).forEach((month) => {
      if (!month?.month) return;
      bundles[month.month] = getMonthPairBundle(
        pairIndex,
        month.month,
        getInternalTransferTransactions(month)
      );
    });
    return bundles;
  }, [pairIndex, months]);
}
