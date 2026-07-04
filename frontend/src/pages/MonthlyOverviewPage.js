/**
 * Monthly Overview Page
 * 
 * Displays current month progress and historical spending patterns.
 * Updated to use hooks and API layer with proper CSS classes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { transactionsAPI, predictionsAPI } from '../api';
import { useAppContext } from '../context/AppContext';
import { useCategoryData } from '../hooks';
import MonthSummaryCard from '../components/MonthSummaryCard';
import { parseSummaryResponse } from '../utils/apiHelpers';
import {
  getPredictionKey,
  getPredictionMonth,
  getLatestMonthKey,
  fetchPredictionsForMonth,
  fetchAverageEssentialSpending
} from '../utils/predictionHelpers';

const MonthlyOverviewPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const { essentialCategories, availableCategories } = useCategoryData();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize state from preferences or defaults
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false);
  const [expenseSort, setExpenseSort] = useState('amount_desc');

  useEffect(() => {
    if (preferences) {
      if (preferences.monthlyOverview_includeLoanPayments !== undefined) {
        setIncludeLoanPayments(preferences.monthlyOverview_includeLoanPayments);
      }
      if (preferences.monthlyOverview_expenseSort) {
        setExpenseSort(preferences.monthlyOverview_expenseSort);
      }
    }
  }, [preferences]);

  const handleIncludeLoanPaymentsChange = (value) => {
    setIncludeLoanPayments(value);
    updatePreferences({ monthlyOverview_includeLoanPayments: value });
  };

  const handleExpenseSortChange = (value) => {
    setExpenseSort(value);
    updatePreferences({ monthlyOverview_expenseSort: value });
  };

  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [predictions, setPredictions] = useState({});
  const [averageEssentialSpending, setAverageEssentialSpending] = useState({});

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    const month = getLatestMonthKey(summary);
    if (month) {
      loadPredictionsForMonth(month);
    }
  }, [summary]);

  useEffect(() => {
    const month = getLatestMonthKey(summary);
    if (month) {
      loadAverageEssentialSpending(month);
    }
  }, [summary, essentialCategories]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await transactionsAPI.getSummary();
      setSummary(parseSummaryResponse(response));
    } catch (err) {
      console.error('Error loading summary:', err);
      setError(err.message || 'Failed to load transaction summary');
    } finally {
      setLoading(false);
    }
  };

  const loadPredictionsForMonth = async (month) => {
    try {
      const predictionsData = await fetchPredictionsForMonth(month);
      setPredictions(prev => ({
        ...prev,
        [month]: predictionsData
      }));
    } catch (err) {
      console.error(`Error loading predictions for ${month}:`, err);
      setPredictions(prev => ({
        ...prev,
        [month]: []
      }));
    }
  };

  const loadAverageEssentialSpending = async (month) => {
    try {
      const average = await fetchAverageEssentialSpending(month);
      setAverageEssentialSpending(prev => ({
        ...prev,
        [month]: average
      }));
    } catch (err) {
      console.error(`Error loading average essential spending for ${month}:`, err);
      setAverageEssentialSpending(prev => ({
        ...prev,
        [month]: 0
      }));
    }
  };

  const monthOf = (prediction) =>
    getPredictionMonth(prediction, getLatestMonthKey(summary));

  const handleSkipPrediction = async (prediction) => {
    try {
      const month = monthOf(prediction);
      await predictionsAPI.skipPredictionForMonth(getPredictionKey(prediction), month);
      if (month) {
        loadPredictionsForMonth(month);
      }
    } catch (err) {
      console.error('Error skipping prediction:', err);
    }
  };

  const handleDeletePrediction = async (prediction) => {
    try {
      await predictionsAPI.updateRecurringPayment(getPredictionKey(prediction), {
        recipient: prediction.recipient,
        category: prediction.category,
        enabled: false
      });
      const month = monthOf(prediction);
      if (month) {
        loadPredictionsForMonth(month);
      }
    } catch (err) {
      console.error('Error deleting prediction:', err);
    }
  };

  const reloadCurrentMonthPredictions = () => {
    const month = getLatestMonthKey(summary);
    if (month) {
      loadPredictionsForMonth(month);
    }
  };

  const sortedMonths = useMemo(
    () => [...summary].sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01')),
    [summary]
  );

  if (loading) {
    return (
      <div className="current-month-container">
        <div className="loading">Loading transaction data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="current-month-container">
        <div className="error-message">
          {error}
          <button onClick={loadSummary} className="btn-secondary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary || summary.length === 0) {
    return (
      <div className="current-month-container">
        <div className="empty-state">
          <h3>No Transaction Data</h3>
          <p>Upload bank statements to see your monthly overview here.</p>
        </div>
      </div>
    );
  }

  const latestMonth = sortedMonths[0];
  const previousMonths = sortedMonths.slice(1);

  if (!latestMonth) {
    return (
      <div className="current-month-container">
        <div className="loading">Unable to determine the current month summary.</div>
      </div>
    );
  }

  return (
    <>
      {/* Controls at the top */}
      <div className="details-controls">
        <div className="loan-payment-toggle">
          <button
            className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
            onClick={() => handleIncludeLoanPaymentsChange(!includeLoanPayments)}
            title="Include monthly loan payments in savings calculation"
          >
            Include loans in saving
          </button>
        </div>
      </div>

      {/* Current Month Summary */}
      <div className="current-month-container">
        <MonthSummaryCard
          month={latestMonth}
          isCurrentMonth={true}
          defaultCurrency={defaultCurrency}
          essentialCategories={essentialCategories}
          expandedCategories={expandedCategories}
          setExpandedCategories={setExpandedCategories}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          includeLoanPayments={includeLoanPayments}
          expenseSort={expenseSort}
          onExpenseSortChange={handleExpenseSortChange}
          predictions={predictions[latestMonth.month] || []}
          averageEssentialSpending={averageEssentialSpending[latestMonth.month] || 0}
          onSkipPrediction={handleSkipPrediction}
          onDeletePrediction={handleDeletePrediction}
          onPredictionChanged={reloadCurrentMonthPredictions}
          availableCategories={availableCategories}
          onTransactionCategoryUpdated={loadSummary}
        />
      </div>

      {/* Previous Months */}
      {previousMonths.length > 0 && (
        <>
          <div className="content-header" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid var(--color-border-primary)' }}>
            <h2>Previous Months</h2>
          </div>
          {previousMonths.map((month) => (
            <div key={month.month} className="current-month-container" style={{ marginTop: '1.5rem' }}>
              <MonthSummaryCard
                month={month}
                isCurrentMonth={false}
                defaultCurrency={defaultCurrency}
                essentialCategories={essentialCategories}
                expandedCategories={expandedCategories}
                setExpandedCategories={setExpandedCategories}
                expandedSections={expandedSections}
                setExpandedSections={setExpandedSections}
                includeLoanPayments={includeLoanPayments}
                expenseSort={expenseSort}
                onExpenseSortChange={handleExpenseSortChange}
                availableCategories={availableCategories}
                onTransactionCategoryUpdated={loadSummary}
              />
            </div>
          ))}
        </>
      )}
    </>
  );
};

export default MonthlyOverviewPage;
