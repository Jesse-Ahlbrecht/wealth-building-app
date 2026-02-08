/**
 * Category Edit Modal Component
 * 
 * Modal for editing transaction categories.
 * Allows users to reassign transactions to different categories
 * or create custom categories.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { categoriesAPI, transactionsAPI } from '../api';
import { formatCurrency } from '../utils';

const CategoryEditModal = ({ modal, onClose, onUpdate, isClosing }) => {
  const [availableCategories, setAvailableCategories] = useState([]);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoriesAPI.getCategories();

      if (modal) {
        const categories = modal.isIncome ? data.income : data.expense;
        if (Array.isArray(categories) && categories.length > 0) {
          setAvailableCategories(categories);
        } else {
          const defaultCategories = modal.isIncome
            ? ['Salary', 'Income', 'Other']
            : ['Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport', 'Subscriptions', 'Loan Payment', 'Rent', 'Insurance', 'Transfer', 'Other'];
          setAvailableCategories(defaultCategories);
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      const defaultCategories = modal?.isIncome
        ? ['Salary', 'Income', 'Other']
        : ['Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport', 'Subscriptions', 'Loan Payment', 'Rent', 'Insurance', 'Transfer', 'Other'];
      setAvailableCategories(defaultCategories);
    }
  }, [modal]);

  useEffect(() => {
    if (modal) {
      setShowCustomInput(false);
      setCustomCategoryName('');
      fetchCategories();
    }
  }, [modal, fetchCategories]);

  const handleCreateCustomCategory = async () => {
    if (!customCategoryName.trim()) return;
    
    setLoading(true);
    try {
      await categoriesAPI.createCategory(
        customCategoryName.trim(),
        modal.isIncome ? 'income' : 'expense'
      );

      setAvailableCategories(prev => [...prev, customCategoryName.trim()]);
      setCustomCategoryName('');
      setShowCustomInput(false);
    } catch (error) {
      console.error('Error creating custom category:', error);
      alert('Failed to create custom category: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = async (newCategory) => {
    if (!modal || !modal.transaction) return;

    setLoading(true);
    try {
      await transactionsAPI.updateCategory(
        modal.transaction.id,
        newCategory
      );

      onUpdate(modal.transaction, modal.currentCategory, newCategory, modal.monthKey);
      onClose();
    } catch (error) {
      console.error('Category update failed:', error);
      alert('Failed to update category: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!modal) return null;

  return (
    <div 
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={onClose}
    >
      <div 
        className={`modal-content category-modal ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Change Category</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="transaction-info">
            <div className="info-row">
              <span className="info-label">Recipient:</span>
              <span className="info-value">{modal.transaction?.recipient || 'Unknown'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Description:</span>
              <span className="info-value">{modal.transaction?.description}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Amount:</span>
              <span className="info-value">
                {formatCurrency(modal.transaction?.amount, modal.transaction?.currency)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Current Category:</span>
              <span className="info-value category-badge">{modal.currentCategory}</span>
            </div>
          </div>

          <div className="category-selection">
            <h4>Select New Category:</h4>
            <div className="category-grid">
              {availableCategories.map((category) => (
                <button
                  key={category}
                  className={`category-option ${category === modal.currentCategory ? 'current' : ''}`}
                  onClick={() => handleCategorySelect(category)}
                  disabled={loading || category === modal.currentCategory}
                >
                  {category}
                  {category === modal.currentCategory && <span className="current-badge">Current</span>}
                </button>
              ))}
            </div>

            {!showCustomInput ? (
              <button
                className="btn-link"
                onClick={() => setShowCustomInput(true)}
                disabled={loading}
              >
                + Create Custom Category
              </button>
            ) : (
              <div className="custom-category-input">
                <input
                  type="text"
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                  placeholder="Enter custom category name"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateCustomCategory();
                    }
                  }}
                  autoFocus
                  disabled={loading}
                />
                <button
                  className="btn-primary"
                  onClick={handleCreateCustomCategory}
                  disabled={loading || !customCategoryName.trim()}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomCategoryName('');
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditModal;



