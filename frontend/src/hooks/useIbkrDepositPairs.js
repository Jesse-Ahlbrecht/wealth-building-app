import { useMemo } from 'react';
import { transactionsAPI } from '../api/transactions';
import { useLazyPairData } from './useLazyPairData';

const EMPTY = { pairs: [] };

const parseIbkrDepositPairs = (raw) => ({
  pairs: Array.isArray(raw?.pairs) ? raw.pairs : []
});

export function useIbkrDepositPairs() {
  const parse = useMemo(() => parseIbkrDepositPairs, []);
  const { data, reload } = useLazyPairData(transactionsAPI.getIbkrDepositPairs, parse, EMPTY);
  return { ibkrDepositPairData: data, reloadIbkrDepositPairs: reload };
}
