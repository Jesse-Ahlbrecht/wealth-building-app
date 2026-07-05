import { useCallback, useEffect, useRef, useState } from 'react';
import { predictionsAPI } from '../api';
import { unwrapList } from '../utils/predictionHelpers';

export function useRecurringPayments() {
  const [recurringPayments, setRecurringPayments] = useState([]);
  const loadedRef = useRef(false);

  const loadRecurringPayments = useCallback(async ({ force = false } = {}) => {
    if (!force && loadedRef.current) return;
    try {
      const data = unwrapList(await predictionsAPI.getRecurringPayments());
      loadedRef.current = true;
      setRecurringPayments(data);
    } catch (err) {
      console.error('Error loading recurring payments:', err);
      loadedRef.current = true;
      setRecurringPayments([]);
    }
  }, []);

  useEffect(() => {
    loadRecurringPayments();
  }, [loadRecurringPayments]);

  const reloadRecurringPayments = useCallback(
    () => loadRecurringPayments({ force: true }),
    [loadRecurringPayments]
  );

  return { recurringPayments, reloadRecurringPayments };
}
