import React from 'react';
import { formatCurrency, formatDate } from '../utils';
import { getAccountBadgeConfig } from '../utils/accountBadgeHelpers';
import { isRecurringTransaction } from '../utils/predictionHelpers';

const TransactionListItem = ({
  txn,
  idx,
  defaultCurrency,
  recurringMatchKeys,
  ibkrMatchByBankHash,
  monthKey,
  incomeCategoryNames,
  expenseCategoryNames,
  dismissible = false,
  onCategoryEdit,
  predictionMenu,
  onPredictionMenuChange,
  onSkipPrediction,
  onCustomizePrediction,
  onDeletePrediction
}) => {
  const isPredicted = txn.is_predicted || txn.isPredicted;
  const typeKey = txn?.type === 'income' ? 'income' : 'expense';
  const categoryOptions = typeKey === 'income' ? incomeCategoryNames : expenseCategoryNames;
  const canEditCategory = !isPredicted && txn?.transaction_hash && categoryOptions.length > 0;
  const menuKey = `${monthKey}-${txn.prediction_key || idx}`;
  const menuOpen = predictionMenu === menuKey;
  const badge = getAccountBadgeConfig(txn.account);
  const isRecurring = isRecurringTransaction(txn, recurringMatchKeys);
  const refunded = txn.refundedAmount || 0;
  const ibkrMatch = txn?.transaction_hash ? ibkrMatchByBankHash?.get(txn.transaction_hash) : null;
  const gross = Math.abs(txn.amount);
  const net = gross - refunded;
  const currency = txn.currency || defaultCurrency;

  return (
    <div
      className={`transaction-item ${isPredicted ? 'transaction-item-predicted' : ''}`}
      style={isPredicted ? {
        borderColor: 'var(--color-accent-secondary)',
        backgroundColor: 'var(--color-bg-tertiary)'
      } : {}}
    >
      <div className="transaction-date">
        {formatDate(txn.date)}
        {isPredicted && (
          <span className="account-badge account-badge-predicted" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
            Predicted
          </span>
        )}
      </div>
      <div className="transaction-details">
        <div className="transaction-recipient-row">
          <div className="transaction-recipient">{txn.recipient || 'N/A'}</div>
          {isRecurring && (
            <span className="account-badge account-badge-recurring" title="Recognized recurring payment">
              Recurring
            </span>
          )}
          {refunded > 0 && (
            <span className="account-badge account-badge-refund" title="Matched to a purchase or refund">
              Refund
            </span>
          )}
          {ibkrMatch && (
            <span className="account-badge account-badge-ibkr-match" title="Matched to Interactive Brokers deposit">
              IBKR
            </span>
          )}
          {badge && (
            <span className={badge.className} title={txn.account}>
              {badge.label}
            </span>
          )}
        </div>
        {txn.description && (
          <div className="transaction-description" style={isPredicted ? { color: 'var(--color-accent-secondary)', fontSize: '12px' } : {}}>
            {txn.description}
          </div>
        )}
        {ibkrMatch && (
          <div className="transaction-description" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Matched IBKR deposit on {formatDate(ibkrMatch.deposit.date)}
          </div>
        )}
      </div>
      <div className="transaction-actions">
        {canEditCategory && (
          <button
            type="button"
            className="transaction-category-pill"
            onClick={(event) => {
              event.stopPropagation();
              onCategoryEdit(txn);
            }}
            title="Change transaction category"
          >
            {txn.category || 'Set category'}
          </button>
        )}
        {isPredicted && dismissible && (
          <div className="prediction-menu">
            <button
              type="button"
              className="prediction-menu-btn"
              onClick={() => onPredictionMenuChange(menuOpen ? null : menuKey)}
              title="Manage prediction"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="prediction-menu-dropdown">
                <button type="button" onClick={() => { onPredictionMenuChange(null); onSkipPrediction(txn); }}>Skip this month</button>
                <button type="button" onClick={() => { onPredictionMenuChange(null); onCustomizePrediction(txn); }}>Customize</button>
                <button type="button" className="danger" onClick={() => { onPredictionMenuChange(null); onDeletePrediction(txn); }}>Delete permanently</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="transaction-amount">
        {refunded > 0.01 ? (
          <div className="transaction-amount-refund">
            <span className="transaction-amount-gross">{formatCurrency(gross, currency)}</span>
            <span className="transaction-amount-net">{formatCurrency(net, currency)}</span>
          </div>
        ) : (
          formatCurrency(gross, currency)
        )}
      </div>
    </div>
  );
};

export default TransactionListItem;
