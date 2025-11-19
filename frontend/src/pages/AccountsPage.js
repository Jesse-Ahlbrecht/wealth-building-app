import React from 'react';
import { EUR_TO_CHF_RATE } from '../utils/finance';

const AccountsPage = ({ accounts, formatCurrency, formatDate }) => {
  if (!accounts) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading account data...</div>
      </div>
    );
  }

  // Categorize accounts into cash, broker, and loans
  const isBrokerAccount = (accountName) => {
    const brokerKeywords = ['ing diba', 'viac', 'broker', 'depot'];
    return brokerKeywords.some((keyword) => accountName.toLowerCase().includes(keyword));
  };

  const isLoanAccount = (accountName) => {
    const loanKeywords = ['kfw', 'loan', 'credit', 'debt'];
    return loanKeywords.some((keyword) => accountName.toLowerCase().includes(keyword));
  };

  // Split accounts into three categories
  const brokerAccounts = accounts.accounts.filter((acc) => isBrokerAccount(acc.account));
  const loanAccounts = accounts.accounts.filter((acc) => isLoanAccount(acc.account));
  const cashAccounts = accounts.accounts.filter(
    (acc) => !isBrokerAccount(acc.account) && !isLoanAccount(acc.account)
  );

  // Calculate cash totals (includes Tagesgeld and all non-broker, non-loan accounts)
  const cashTotals = { EUR: 0, CHF: 0 };
  cashAccounts.forEach((acc) => {
    cashTotals[acc.currency] += acc.balance;
  });
  const cashTotalInChf = cashTotals.CHF + cashTotals.EUR * EUR_TO_CHF_RATE;

  // Calculate broker totals
  const brokerTotals = { EUR: 0, CHF: 0 };
  brokerAccounts.forEach((acc) => {
    brokerTotals[acc.currency] += acc.balance;
  });
  const brokerTotalInChf = brokerTotals.CHF + brokerTotals.EUR * EUR_TO_CHF_RATE;

  // Calculate loan totals (negative balances)
  const loanTotals = { EUR: 0, CHF: 0 };
  loanAccounts.forEach((acc) => {
    loanTotals[acc.currency] += acc.balance; // Already negative
  });
  const loanTotalInChf = loanTotals.CHF + loanTotals.EUR * EUR_TO_CHF_RATE;

  // Calculate overall total (cash + broker + loans)
  const totalInChf = cashTotalInChf + brokerTotalInChf + loanTotalInChf;

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Net Worth Overview</h3>
        <div className="totals-grid">
          <div className="total-card">
            <div className="total-label">Net Worth (in CHF)</div>
            <div
              className={`total-amount ${totalInChf >= 0 ? 'positive' : 'negative'}`}
              style={{ fontSize: '32px', fontWeight: '700' }}
            >
              {formatCurrency(totalInChf, 'CHF')}
            </div>
          </div>

          {cashAccounts.length > 0 && (
            <div className="total-card">
              <div className="total-label">Cash &amp; Savings</div>
              <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(cashTotalInChf, 'CHF')}
              </div>
              <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                {cashAccounts.length} account{cashAccounts.length > 1 ? 's' : ''}
              </div>
            </div>
          )}

          {brokerAccounts.length > 0 && (
            <div className="total-card">
              <div className="total-label">Broker Accounts</div>
              <div className="total-amount positive" style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(brokerTotalInChf, 'CHF')}
              </div>
              <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                {brokerAccounts.length} account{brokerAccounts.length > 1 ? 's' : ''}
              </div>
            </div>
          )}

          {loanAccounts.length > 0 && (
            <div className="total-card">
              <div className="total-label">Student Loans</div>
              <div className="total-amount negative" style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(loanTotalInChf, 'CHF')}
              </div>
              <div style={{ fontSize: '13px', marginTop: '8px', color: '#666' }}>
                {loanAccounts.length} loan{loanAccounts.length > 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      {cashAccounts.length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">Cash &amp; Savings Accounts</h3>
          <div className="accounts-grid">
            {cashAccounts.map((account) => (
              <div key={account.account} className="account-card">
                <div className="account-header">
                  <div className="account-name">{account.account}</div>
                  <span className={`account-badge account-badge-${account.account.toLowerCase().replace(/ /g, '-')}`}>
                    {account.currency}
                  </span>
                </div>
                <div className={`account-balance ${account.balance >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(account.balance, account.currency)}
                </div>
                <div className="account-meta">
                  <span className="account-meta-item">{account.transaction_count} transactions</span>
                  {account.last_transaction_date && (
                    <span className="account-meta-item">Last: {formatDate(account.last_transaction_date)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {brokerAccounts.length > 0 && (
        <div className="accounts-list-section accounts-list-section-broker">
          <h3 className="accounts-title">Broker Accounts</h3>
          <div className="accounts-grid">
            {brokerAccounts.map((account) => (
              <div key={account.account} className="account-card account-card-broker">
                <div className="account-header">
                  <div className="account-name">{account.account}</div>
                  <span className={`account-badge account-badge-${account.account.toLowerCase().replace(/ /g, '-')}`}>
                    {account.currency}
                  </span>
                </div>
                <div className={`account-balance ${account.balance >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(account.balance, account.currency)}
                </div>
                <div className="account-meta">
                  <span className="account-meta-item">{account.transaction_count} transactions</span>
                  {account.last_transaction_date && (
                    <span className="account-meta-item">Last: {formatDate(account.last_transaction_date)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loanAccounts.length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">Student Loans</h3>
          <div className="accounts-grid">
            {loanAccounts.map((account) => (
              <div key={account.account} className="account-card">
                <div className="account-header">
                  <div className="account-name">{account.account}</div>
                  <span className="account-badge account-badge-kfw">{account.currency}</span>
                </div>
                <div className="account-balance negative">
                  {formatCurrency(account.balance, account.currency)}
                </div>
                <div className="account-meta">
                  <span className="account-meta-item">Student Loan</span>
                  {account.last_transaction_date && (
                    <span className="account-meta-item">Last: {formatDate(account.last_transaction_date)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsPage;

