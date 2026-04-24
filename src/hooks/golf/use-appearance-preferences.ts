'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

type DisplayDensity = 'comfortable' | 'compact';
type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
type ScoreDisplay = 'to_par' | 'raw';

interface AppearancePreferences {
  displayDensity: DisplayDensity;
  dateFormat: DateFormat;
  showAnimations: boolean;
  scoreDisplay: ScoreDisplay;
}

const STORAGE_KEY = 'golf_appearance_preferences';

const DEFAULTS: AppearancePreferences = {
  displayDensity: 'comfortable',
  dateFormat: 'MM/DD/YYYY',
  showAnimations: true,
  scoreDisplay: 'to_par',
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
      scoreDisplay: parsed.score_display || DEFAULTS.scoreDisplay,
    };
  } catch {
    return DEFAULTS;
  }
}

// Initialization is deferred until the first hook mount (post-hydration).
// Reading localStorage at module-load time means `cachedPrefs` diverges from
// DEFAULTS before React's first client render completes, which produced a
// hydration mismatch (React error #418) on any page that rendered a user's
// custom date format — server HTML used DEFAULTS, client cache already had
// the stored value, and `useSyncExternalStore`'s hydration safeguard was not
// reliably catching the drift on every device/browser.
//
// Invariant now: cachedPrefs === DEFAULTS until the first `useAppearancePreferences`
// mount effect runs. First render (both SSR and hydration) is guaranteed to
// use DEFAULTS. After mount, `hydrateCache()` reads storage and fires
// notifyListeners() so subscribers re-render with the real prefs.
let storageListenerAttached = false;

function hydrateCacheOnce() {
  if (typeof window === 'undefined') return;
  const next = readFromStorage();
  // Avoid a gratuitous notify if storage matched DEFAULTS anyway.
  if (next !== cachedPrefs) {
    cachedPrefs = next;
    notifyListeners();
  }
  if (!storageListenerAttached) {
    storageListenerAttached = true;
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        cachedPrefs = readFromStorage();
        notifyListeners();
      }
    });
  }
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

  // Post-mount hydration: on the first hook use in a session, read localStorage
  // and notify. Idempotent — subsequent mounts no-op the cache read unless
  // storage changed (readFromStorage returns fresh data each call).
  useEffect(() => {
    hydrateCacheOnce();
  }, []);

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
        score_display: next.scoreDisplay,
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
function formatDate(
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
