/**
 * API Helper Functions
 */

export const parseAPIResponse = (response) => {
  // Handle signed responses
  return response.data || response;
};

export const handleAPIError = (error) => {
  console.error('API Error:', error);
  return error.message || 'An error occurred';
};

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

