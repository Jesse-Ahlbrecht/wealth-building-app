/**
 * Loans Page
 * 
 * Displays student loan information and balances.
 * Updated to use hooks and API layer.
 */

import React, { useState, useEffect } from 'react';
import { loansAPI } from '../api';
import { formatCurrency, formatDate } from '../utils';

const LoansPage = () => {
  const [loans, setLoans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLoans();
  }, []);

  const loadLoans = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await loansAPI.getLoans();
      
      // Handle different response formats
      let loansData = null;
      if (response && response.loans) {
        // Direct format: { loans: [...], summary: {...} }
        loansData = response;
      } else if (response && response.data && response.data.loans) {
        // Wrapped format: { data: { loans: [...], summary: {...} } }
        loansData = response.data;
      } else if (Array.isArray(response)) {
        // Array format: wrap it
        loansData = { 
          loans: response, 
          summary: {
            total_balance: response.reduce((sum, loan) => sum + (loan.current_balance || 0), 0),
            total_monthly_payment: response.reduce((sum, loan) => sum + (loan.monthly_payment || 0), 0),
            loan_count: response.length,
            currency: response[0]?.currency || 'EUR'
          }
        };
      } else {
        loansData = response;
      }
      
      console.log('Loans data loaded:', loansData);
      console.log('Loans data structure:', {
        hasLoans: !!loansData?.loans,
        loansLength: loansData?.loans?.length,
        loansType: Array.isArray(loansData?.loans),
        hasSummary: !!loansData?.summary,
        fullData: loansData
      });
      setLoans(loansData);
    } catch (err) {
      console.error('Error loading loans:', err);
      setError(err.message || 'Failed to load loan data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading loan data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="accounts-container">
        <div className="error-message">
          {error}
          <button onClick={loadLoans} className="btn-secondary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!loans || !loans.loans || loans.loans.length === 0) {
    return (
      <div className="accounts-container">
        <div className="empty-state">
          <h3>No Loan Data</h3>
          <p>Upload KfW loan statements to see your loan information here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Student Loans Summary</h3>
        <div className="totals-grid">
          <div className="total-card">
            <div className="total-label">Total Outstanding</div>
            <div className="total-amount negative" style={{ fontSize: '32px', fontWeight: '700' }}>
              {formatCurrency(loans.summary.total_balance, loans.summary.currency)}
            </div>
          </div>

          {loans.summary.total_monthly_payment > 0 && (
            <div className="total-card">
              <div className="total-label">Monthly Payment</div>
              <div className="total-amount negative" style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(loans.summary.total_monthly_payment, loans.summary.currency)}
              </div>
              <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                {loans.summary.loan_count} loan{loans.summary.loan_count > 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="accounts-list-section">
        <h3 className="accounts-title">Loan Details</h3>
        <div className="accounts-grid">
          {loans.loans.map((loan) => (
            <div key={loan.account_number} className="account-card">
              <div className="account-header">
                <div className="account-name">{loan.program}</div>
                <span className="account-badge account-badge-kfw">{loan.currency}</span>
              </div>
              <div className="account-balance negative">
                {formatCurrency(loan.current_balance, loan.currency)}
              </div>

              <div className="account-meta" style={{ marginTop: '8px' }}>
                <span className="account-meta-item">Interest: {loan.interest_rate}%</span>
                {loan.monthly_payment > 0 && (
                  <span className="account-meta-item">
                    Payment: {formatCurrency(loan.monthly_payment, loan.currency)}
                  </span>
                )}
              </div>

              {loan.deferred_interest > 0 && (
                <div className="account-meta">
                  <span className="account-meta-item" style={{ color: '#f59e0b' }}>
                    Deferred Interest: {formatCurrency(loan.deferred_interest, loan.currency)}
                  </span>
                </div>
              )}

              <div className="account-meta" style={{ marginTop: '4px' }}>
                <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                  Account: {loan.account_number}
                </span>
              </div>

              <div className="account-meta">
                <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                  Contract: {formatDate(loan.contract_date)}
                </span>
              </div>

              <div className="account-meta">
                <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                  Statement: {formatDate(loan.statement_date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LoansPage;
