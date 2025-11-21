import React, { useState, useEffect } from 'react';
import { transactionsAPI, accountsAPI, brokerAPI } from '../api';
import { formatCurrency, convertAmountToCurrency, EUR_TO_CHF_RATE } from '../utils';
import WealthProjectionCalculator from '../components/WealthProjectionCalculator';

const ProjectionPage = () => {
  const [projectionData, setProjectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjectionData();
  }, []);

  const loadProjectionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all necessary data in parallel
      const [summaryResponse, accountsResponse, brokerResponse] = await Promise.all([
        transactionsAPI.getSummary().catch(() => null),
        accountsAPI.getAccounts().catch(() => null),
        brokerAPI.getBroker().catch(() => null)
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

      // Calculate average monthly savings from last 6 months
      const sortedMonths = [...summaryData]
        .sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'))
        .slice(0, 6);
      
      const totalSavings = sortedMonths.reduce((sum, month) => sum + (month.savings || 0), 0);
      const averageMonthlySavings = sortedMonths.length > 0 ? totalSavings / sortedMonths.length : 0;
      
      // Calculate average savings rate
      const totalSavingRate = sortedMonths.reduce((sum, month) => sum + (month.savingRate || 0), 0);
      const averageSavingsRate = sortedMonths.length > 0 ? totalSavingRate / sortedMonths.length : 0;

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

      // Add broker/investment value if available
      if (brokerResponse && brokerResponse.summary) {
        const summary = brokerResponse.summary;
        const viacTotal = summary.viac ? summary.viac.total_invested : 0;
        const ingDibaTotal = summary.ing_diba ? summary.ing_diba.total_current_value * EUR_TO_CHF_RATE : 0;
        currentNetWorth += viacTotal + ingDibaTotal;
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

