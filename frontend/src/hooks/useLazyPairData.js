import { useCallback, useEffect, useRef, useState } from 'react';

export function useLazyPairData(fetchFn, parseResponse, emptyState, { autoLoad = true } = {}) {
  const [data, setData] = useState(emptyState);
  const loadedRef = useRef(false);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!force && loadedRef.current) return;
    try {
      const raw = await fetchFn();
      setData(parseResponse(raw));
      loadedRef.current = true;
    } catch (err) {
      console.error('Error loading pair data:', err);
      setData(emptyState);
    }
  }, [fetchFn, parseResponse, emptyState]);

  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [autoLoad, load]);

  const reload = useCallback(() => load({ force: true }), [load]);

  return { data, reload, load };
}
