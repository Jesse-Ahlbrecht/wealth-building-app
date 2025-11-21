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

