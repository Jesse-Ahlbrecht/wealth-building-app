import React, { useState, useEffect } from 'react';
import { predictionsAPI } from '../api';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, formatDate, getCurrentMonth } from '../utils';
import { unwrapList } from '../utils/predictionHelpers';
import PredictionEditModal from '../components/PredictionEditModal';

const PredictedPaymentsPage = () => {
  const { defaultCurrency } = useAppContext();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await predictionsAPI.getRecurringPayments();
      setPayments(unwrapList(data));
    } catch (err) {
      console.error('Error loading recurring payments:', err);
      setError(err.message || 'Failed to load recurring payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (payment) => {
    try {
      await predictionsAPI.updateRecurringPayment(payment.prediction_key, {
        recipient: payment.recipient,
        category: payment.category,
        enabled: true,
        custom_amount: null,
        custom_day: null,
        custom_recurrence_type: null
      });
      await load();
    } catch (err) {
      console.error('Error restoring recurring payment:', err);
      alert(`Failed to restore: ${err.message}`);
    }
  };

  const handleDelete = async (payment) => {
    if (!window.confirm('Permanently stop predicting this payment? You can restore it later.')) {
      return;
    }
    try {
      await predictionsAPI.updateRecurringPayment(payment.prediction_key, {
        recipient: payment.recipient,
        category: payment.category,
        enabled: false,
        custom_amount: payment.custom_amount,
        custom_day: payment.custom_day,
        custom_recurrence_type: payment.custom_recurrence_type
      });
      await load();
    } catch (err) {
      console.error('Error deleting recurring payment:', err);
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleSkip = async (payment) => {
    try {
      await predictionsAPI.skipPredictionForMonth(payment.prediction_key, getCurrentMonth());
      alert('Skipped this month. It will reappear next month.');
    } catch (err) {
      console.error('Error skipping recurring payment:', err);
      alert(`Failed to skip: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="current-month-container"><div className="loading">Loading recurring payments...</div></div>;
  }

  if (error) {
    return (
      <div className="current-month-container">
        <div className="error-message">
          {error}
          <button onClick={load} className="btn-secondary" style={{ marginTop: '16px' }}>Retry</button>
        </div>
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="current-month-container">
        <div className="empty-state">
          <h3>No Recurring Payments Detected</h3>
          <p>Once you have a few months of recurring transactions, they will show up here.</p>
        </div>
      </div>
    );
  }

  const renderRow = (payment) => {
    const disabled = payment.status === 'disabled';
    const basedOn = payment.based_on || [];
    const expanded = expandedKey === payment.prediction_key;
    const toggleExpanded = () => {
      if (basedOn.length === 0) return;
      setExpandedKey(expanded ? null : payment.prediction_key);
    };

    return (
      <div key={payment.prediction_key} className="recurring-payment-item">
        <div className={`recurring-payment-row ${disabled ? 'recurring-payment-disabled' : ''}`}>
          <div
            className={`recurring-payment-main ${basedOn.length > 0 ? 'recurring-payment-expandable' : ''}`}
            onClick={toggleExpanded}
            role={basedOn.length > 0 ? 'button' : undefined}
            tabIndex={basedOn.length > 0 ? 0 : undefined}
            onKeyDown={(e) => {
              if (basedOn.length > 0 && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                toggleExpanded();
              }
            }}
          >
            <div className="recurring-payment-recipient">
              {basedOn.length > 0 && (
                <span className="recurring-payment-chevron">{expanded ? '▼' : '▶'}</span>
              )}
              {payment.recipient || 'Unknown'}
              {payment.status === 'customized' && (
                <span className="account-badge account-badge-predicted recurring-payment-tag">Customized</span>
              )}
              {disabled && <span className="account-badge recurring-payment-tag recurring-payment-tag-off">Disabled</span>}
            </div>
            <div className="recurring-payment-meta">
              {payment.category} · {payment.recurrence_type} · day {payment.day} · {payment.occurrences} payments
            </div>
          </div>
          <div className="recurring-payment-amount">
            {formatCurrency(Math.abs(payment.amount || 0), payment.currency || defaultCurrency)}
          </div>
          <div className="recurring-payment-actions" onClick={(e) => e.stopPropagation()}>
            {disabled ? (
              <button type="button" className="btn-secondary" onClick={() => handleRestore(payment)}>Restore</button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={() => setEditing(payment)}>Customize</button>
                <button type="button" className="btn-secondary" onClick={() => handleSkip(payment)}>Skip this month</button>
                <button type="button" className="document-delete-button" onClick={() => handleDelete(payment)}>Delete</button>
              </>
            )}
          </div>
        </div>
        {expanded && basedOn.length > 0 && (
          <div className="recurring-payment-history">
            <div className="recurring-payment-history-header">Based on these payments</div>
            {basedOn.map((item, idx) => (
              <div key={`${item.date}-${idx}`} className="recurring-payment-history-row">
                <span className="recurring-payment-history-date">{formatDate(item.date)}</span>
                <span className="recurring-payment-history-amount">
                  {formatCurrency(Math.abs(item.amount || 0), item.currency || payment.currency || defaultCurrency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const active = payments.filter((p) => p.status !== 'disabled');
  const disabled = payments.filter((p) => p.status === 'disabled');

  return (
    <div className="current-month-container">
      <div className="recurring-payment-list">
        {active.map(renderRow)}
      </div>

      {disabled.length > 0 && (
        <>
          <div className="content-header" style={{ marginTop: '2rem' }}>
            <h2>Disabled</h2>
            <p>These recurring payments are no longer predicted. Restore them to bring them back.</p>
          </div>
          <div className="recurring-payment-list">
            {disabled.map(renderRow)}
          </div>
        </>
      )}

      {editing && (
        <PredictionEditModal
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
};

export default PredictedPaymentsPage;
