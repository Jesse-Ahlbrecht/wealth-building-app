import React, { useMemo, useState } from 'react';
import { transactionsAPI } from '../api';
import { formatCurrency, formatDate } from '../utils';

const SAVINGS_CATEGORY_NAMES = new Set(['Transfer', 'Internal Transfer', 'Loan Payment', 'Investment Account Payment']);

const groupExpenseCategories = (categories, essentialCategories) => {
  const essentialSet = new Set((essentialCategories || []).map((category) => category.toLowerCase()));
  const groups = {
    essential: [],
    nonEssential: [],
    savings: []
  };

  (categories || []).forEach((category) => {
    if (SAVINGS_CATEGORY_NAMES.has(category)) {
      groups.savings.push(category);
      return;
    }

    if (essentialSet.has(category.toLowerCase())) {
      groups.essential.push(category);
      return;
    }

    groups.nonEssential.push(category);
  });

  return groups;
};

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
  availableCategories = { income: [], expense: [] },
  essentialCategories = []
}) => {
  const [loading, setLoading] = useState(false);

  const transaction = modal?.transaction;
  const currentCategory = modal?.currentCategory || transaction?.category || '';
  const isIncome = transaction?.type === 'income';

  const groupedCategories = useMemo(() => {
    if (isIncome) {
      return {
        income: Array.isArray(availableCategories?.income) ? availableCategories.income : []
      };
    }

    return groupExpenseCategories(
      Array.isArray(availableCategories?.expense) ? availableCategories.expense : [],
      essentialCategories
    );
  }, [availableCategories, essentialCategories, isIncome]);

  const handleCategorySelect = async (newCategory) => {
    if (!transaction || !newCategory || newCategory === currentCategory) {
      return;
    }

    setLoading(true);
    try {
      const result = await transactionsAPI.updateCategory(transaction, newCategory);
      onClose();
      try {
        await onUpdated(transaction, newCategory, result);
      } catch (refreshError) {
        console.error('Category saved, but refresh failed:', refreshError);
        alert(`Category saved, but the list did not refresh: ${refreshError.message}`);
      }
    } catch (error) {
      console.error('Category update failed:', error);
      alert(`Failed to update category: ${error.message}`);
    } finally {
      setLoading(false);
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
          </div>

          <div className="category-selection">
            {isIncome ? (
              <CategorySection
                title="Income Categories"
                description="Pick the category that best describes this incoming transaction."
                categories={groupedCategories.income}
                currentCategory={currentCategory}
                loading={loading}
                onSelect={handleCategorySelect}
              />
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditModal;
