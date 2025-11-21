/**
 * useSessionStorage Hook
 * 
 * Persistent session storage management
 */

import { useState, useEffect } from 'react';

export const useSessionStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading from sessionStorage: ${error}`);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      sessionStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error saving to sessionStorage: ${error}`);
    }
  };

  const removeValue = () => {
    try {
      sessionStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.error(`Error removing from sessionStorage: ${error}`);
    }
  };

  return [storedValue, setValue, removeValue];
};

