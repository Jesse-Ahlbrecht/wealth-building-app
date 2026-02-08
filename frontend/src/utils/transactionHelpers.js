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

/**
 * Check if a category is a loan payment category
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const isLoanPaymentCategory = (category) => {
  if (!category) return false;
  return category.toLowerCase().includes('loan payment');
};

/**
 * Calculate essential and non-essential spending totals
 * @param {Object} expenseCategories - Expense categories object from month data
 * @param {Set} essentialCategorySet - Set of essential category names
 * @param {boolean} includeLoanPayments - Whether to count loan payments as savings
 * @returns {Object} Object with essentialTotal, nonEssentialTotal, and transaction counts
 */
export const calculateEssentialSplit = (expenseCategories, essentialCategorySet, includeLoanPayments) => {
  let essentialTotal = 0;
  let essentialTransactionCount = 0;
  let nonEssentialTotal = 0;
  let nonEssentialTransactionCount = 0;

  if (!expenseCategories) {
    return { essentialTotal, essentialTransactionCount, nonEssentialTotal, nonEssentialTransactionCount };
  }

  Object.entries(expenseCategories).forEach(([category, categoryData]) => {
    const categoryTotal = categoryData?.total || 0;
    const categoryTransactions = categoryData?.transactions || [];
    
    const isLoanPayment = isLoanPaymentCategory(category);
    
    // If loan payments are counted as savings, exclude them from spending entirely
    if (includeLoanPayments && isLoanPayment) {
      return; // Skip this category
    }
    
    // If loan payments are NOT counted as savings, always treat them as essential
    if (!includeLoanPayments && isLoanPayment) {
      essentialTotal += categoryTotal;
      essentialTransactionCount += categoryTransactions.length;
      return;
    }
    
    // Check if category is essential based on user's customization
    if (essentialCategorySet.has(category)) {
      essentialTotal += categoryTotal;
      essentialTransactionCount += categoryTransactions.length;
    } else {
      nonEssentialTotal += categoryTotal;
      nonEssentialTransactionCount += categoryTransactions.length;
    }
  });

  return { essentialTotal, essentialTransactionCount, nonEssentialTotal, nonEssentialTransactionCount };
};



