/**
 * useAuth Hook
 * 
 * Authentication state and methods
 */

import { useState, useEffect } from 'react';
import { authAPI, apiClient } from '../api';

export const useAuth = () => {
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load session token from storage
    const stored = sessionStorage.getItem('sessionToken');
    console.log('Loading session token from storage:', stored ? 'found' : 'not found');
    if (stored) {
      setSessionToken(stored);
      apiClient.setSessionToken(stored);
      verifySession(stored);
    } else {
      console.log('No stored session token, user not authenticated');
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifySession = async (token) => {
    try {
      const response = await authAPI.verifySession();
      console.log('Verify session response:', response);
      
      // Handle nested response structure: response.data.valid or response.valid
      const isValid = response?.data?.valid ?? response?.valid ?? false;
      const userData = response?.data?.user ?? response?.user;
      
      if (isValid) {
        setIsAuthenticated(true);
        if (userData) {
          setUser(userData);
        }
        // Ensure token is saved (in case it wasn't saved before)
        if (token) {
          sessionStorage.setItem('sessionToken', token);
          apiClient.setSessionToken(token);
        }
      } else {
        console.warn('Session invalid, clearing auth state');
        // Session invalid - clear everything
        setSessionToken(null);
        setUser(null);
        setIsAuthenticated(false);
        sessionStorage.removeItem('sessionToken');
        apiClient.setSessionToken(null);
      }
    } catch (error) {
      console.error('Session verification failed:', error);
      // Session verification failed - clear everything
      setSessionToken(null);
      setUser(null);
      setIsAuthenticated(false);
      sessionStorage.removeItem('sessionToken');
      apiClient.setSessionToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      const token = response.session_token;
      setSessionToken(token);
      setUser(response.user);
      setIsAuthenticated(true);
      // Save token to sessionStorage for persistence across page refreshes
      sessionStorage.setItem('sessionToken', token);
      apiClient.setSessionToken(token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    authAPI.logout();
    setSessionToken(null);
    setUser(null);
    setIsAuthenticated(false);
    // Clear token from sessionStorage
    sessionStorage.removeItem('sessionToken');
    apiClient.setSessionToken(null);
  };

  const register = async (email, password, name) => {
    try {
      await authAPI.register(email, password, name);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return {
    sessionToken,
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
  };
};

