import { useCallback, useEffect, useRef, useState } from 'react';
import { transactionsAPI } from '../api/transactions';

export function useIbkrDepositPairs() {
  const [ibkrDepositPairData, setIbkrDepositPairData] = useState({ pairs: [] });
  const loadedRef = useRef(false);

  const loadIbkrDepositPairs = useCallback(async ({ force = false } = {}) => {
    if (!force && loadedRef.current) return;
    try {
      const data = await transactionsAPI.getIbkrDepositPairs();
      setIbkrDepositPairData({
        pairs: Array.isArray(data?.pairs) ? data.pairs : []
      });
      loadedRef.current = true;
    } catch (err) {
      console.error('Error loading IBKR deposit pairs:', err);
      setIbkrDepositPairData({ pairs: [] });
    }
  }, []);

  useEffect(() => {
    loadIbkrDepositPairs();
  }, [loadIbkrDepositPairs]);

  const reloadIbkrDepositPairs = useCallback(
    () => loadIbkrDepositPairs({ force: true }),
    [loadIbkrDepositPairs]
  );

  return { ibkrDepositPairData, reloadIbkrDepositPairs };
}
