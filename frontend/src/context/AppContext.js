/**
 * App Context
 * 
 * Global application state management
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../api';
import { useAuthContext } from './AuthContext';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const [monthlyData, setMonthlyData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Settings State
  const [defaultCurrency, setDefaultCurrencyState] = useState('EUR');
  const [theme, setThemeState] = useState('system');
  const [preferences, setPreferences] = useState({});

  const [documentsProcessing, setDocumentsProcessing] = useState(false);
  const [documentsProcessingCount, setDocumentsProcessingCount] = useState(0);

  // Fetch settings when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const fetchSettings = async () => {
        try {
          const response = await settingsApi.getSettings();
          // Handle both wrapped and unwrapped responses
          const settings = response.data || response;

          if (settings) {
            if (settings.currency) setDefaultCurrencyState(settings.currency);
            if (settings.theme) setThemeState(settings.theme);
            if (settings.preferences) setPreferences(settings.preferences);
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      };
      fetchSettings();
    }
  }, [isAuthenticated]);

  // Helper to save settings to backend
  const saveSettings = useCallback(async (newSettings) => {
    try {
      if (isAuthenticated) {
        await settingsApi.updateSettings(newSettings);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [isAuthenticated]);

  const setDefaultCurrency = (currency) => {
    setDefaultCurrencyState(currency);
    saveSettings({ currency });
  };

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    saveSettings({ theme: newTheme });
  };

  const updatePreferences = (newPreferences) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    saveSettings({ preferences: updated });
  };

  const value = {
    monthlyData,
    setMonthlyData,
    accounts,
    setAccounts,
    loading,
    setLoading,
    defaultCurrency,
    setDefaultCurrency,
    theme,
    setTheme,
    preferences,
    updatePreferences,
    documentsProcessing,
    setDocumentsProcessing,
    documentsProcessingCount,
    setDocumentsProcessingCount,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

