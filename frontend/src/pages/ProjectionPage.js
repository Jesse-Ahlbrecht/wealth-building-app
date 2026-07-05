import React, { useState, useEffect } from 'react';
import { transactionsAPI, accountsAPI } from '../api';
import { formatCurrency, convertAmountToCurrency } from '../utils';
import { sortMonthsReverseChronologically } from '../utils/chartDataHelpers';
import { computeMonthExpenseBreakdown } from '../utils/categoryHelpers';
import { useBrokerData } from '../hooks';
import WealthProjectionCalculator from '../components/WealthProjectionCalculator';

const ProjectionPage = () => {
  const { broker } = useBrokerData();
  const [projectionData, setProjectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjectionData();
  }, [broker]);

  const loadProjectionData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryResponse, accountsResponse] = await Promise.all([
        transactionsAPI.getSummary().catch(() => null),
        accountsAPI.getAccounts().catch(() => null)
      ]);

      // Handle summary data
      let summaryData = [];
      if (summaryResponse) {
        if (Array.isArray(summaryResponse)) {
          summaryData = summaryResponse;
        } else if (summaryResponse && Array.isArray(summaryResponse.data)) {
          summaryData = summaryResponse.data;
        } else if (summaryResponse && summaryResponse.summary && Array.isArray(summaryResponse.summary)) {
          summaryData = summaryResponse.summary;
        }
      }

      const lastSixMonths = sortMonthsReverseChronologically(summaryData).slice(0, 6);
      const savingsBreakdowns = lastSixMonths.map((month) => computeMonthExpenseBreakdown(month, []));
      const averageMonthlySavings = savingsBreakdowns.length > 0
        ? savingsBreakdowns.reduce((sum, point) => sum + point.savings, 0) / savingsBreakdowns.length
        : 0;
      const averageSavingsRate = savingsBreakdowns.length > 0
        ? savingsBreakdowns.reduce((sum, point) => sum + point.savingRate, 0) / savingsBreakdowns.length
        : 0;

      // Calculate current net worth from accounts
      let currentNetWorth = 0;
      if (accountsResponse && accountsResponse.accounts) {
        const accounts = accountsResponse.accounts;
        const chfAccounts = accounts.filter((acc) => acc.currency === 'CHF');
        const eurAccounts = accounts.filter((acc) => acc.currency === 'EUR');
        const totalCHF = chfAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        const totalEUR = eurAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        currentNetWorth = totalCHF + convertAmountToCurrency(totalEUR, 'CHF');
      }

      if (broker?.summary?.interactive_brokers) {
        currentNetWorth += broker.summary.interactive_brokers.total_value_chf;
      }

      // Subtract loans if available (we'd need loansAPI, but for now we'll skip it)
      // Loans would reduce net worth, but we'll calculate it as assets only for now

      setProjectionData({
        currentNetWorth,
        averageMonthlySavings,
        averageSavingsRate
      });
    } catch (err) {
      console.error('Error loading projection data:', err);
      setError(err.message || 'Failed to load projection data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading wealth projection data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="accounts-container">
        <div className="error-message">
          {error}
          <button onClick={loadProjectionData} className="btn-secondary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!projectionData) {
    return (
      <div className="accounts-container">
        <div className="empty-state">
          <h3>No Projection Data</h3>
          <p>Upload bank statements and account data to see your wealth projection here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Wealth Projection</h3>
        <p style={{ color: 'var(--color-text-tertiary)', marginBottom: '24px' }}>
          Project your future net worth based on your current savings rate and assumed interest rate.
        </p>

        <div className="totals-grid">
          <div className="total-card">
            <div className="total-label">Current Net Worth</div>
            <div
              className={`total-amount ${projectionData.currentNetWorth >= 0 ? 'positive' : 'negative'}`}
              style={{ fontSize: '32px', fontWeight: '700' }}
            >
              {formatCurrency(projectionData.currentNetWorth, 'CHF')}
            </div>
          </div>

          <div className="total-card">
            <div className="total-label">Average Monthly Savings (6 months)</div>
            <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
              {formatCurrency(projectionData.averageMonthlySavings, 'CHF')}
            </div>
          </div>

          <div className="total-card">
            <div className="total-label">Average Savings Rate</div>
            <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
              {(projectionData.averageSavingsRate || 0).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className="charts-container" style={{ marginTop: '32px' }}>
        <div className="chart-section">
          <h3 className="chart-title">Wealth Projection Calculator</h3>
          <WealthProjectionCalculator projectionData={projectionData} formatCurrency={formatCurrency} />
        </div>
      </div>
    </div>
  );
};

export default ProjectionPage;

