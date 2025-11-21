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
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sessionToken && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      // Handle auth failures
      if (response.status === 401) {
        if (this.onAuthFailure) {
          this.onAuthFailure();
        }
        throw new Error('Authentication required');
      }

      // Parse response
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }

      // Extract actual data from signed response
      return data.data || data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
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

