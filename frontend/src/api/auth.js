/**
 * Authentication API
 */

import apiClient from './client';

export const authAPI = {
  async login(email, password) {
    const response = await apiClient.post('/api/auth/login', { email, password }, { skipAuth: true });
    if (response.session_token) {
      apiClient.setSessionToken(response.session_token);
    }
    return response;
  },

  async register(email, password, name) {
    return apiClient.post('/api/auth/register', { email, password, name }, { skipAuth: true });
  },

  async verifySession() {
    return apiClient.get('/api/auth/verify');
  },

  async requestPasswordReset(email) {
    return apiClient.post('/api/auth/request-password-reset', { email }, { skipAuth: true });
  },

  async resetPassword(token, password) {
    return apiClient.post('/api/auth/reset-password', { token, password }, { skipAuth: true });
  },

  async verifyEmail(token) {
    return apiClient.post('/api/auth/verify-email', { token }, { skipAuth: true });
  },

  logout() {
    apiClient.setSessionToken(null);
  }
};

