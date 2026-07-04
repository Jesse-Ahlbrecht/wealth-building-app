import React, { useState } from 'react';
import { predictionsAPI } from '../api';

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' }
];

const PredictionEditModal = ({ payment, onClose, onSaved }) => {
  const [amount, setAmount] = useState(payment?.amount != null ? Math.abs(payment.amount) : '');
  const [day, setDay] = useState(payment?.day || '');
  const [recurrence, setRecurrence] = useState(payment?.recurrence_type || 'monthly');
  const [enabled, setEnabled] = useState(payment?.enabled !== false);
  const [loading, setLoading] = useState(false);

  if (!payment) {
    return null;
  }

  const save = async (overrides) => {
    setLoading(true);
    try {
      await predictionsAPI.updateRecurringPayment(payment.prediction_key, {
        recipient: payment.recipient,
        category: payment.category,
        enabled,
        custom_amount: amount === '' ? null : Number(amount),
        custom_day: day === '' ? null : Number(day),
        custom_recurrence_type: recurrence,
        ...overrides
      });
      onClose();
      await onSaved();
    } catch (error) {
      console.error('Failed to update recurring payment:', error);
      alert(`Failed to update recurring payment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Permanently stop predicting this payment? You can restore it later from the Predicted Payments section.')) {
      save({ enabled: false });
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-content category-modal open" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Customize Prediction</h3>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="transaction-preview">
            <div className="transaction-preview-item"><strong>Recipient:</strong> {payment.recipient || 'Unknown'}</div>
            <div className="transaction-preview-item"><strong>Category:</strong> {payment.category || 'Uncategorized'}</div>
          </div>

          <div className="prediction-edit-form">
            <label className="prediction-edit-field">
              <span>Amount ({payment.currency || 'CHF'})</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            <label className="prediction-edit-field">
              <span>Day of month</span>
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>

            <label className="prediction-edit-field">
              <span>Frequency</span>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="prediction-edit-field prediction-edit-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Enabled (predict this payment)</span>
            </label>
          </div>

          <div className="prediction-edit-actions">
            <button type="button" className="document-delete-button" onClick={handleDelete} disabled={loading}>
              Delete permanently
            </button>
            <div className="prediction-edit-actions-right">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => save()} disabled={loading}>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionEditModal;
