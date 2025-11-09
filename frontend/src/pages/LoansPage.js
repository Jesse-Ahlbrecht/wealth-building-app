import React from 'react';

const LoansPage = ({ loans, formatCurrency, formatDate }) => {
  if (!loans) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading loan data...</div>
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

      {loans.loans.length > 0 && (
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
      )}
    </div>
  );
};

export default LoansPage;

