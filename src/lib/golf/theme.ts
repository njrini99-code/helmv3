'use client';

/**
 * ============================================================================
 * Fairway theme (light / dark / system) — GolfHelm
 * ----------------------------------------------------------------------------
 * The premium dark theme is a token re-skin (see the `.dark` block in
 * src/styles/design-tokens.css). This module owns the *preference*:
 *   • persist the user's choice (light | dark | system) device-locally,
 *   • resolve `system` against the OS `prefers-color-scheme`,
 *   • apply the resolved theme by toggling the `.dark` class on <html>
 *     (Tailwind darkMode:["class"]) + a `data-fw-theme` attribute,
 *   • keep it live: when the choice is `system`, follow the OS as it flips.
 *
 * No-FOUC: the class is set BEFORE first paint by `ThemeScript` (an inline
 * <script> in the golf dashboard layout that reads the SAME storage key). This
 * hook then keeps things in sync at runtime. Because the theme lives on the
 * <html> element as a class (not React state), there is no hydration mismatch
 * (#418) — SSR and client agree on the React tree regardless of the class.
 *
 * Device-local by design (localStorage, no per-user DB column) — matches the
 * other appearance prefs; honestly disclosed in the settings copy.
 * ========================================================================== */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type GolfTheme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'golf_theme';
export const DEFAULT_THEME: GolfTheme = 'system';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(v: unknown): v is GolfTheme {
  return v === 'light' || v === 'dark' || v === 'system';
}

/** The stored choice, or the default when unset/unreadable. */
export function readStoredTheme(): GolfTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Does the OS currently prefer dark? (false on the server.) */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** Resolve a preference to a concrete light/dark for the current environment. */
export function resolveIsDark(theme: GolfTheme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemPrefersDark();
}

/** Toggle the `.dark` class + `data-fw-theme` on <html> to match `theme`. */
export function applyTheme(theme: GolfTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = resolveIsDark(theme);
  root.classList.toggle('dark', dark);
  root.setAttribute('data-fw-theme', dark ? 'dark' : 'light');
}

// ---------- External store (cross-component sync, like appearance prefs) ----------

let cachedTheme: GolfTheme = DEFAULT_THEME;
const listeners = new Set<() => void>();
let wired = false;

function notify() {
  listeners.forEach((l) => l());
}

/** Read storage + apply, and wire the OS + cross-tab listeners once. */
function hydrateOnce() {
  if (typeof window === 'undefined') return;
  const stored = readStoredTheme();
  if (stored !== cachedTheme) {
    cachedTheme = stored;
    notify();
  }
  // Re-apply on hydrate so a `system` choice reflects the live OS value even if
  // the inline pre-paint script and React mount straddle an OS flip.
  applyTheme(cachedTheme);

  if (wired) return;
  wired = true;

  // Follow the OS while the choice is `system`.
  const mq = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (cachedTheme === 'system') applyTheme('system');
  };
  // Safari <14 only supports addListener.
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else mq.addListener(onSystemChange);

  // Cross-tab: mirror a change made in another tab.
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY) {
      cachedTheme = readStoredTheme();
      applyTheme(cachedTheme);
      notify();
    }
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return cachedTheme;
}

function getServerSnapshot() {
  return DEFAULT_THEME;
}

/**
 * Read + set the theme preference. `theme` is the stored choice; `setTheme`
 * persists it, applies it immediately, and syncs every subscriber.
 */
export function useGolfTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate on first mount (post-render, so SSR + hydration both used DEFAULT
  // and agree). `hydrateOnce` reads storage, applies the class, and wires the
  // OS + cross-tab listeners exactly once (guarded internally).
  useEffect(() => {
    hydrateOnce();
  }, []);

  const setTheme = useCallback((next: GolfTheme) => {
    cachedTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore — device-local, non-critical
    }
    applyTheme(next);
    notify();
  }, []);

  return { theme, setTheme, isDark: resolveIsDark(theme) } as const;
}
