'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type DisplayDensity = 'comfortable' | 'compact';
export type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export interface AppearancePreferences {
  displayDensity: DisplayDensity;
  dateFormat: DateFormat;
  showAnimations: boolean;
}

const STORAGE_KEY = 'golf_appearance_preferences';

const DEFAULTS: AppearancePreferences = {
  displayDensity: 'comfortable',
  dateFormat: 'MM/DD/YYYY',
  showAnimations: true,
};

// ---------- External store for cross-component sync ----------

let cachedPrefs: AppearancePreferences = DEFAULTS;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

function readFromStorage(): AppearancePreferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      displayDensity: parsed.display_density || DEFAULTS.displayDensity,
      dateFormat: parsed.date_format || DEFAULTS.dateFormat,
      showAnimations: parsed.show_animations ?? DEFAULTS.showAnimations,
    };
  } catch {
    return DEFAULTS;
  }
}

// Initialize cache on module load (client-side only)
if (typeof window !== 'undefined') {
  cachedPrefs = readFromStorage();

  // Listen for storage events from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      cachedPrefs = readFromStorage();
      notifyListeners();
    }
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return cachedPrefs;
}

function getServerSnapshot() {
  return DEFAULTS;
}

// ---------- Hook ----------

export function useAppearancePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updatePreferences = useCallback((updates: Partial<AppearancePreferences>) => {
    const next = { ...cachedPrefs, ...updates };
    cachedPrefs = next;

    // Persist in the same shape the modal writes
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        display_density: next.displayDensity,
        date_format: next.dateFormat,
        show_animations: next.showAnimations,
      })
    );

    notifyListeners();
  }, []);

  return { ...prefs, updatePreferences };
}

// ---------- Date formatting utility ----------

/**
 * Format a date string or Date object using the user's preferred date format.
 * Falls back to MM/DD/YYYY if no preference is set.
 */
export function formatDate(
  date: string | Date | null | undefined,
  format: DateFormat = DEFAULTS.dateFormat
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
}

/**
 * Hook-based date formatting that automatically uses the user's preferred format.
 */
export function useFormatDate() {
  const { dateFormat } = useAppearancePreferences();
  return useCallback(
    (date: string | Date | null | undefined) => formatDate(date, dateFormat),
    [dateFormat]
  );
}
