/**
 * API Helper Functions
 */

export const parseAPIResponse = (response) => {
  return response.data || response;
};

export const normalizeMonthSummary = (month) => ({
  ...month,
  expenseCategories: month.expenseCategories || month.expense_categories || {},
  savingRate: month.savingRate ?? month.saving_rate ?? 0
});

export const parseSummaryResponse = (response) => {
  let data = [];
  if (Array.isArray(response)) data = response;
  else if (Array.isArray(response?.data)) data = response.data;
  else if (Array.isArray(response?.summary)) data = response.summary;
  return data.map(normalizeMonthSummary);
};

export const handleAPIError = (error) => {
  console.error('API Error:', error);
  return error.message || 'An error occurred';
};

