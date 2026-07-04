import { useCallback, useEffect, useState } from 'react';
import { brokerAPI } from '../api';

export function useBrokerData() {
  const [broker, setBroker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadBroker = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await brokerAPI.getBroker();
      setBroker(data);
    } catch (err) {
      console.error('Error loading broker data:', err);
      setError(err.message || 'Failed to load broker data');
      setBroker(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadBroker();
  }, [reloadBroker]);

  return { broker, loading, error, reloadBroker };
}
