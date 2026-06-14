'use client';

/**
 * use-distance-units.ts
 *
 * Per-player distance-unit preference: 'yards' (default) | 'meters'.
 *
 * Storage:  localStorage key `golf_distance_unit_pref`
 *           (same localStorage-only pattern as use-appearance-preferences.ts)
 *
 * localStorage is the only store — no DB column. If multi-device sync is
 * ever needed, add a golf_players column then and sync it here.
 *
 * Design: identical external-store + useSyncExternalStore pattern as
 *         use-appearance-preferences.ts so that any component reading the pref
 *         re-renders when another component changes it.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { DistancePreference } from '@/lib/golf/distance-units';

const STORAGE_KEY = 'golf_distance_unit_pref';
const DEFAULT: DistancePreference = 'yards';

// ---------------------------------------------------------------------------
// External store (module-level — shared across all hook consumers)
// ---------------------------------------------------------------------------

let cached: DistancePreference = DEFAULT;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readFromStorage(): DistancePreference {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'meters' ? 'meters' : 'yards';
  } catch {
    return DEFAULT;
  }
}

function writeToStorage(pref: DistancePreference) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore quota errors
  }
}

// Deferred initialisation — same hydration-safety pattern as
// use-appearance-preferences.ts. `cached` starts as DEFAULT so
// SSR and the initial client render both agree (no hydration mismatch).
let storageListenerAttached = false;

function hydrateOnce() {
  if (typeof window === 'undefined') return;
  const next = readFromStorage();
  if (next !== cached) {
    cached = next;
    notify();
  }
  if (!storageListenerAttached) {
    storageListenerAttached = true;
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        const v = e.newValue === 'meters' ? 'meters' : 'yards';
        if (v !== cached) {
          cached = v;
          notify();
        }
      }
    });
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): DistancePreference {
  return cached;
}

function getServerSnapshot(): DistancePreference {
  return DEFAULT;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDistanceUnitsReturn {
  /** Active preference — 'yards' or 'meters' */
  distancePref: DistancePreference;
  /** Persist and broadcast a new preference */
  setDistancePref: (pref: DistancePreference) => void;
}

/**
 * Returns the player's active distance-unit preference and a setter.
 *
 * Components that display or accept distance values should consume this hook
 * rather than hardcoding 'yards' or 'meters'. All conversion is then delegated
 * to the helpers in src/lib/golf/distance-units.ts.
 */
export function useDistanceUnits(): UseDistanceUnitsReturn {
  const distancePref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Post-mount hydration — identical rationale to use-appearance-preferences
  useEffect(() => {
    hydrateOnce();
  }, []);

  const setDistancePref = useCallback((pref: DistancePreference) => {
    if (pref === cached) return;
    cached = pref;
    writeToStorage(pref);
    notify();
  }, []);

  return { distancePref, setDistancePref };
}
