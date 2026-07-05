import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { transactionsAPI } from '../api/transactions';
import { useLazyPairData } from '../hooks/useLazyPairData';
import {
  buildPairIndex,
  getMonthPairSlice
} from '../utils/pairIndexHelpers';

const EMPTY_TRANSFER = { pairs: [], unmatched: [] };
const EMPTY_IBKR = { pairs: [] };
const LAZY_PAIR_OPTS = { autoLoad: false };

const PairDataContext = createContext(null);
const PairIndexContext = createContext(null);
const PairsLoadedContext = createContext(false);

const parsePairResponse = (raw, { includeUnmatched = false } = {}) => ({
  pairs: Array.isArray(raw?.pairs) ? raw.pairs : [],
  ...(includeUnmatched ? { unmatched: Array.isArray(raw?.unmatched) ? raw.unmatched : [] } : {})
});

export function PairDataProvider({ children }) {
  const { data: transferPairData, reload: reloadTransferPairs, load: loadTransferPairs, isLoaded: transferLoaded } = useLazyPairData(
    transactionsAPI.getTransferPairs,
    (raw) => parsePairResponse(raw, { includeUnmatched: true }),
    EMPTY_TRANSFER,
    LAZY_PAIR_OPTS
  );
  const { data: ibkrDepositPairData, reload: reloadIbkrDepositPairs, load: loadIbkrDepositPairs, isLoaded: ibkrLoaded } = useLazyPairData(
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

  const pairsLoaded = transferLoaded && ibkrLoaded;

  const reloadValue = useMemo(() => ({
    reloadTransferPairs,
    reloadIbkrDepositPairs,
    ensureLoaded
  }), [reloadTransferPairs, reloadIbkrDepositPairs, ensureLoaded]);

  return (
    <PairDataContext.Provider value={reloadValue}>
      <PairsLoadedContext.Provider value={pairsLoaded}>
        <PairIndexContext.Provider value={pairIndex}>
          {children}
        </PairIndexContext.Provider>
      </PairsLoadedContext.Provider>
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

export function usePairsLoaded() {
  return useContext(PairsLoadedContext);
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

export { usePairIndex };

export function useMonthPairSlice(monthKey) {
  useEnsurePairData(Boolean(monthKey));
  const pairIndex = usePairIndex();
  return useMemo(
    () => (monthKey ? getMonthPairSlice(pairIndex, monthKey) : null),
    [pairIndex, monthKey]
  );
}

export function useMonthPairSlices(monthKeys) {
  useEnsurePairData(Boolean(monthKeys?.length));
  const pairIndex = usePairIndex();
  const keysKey = (monthKeys || []).join(',');
  return useMemo(() => {
    const slices = {};
    (monthKeys || []).forEach((monthKey) => {
      if (monthKey) {
        slices[monthKey] = getMonthPairSlice(pairIndex, monthKey);
      }
    });
    return slices;
  }, [pairIndex, keysKey]);
}
