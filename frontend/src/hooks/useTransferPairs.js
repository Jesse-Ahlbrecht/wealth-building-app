import { useMemo } from 'react';
import { transactionsAPI } from '../api/transactions';
import { useLazyPairData } from './useLazyPairData';

const EMPTY = { pairs: [], unmatched: [] };

const parseTransferPairs = (raw) => ({
  pairs: Array.isArray(raw?.pairs) ? raw.pairs : [],
  unmatched: Array.isArray(raw?.unmatched) ? raw.unmatched : []
});

export function useTransferPairs() {
  const parse = useMemo(() => parseTransferPairs, []);
  const { data, reload } = useLazyPairData(transactionsAPI.getTransferPairs, parse, EMPTY);
  return { transferPairData: data, reloadTransferPairs: reload };
}
