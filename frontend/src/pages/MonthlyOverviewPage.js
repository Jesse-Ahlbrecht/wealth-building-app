/**
 * Monthly Overview Page
 * 
 * Displays current month progress and historical spending patterns.
 * Updated to use hooks and API layer with proper CSS classes.
 */

import React, { useState, useEffect } from 'react';
import { transactionsAPI, categoriesAPI, predictionsAPI } from '../api';
import { useAppContext } from '../context/AppContext';
import MonthSummaryCard from '../components/MonthSummaryCard';

const MonthlyOverviewPage = () => {
  const { defaultCurrency, preferences, updatePreferences } = useAppContext();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize state from preferences or defaults
  const [showEssentialSplit, setShowEssentialSplit] = useState(false);
  const [includeLoanPayments, setIncludeLoanPayments] = useState(false);

  useEffect(() => {
    if (preferences) {
      if (preferences.monthlyOverview_showEssentialSplit !== undefined) {
        setShowEssentialSplit(preferences.monthlyOverview_showEssentialSplit);
      }
      if (preferences.monthlyOverview_includeLoanPayments !== undefined) {
        setIncludeLoanPayments(preferences.monthlyOverview_includeLoanPayments);
      }
    }
  }, [preferences]);

  const handleEssentialSplitChange = (value) => {
    setShowEssentialSplit(value);
    updatePreferences({ monthlyOverview_showEssentialSplit: value });
  };

  const handleIncludeLoanPaymentsChange = (value) => {
    setIncludeLoanPayments(value);
    updatePreferences({ monthlyOverview_includeLoanPayments: value });
  };

  const [essentialCategories, setEssentialCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSections, setExpandedSections] = useState({}); // Track expanded sections (essential/non-essential)
  const [predictions, setPredictions] = useState({}); // month -> predictions array
  const [averageEssentialSpending, setAverageEssentialSpending] = useState({}); // month -> average

  useEffect(() => {
    loadSummary();
    loadEssentialCategories();
  }, []);

  useEffect(() => {
    // Load predictions and averages for all months when summary changes
    if (summary && summary.length > 0) {
      summary.forEach(monthData => {
        loadPredictionsForMonth(monthData.month);
        loadAverageEssentialSpending(monthData.month);
      });
    }
  }, [summary, essentialCategories]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await transactionsAPI.getSummary();
      console.log('Summary API response:', response);

      // Handle different response formats
      let summaryData = [];
      if (Array.isArray(response)) {
        summaryData = response;
      } else if (response && Array.isArray(response.data)) {
        summaryData = response.data;
      } else if (response && response.summary && Array.isArray(response.summary)) {
        summaryData = response.summary;
      }

      console.log('Processed summary data:', summaryData.length, 'months');
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading summary:', err);
      setError(err.message || 'Failed to load transaction summary');
    } finally {
      setLoading(false);
    }
  };

  const loadEssentialCategories = async () => {
    try {
      const categories = await categoriesAPI.getEssentialCategories();
      // Handle different response formats
      const categoriesList = Array.isArray(categories)
        ? categories
        : (categories?.categories || categories?.data || []);
      setEssentialCategories(categoriesList);
    } catch (err) {
      console.error('Error loading essential categories:', err);
      // Use default essential categories on error
      setEssentialCategories(['Rent', 'Insurance', 'Groceries', 'Utilities']);
    }
  };

  const loadPredictionsForMonth = async (month) => {
    try {
      const predictionsData = await predictionsAPI.getPredictionsForMonth(month);
      setPredictions(prev => ({
        ...prev,
        [month]: Array.isArray(predictionsData) ? predictionsData : (predictionsData?.data || [])
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
      const avgData = await predictionsAPI.getAverageEssentialSpending(month);
      console.log(`Average essential spending for ${month}:`, avgData);
      // Handle different response formats
      let average = 0;
      if (typeof avgData === 'number') {
        average = avgData;
      } else if (avgData?.average !== undefined) {
        average = avgData.average;
      } else if (avgData?.data?.average !== undefined) {
        average = avgData.data.average;
      } else if (avgData?.data && typeof avgData.data === 'number') {
        average = avgData.data;
      }
      console.log(`Extracted average: ${average} for month ${month}`);
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

  const handleDismissPrediction = async (prediction) => {
    try {
      await predictionsAPI.dismissPrediction(
        prediction.prediction_key || prediction.predictionKey,
        prediction.recurrence_type || prediction.recurrenceType || 'monthly'
      );
      // Reload predictions for the month
      const month = prediction.date ? prediction.date.substring(0, 7) : Object.keys(predictions)[0];
      if (month) {
        loadPredictionsForMonth(month);
      }
    } catch (err) {
      console.error('Error dismissing prediction:', err);
    }
  };

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

  // Get latest month (current month) and all previous months
  const sortedMonths = [...summary].sort((a, b) => {
    const dateA = new Date(a.month + '-01');
    const dateB = new Date(b.month + '-01');
    return dateB - dateA;
  });
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
        <div className="chart-toggle">
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? '' : 'active'}`}
            onClick={() => handleEssentialSplitChange(false)}
          >
            All Categories
          </button>
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? 'active' : ''}`}
            onClick={() => handleEssentialSplitChange(true)}
          >
            Essentials Split
          </button>
        </div>
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
          showEssentialSplit={showEssentialSplit}
          essentialCategories={essentialCategories}
          expandedCategories={expandedCategories}
          setExpandedCategories={setExpandedCategories}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          allMonthsData={summary}
          includeLoanPayments={includeLoanPayments}
          predictions={predictions[latestMonth.month] || []}
          averageEssentialSpending={averageEssentialSpending[latestMonth.month] || 0}
          onDismissPrediction={handleDismissPrediction}
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
                showEssentialSplit={showEssentialSplit}
                essentialCategories={essentialCategories}
                expandedCategories={expandedCategories}
                setExpandedCategories={setExpandedCategories}
                expandedSections={expandedSections}
                setExpandedSections={setExpandedSections}
                allMonthsData={summary}
                includeLoanPayments={includeLoanPayments}
                predictions={predictions[month.month] || []}
                averageEssentialSpending={averageEssentialSpending[month.month] || 0}
                onDismissPrediction={handleDismissPrediction}
              />
            </div>
          ))}
        </>
      )}
    </>
  );
};

export default MonthlyOverviewPage;
