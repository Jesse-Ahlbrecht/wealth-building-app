import React from 'react';
import WealthProjectionCalculator from '../components/WealthProjectionCalculator';

const ProjectionPage = ({ projectionData, formatCurrency }) => {
  if (!projectionData) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading wealth projection data...</div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Wealth Projection</h3>
        <p style={{ color: '#666', marginBottom: '24px' }}>
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
              {projectionData.averageSavingsRate.toFixed(1)}%
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

