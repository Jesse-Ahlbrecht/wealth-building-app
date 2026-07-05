import { useCallback, useEffect, useRef, useState } from 'react';
import { transactionsAPI } from '../api/transactions';

export function useTransferPairs() {
  const [transferPairData, setTransferPairData] = useState({ pairs: [], unmatched: [] });
  const loadedRef = useRef(false);

  const loadTransferPairs = useCallback(async ({ force = false } = {}) => {
    if (!force && loadedRef.current) return;
    try {
      const data = await transactionsAPI.getTransferPairs();
      setTransferPairData({
        pairs: Array.isArray(data?.pairs) ? data.pairs : [],
        unmatched: Array.isArray(data?.unmatched) ? data.unmatched : []
      });
      loadedRef.current = true;
    } catch (err) {
      console.error('Error loading transfer pairs:', err);
      loadedRef.current = true;
      setTransferPairData({ pairs: [], unmatched: [] });
    }
  }, []);

  useEffect(() => {
    loadTransferPairs();
  }, [loadTransferPairs]);

  const reloadTransferPairs = useCallback(
    () => loadTransferPairs({ force: true }),
    [loadTransferPairs]
  );

  return { transferPairData, reloadTransferPairs };
}
