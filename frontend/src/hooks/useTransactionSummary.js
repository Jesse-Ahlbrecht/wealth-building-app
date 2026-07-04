import { useState, useCallback, useEffect } from 'react';
import { transactionsAPI } from '../api';
import { parseSummaryResponse } from '../utils/apiHelpers';

export function useTransactionSummary({ syncSelectedMonth = false } = {}) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const loadSummary = useCallback(async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const response = await transactionsAPI.getSummary();
      const summaryData = parseSummaryResponse(response);
      setSummary(summaryData);
      if (syncSelectedMonth) {
        setSelectedMonth((current) => {
          if (!current?.month) return current;
          return summaryData.find((item) => item.month === current.month) || current;
        });
      }
    } catch (err) {
      console.error('Error loading summary:', err);
      setError(err.message || 'Failed to load summary data');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [syncSelectedMonth]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refreshSummary = useCallback(() => loadSummary({ showLoading: false }), [loadSummary]);

  return {
    summary,
    loading,
    error,
    loadSummary,
    refreshSummary,
    selectedMonth,
    setSelectedMonth
  };
}
