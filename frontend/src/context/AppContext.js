/**
 * App Context
 * 
 * Global application state management
 */

import React, { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'monthly-overview';
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState(() => {
    return localStorage.getItem('defaultCurrency') || 'CHF';
  });
  const [documentsProcessing, setDocumentsProcessing] = useState(false);
  const [documentsProcessingCount, setDocumentsProcessingCount] = useState(0);

  const handleCurrencyChange = (currency) => {
    setDefaultCurrency(currency);
    localStorage.setItem('defaultCurrency', currency);
  };

  const handleActiveTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
  };

  const value = {
    activeTab,
    setActiveTab: handleActiveTabChange,
    monthlyData,
    setMonthlyData,
    accounts,
    setAccounts,
    loading,
    setLoading,
    defaultCurrency,
    setDefaultCurrency: handleCurrencyChange,
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

