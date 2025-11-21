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
    if (stored) {
      setSessionToken(stored);
      apiClient.setSessionToken(stored);
      verifySession(stored);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifySession = async (token) => {
    try {
      const response = await authAPI.verifySession();
      if (response.valid) {
        setIsAuthenticated(true);
        setUser(response.user);
      } else {
        logout();
      }
    } catch (error) {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      setSessionToken(response.session_token);
      setUser(response.user);
      setIsAuthenticated(true);
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

