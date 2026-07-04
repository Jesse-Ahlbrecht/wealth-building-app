import { useState, useEffect, useCallback } from 'react';

export function usePreferenceState(preferenceKey, defaultValue, preferences, updatePreferences) {
  const [value, setValue] = useState(defaultValue);
  const storedValue = preferences?.[preferenceKey];

  useEffect(() => {
    if (storedValue !== undefined) {
      setValue(storedValue);
    }
  }, [preferenceKey, storedValue]);

  const setPreference = useCallback((newValue) => {
    setValue(newValue);
    updatePreferences({ [preferenceKey]: newValue });
  }, [preferenceKey, updatePreferences]);

  return [value, setPreference];
}
