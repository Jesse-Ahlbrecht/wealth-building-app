/**
 * API Client
 * 
 * Base fetch wrapper with authentication, error handling, and response parsing
 */

const API_BASE_URL = 'http://localhost:5001';

/**
 * Base API client with auth and error handling
 */
export class APIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.sessionToken = null;
    this.onAuthFailure = null;
  }

  setSessionToken(token) {
    this.sessionToken = token;
    if (token) {
      sessionStorage.setItem('sessionToken', token);
    } else {
      sessionStorage.removeItem('sessionToken');
    }
  }

  setAuthFailureHandler(handler) {
    this.onAuthFailure = handler;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      ...options.headers,
    };

    // Only set Content-Type for JSON, not for FormData
    if (!options.body || !(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    // Get token from sessionStorage if not set in instance
    const token = this.sessionToken || (typeof window !== 'undefined' ? sessionStorage.getItem('sessionToken') : null);
    if (token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    // Stringify body only if it's not FormData
    if (config.body && !(config.body instanceof FormData) && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);

      // Handle auth failures
      if (response.status === 401) {
        if (this.onAuthFailure) {
          this.onAuthFailure();
        }
        throw new Error('Authentication required');
      }

      // Parse response - handle both JSON and non-JSON responses
      let responseData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (parseError) {
          console.error(`Failed to parse JSON response:`, parseError);
          throw new Error(`Invalid response format: ${response.statusText}`);
        }
      } else {
        // Non-JSON response (shouldn't happen with our API, but handle gracefully)
        const text = await response.text();
        throw new Error(`Unexpected response format: ${text.substring(0, 100)}`);
      }

      // Extract actual data from signed response (errors are also wrapped)
      const data = responseData.data !== undefined ? responseData.data : responseData;

      if (!response.ok) {
        // Error responses are also wrapped in signed response structure
        const errorMessage = data.error || data.message || responseData.error || responseData.message || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      // Re-throw if it's already an Error with a message
      if (error instanceof Error) {
        throw error;
      }
      // Otherwise wrap it
      throw new Error(error.message || String(error));
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Create singleton instance
const apiClient = new APIClient();

export default apiClient;

