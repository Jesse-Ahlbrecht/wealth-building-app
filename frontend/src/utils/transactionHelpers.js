/**
 * Transaction Helper Functions
 * 
 * Utilities for working with transaction data
 */

/**
 * Generate a unique key for a transaction
 * Used for React keys and duplicate detection
 */
export const getTransactionKey = (transaction) => {
  if (!transaction) return '';
  const {
    date = '',
    account = '',
    recipient = '',
    description = '',
    amount = '',
    currency = ''
  } = transaction;

  return [
    date,
    account,
    recipient,
    description,
    amount.toString(),
    currency
  ].join('|');
};

/**
 * Get sorted transactions for a category
 * Sorts by amount (descending) or date (descending) based on categorySorts
 * 
 * @param {Array} transactions - Array of transaction objects
 * @param {string} monthKey - Month key for sorting preference
 * @param {string} category - Category name
 * @param {Object} categorySorts - Object mapping category keys to sort type ('amount' or 'date')
 * @returns {Array} Sorted transaction array
 */
export const getSortedTransactions = (transactions, monthKey, category, categorySorts = {}) => {
  const key = `${monthKey}-${category}`;
  const sortBy = categorySorts[key] || 'amount'; // Default to amount

  const sorted = [...transactions];
  if (sortBy === 'amount') {
    sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  } else {
    sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return sorted;
};

/**
 * Toggle sort preference for a category
 * Cycles between 'amount' and 'date'
 * 
 * @param {string} categoryKey - The category key (month-category combination)
 * @param {Object} currentSorts - Current sort preferences object
 * @returns {Object} Updated sort preferences
 */
export const toggleCategorySort = (categoryKey, currentSorts) => {
  const currentSort = currentSorts[categoryKey] || 'amount';
  return {
    ...currentSorts,
    [categoryKey]: currentSort === 'amount' ? 'date' : 'amount'
  };
};
