import { useMemo } from 'react';
import { buildBrokerMonthlySavings, enrichSummaryWithBrokerSavings } from '../utils/categoryHelpers';
import { useBrokerData } from './useBrokerData';
import { useTransactionSummary } from './useTransactionSummary';

export function useEnrichedTransactionSummary(options = {}) {
  const transactionSummary = useTransactionSummary(options);
  const { broker, loading: brokerLoading } = useBrokerData();

  const brokerByMonth = useMemo(() => buildBrokerMonthlySavings(broker), [broker]);

  const enrichedSummary = useMemo(
    () => enrichSummaryWithBrokerSavings(transactionSummary.summary, brokerByMonth),
    [transactionSummary.summary, brokerByMonth]
  );

  const selectedMonth = useMemo(() => {
    const key = transactionSummary.selectedMonth?.month;
    if (!key) return null;
    return enrichedSummary.find((item) => item.month === key) ?? transactionSummary.selectedMonth;
  }, [enrichedSummary, transactionSummary.selectedMonth]);

  return {
    ...transactionSummary,
    summary: enrichedSummary,
    bankSummary: transactionSummary.summary,
    selectedMonth,
    broker,
    loading: transactionSummary.loading || brokerLoading
  };
}
