'use client';

import { useState, useEffect, useCallback } from 'react';

// Type-safe localStorage hook
function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Read from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    setIsHydrated(true);
  }, [key]);

  // Update localStorage when value changes
  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  // Return default value during SSR, actual value after hydration
  return [isHydrated ? storedValue : defaultValue, setValue];
}

// Discover page preferences
interface DiscoverPreferences {
  viewMode: 'grid' | 'list' | 'map';
  sortBy: string;
}

const DISCOVER_PREFS_KEY = 'helm-discover-preferences-v2';

const DEFAULT_PREFS: DiscoverPreferences = {
  viewMode: 'map',
  sortBy: 'updated',
};

export function useDiscoverPreferences() {
  const [prefs, setPrefs] = useLocalStorage<DiscoverPreferences>(
    DISCOVER_PREFS_KEY,
    DEFAULT_PREFS
  );

  const setViewMode = useCallback((viewMode: 'grid' | 'list' | 'map') => {
    setPrefs({ ...prefs, viewMode });
  }, [prefs, setPrefs]);

  const setSortBy = useCallback((sortBy: string) => {
    setPrefs({ ...prefs, sortBy });
  }, [prefs, setPrefs]);

  return {
    viewMode: prefs.viewMode,
    sortBy: prefs.sortBy,
    setViewMode,
    setSortBy,
  };
}

// Generic localStorage hook export for other uses
export { useLocalStorage };
