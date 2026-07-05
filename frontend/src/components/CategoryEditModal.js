import React, { useEffect, useMemo, useState } from 'react';
import { transactionsAPI } from '../api';
import { categoriesAPI } from '../api/categories';
import { formatCurrency, formatDate } from '../utils';
import { groupExpenseCategoryNames, groupIncomeCategoryNames } from '../utils/categoryHelpers';

const CategorySection = ({
  title,
  description,
  categories,
  currentCategory,
  loading,
  onSelect
}) => {
  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="category-modal-section">
      <div className="category-modal-section-header">
        <h4>{title}</h4>
        {description && <p>{description}</p>}
      </div>
      <div className="category-grid">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`category-option ${category === currentCategory ? 'current' : ''}`}
            onClick={() => onSelect(category)}
            disabled={loading || category === currentCategory}
          >
            {category}
            {category === currentCategory && <span className="current-badge">Current</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

const CategoryEditModal = ({
  modal,
  onClose,
  onUpdated,
  onCategoriesChanged = () => {},
  availableCategories = { income: [], expense: [] },
  essentialCategories = []
}) => {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const transaction = modal?.transaction;
  const currentCategory = modal?.currentCategory || transaction?.category || '';
  const isIncome = transaction?.type === 'income';

  const groupedCategories = useMemo(() => {
    if (isIncome) {
      return groupIncomeCategoryNames(availableCategories?.income);
    }

    return groupExpenseCategoryNames(availableCategories?.expense, essentialCategories);
  }, [availableCategories, essentialCategories, isIncome]);

  const suggestTransactionKey = transaction?.transaction_hash;

  useEffect(() => {
    let cancelled = false;
    setSuggestion(null);
    if (!transaction || (currentCategory && currentCategory !== 'Other')) {
      return undefined;
    }
    categoriesAPI.suggestCategory(transaction)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.suggested) {
          setSuggestion(payload);
        }
      })
      .catch((error) => {
        console.error('Category suggestion failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [suggestTransactionKey, currentCategory, transaction]);

  const handleCategorySelect = async (newCategory) => {
    if (!transaction || !newCategory || newCategory === currentCategory) {
      return;
    }

    setLoading(true);
    try {
      const result = await transactionsAPI.updateCategory(transaction, newCategory);
      onClose();
      await onUpdated(transaction, newCategory, result);
    } catch (error) {
      console.error('Category update failed:', error);
      alert(`Failed to update category: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    setCreatingCategory(true);
    try {
      await categoriesAPI.createCategory(trimmed, isIncome ? 'income' : 'expense');
      setNewCategoryName('');
      await onCategoriesChanged();
      await handleCategorySelect(trimmed);
    } catch (error) {
      console.error('Create category failed:', error);
      alert(`Failed to create category: ${error.message}`);
    } finally {
      setCreatingCategory(false);
    }
  };

  if (!modal || !transaction) {
    return null;
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-content category-modal open" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Change Category</h3>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="transaction-preview">
            <div className="transaction-preview-item"><strong>Date:</strong> {formatDate(transaction.date)}</div>
            <div className="transaction-preview-item"><strong>Recipient:</strong> {transaction.recipient || 'Unknown'}</div>
            {transaction.description && (
              <div className="transaction-preview-item"><strong>Description:</strong> {transaction.description}</div>
            )}
            <div className="transaction-preview-item"><strong>Account:</strong> {transaction.account || 'Unknown'}</div>
            <div className="transaction-preview-item">
              <strong>Amount:</strong> {formatCurrency(Math.abs(transaction.amount || 0), transaction.currency)}
            </div>
            <div className="transaction-preview-item">
              <strong>Current Category:</strong> <span className="category-badge">{currentCategory || 'Uncategorized'}</span>
            </div>
            {suggestion?.suggested && (
              <div className="transaction-preview-item">
                <strong>Suggested:</strong>{' '}
                <button
                  type="button"
                  className="category-suggestion-button"
                  onClick={() => handleCategorySelect(suggestion.suggested)}
                  disabled={loading}
                >
                  {suggestion.suggested}
                </button>
              </div>
            )}
          </div>

          <div className="category-selection">
            {isIncome ? (
              <>
                <CategorySection
                  title="Income Categories"
                  description="Pick the category that best describes this incoming transaction."
                  categories={groupedCategories.income}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
                <CategorySection
                  title="Your Categories"
                  description="Custom categories use simple counterparty matching only."
                  categories={groupedCategories.custom}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
              </>
            ) : (
              <>
                <CategorySection
                  title="Essential"
                  description="Recurring or necessary spending that belongs in your essentials split."
                  categories={groupedCategories.essential}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
                <CategorySection
                  title="Non-Essential"
                  description="Discretionary spending such as dining, shopping, travel, and entertainment."
                  categories={groupedCategories.nonEssential}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
                <CategorySection
                  title="Savings"
                  description="Money moved into savings, investments, loan principal, or internal transfers."
                  categories={groupedCategories.savings}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
                <CategorySection
                  title="Your Categories"
                  description="Custom categories use simple counterparty matching only."
                  categories={groupedCategories.custom}
                  currentCategory={currentCategory}
                  loading={loading}
                  onSelect={handleCategorySelect}
                />
              </>
            )}

            <div className="category-modal-section">
              <div className="category-modal-section-header">
                <h4>Create Custom Category</h4>
                <p>Add a personal category. Future matches use counterparty rules only.</p>
              </div>
              <div className="category-create-row">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Category name"
                  disabled={loading || creatingCategory}
                />
                <button
                  type="button"
                  className="documents-primary-button"
                  onClick={handleCreateCategory}
                  disabled={loading || creatingCategory || !newCategoryName.trim()}
                >
                  {creatingCategory ? 'Creating…' : 'Create & Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditModal;
