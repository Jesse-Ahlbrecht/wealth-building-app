/**
 * API Helper Functions
 */

export const parseAPIResponse = (response) => {
  return response.data || response;
};

export const parseSummaryResponse = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.summary)) return response.summary;
  return [];
};

export const handleAPIError = (error) => {
  console.error('API Error:', error);
  return error.message || 'An error occurred';
};

