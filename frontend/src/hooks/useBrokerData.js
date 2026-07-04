import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export function useBrokerData() {
  const {
    broker,
    brokerLoading,
    brokerError,
    loadBroker
  } = useAppContext();

  const reloadBroker = useCallback(() => loadBroker({ force: true }), [loadBroker]);

  return {
    broker,
    loading: brokerLoading,
    error: brokerError,
    reloadBroker
  };
}
