// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  resolveIsDark,
  systemPrefersDark,
} from '../theme';

function mockMatchMedia(matches: boolean) {
  // jsdom in this project provides no working matchMedia; define it on window
  // (the codebase pattern) so both `window.matchMedia` and the global resolve.
  const impl = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  Object.defineProperty(window, 'matchMedia', { value: impl, configurable: true, writable: true });
}

function installLocalStorage() {
  // jsdom without an origin has no usable localStorage — back it with a Map.
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true });
}

describe('golf theme', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-fw-theme');
    mockMatchMedia(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('readStoredTheme', () => {
    it('returns the default when unset', () => {
      expect(readStoredTheme()).toBe(DEFAULT_THEME);
    });
    it('returns a stored valid choice', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(readStoredTheme()).toBe('dark');
    });
    it('falls back to the default for an invalid stored value', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
      expect(readStoredTheme()).toBe(DEFAULT_THEME);
    });
  });

  describe('resolveIsDark', () => {
    it('dark → true, light → false regardless of OS', () => {
      mockMatchMedia(true);
      expect(resolveIsDark('light')).toBe(false);
      mockMatchMedia(false);
      expect(resolveIsDark('dark')).toBe(true);
    });
    it('system follows the OS preference', () => {
      mockMatchMedia(true);
      expect(resolveIsDark('system')).toBe(true);
      expect(systemPrefersDark()).toBe(true);
      mockMatchMedia(false);
      expect(resolveIsDark('system')).toBe(false);
    });
  });

  describe('applyTheme', () => {
    it('adds the .dark class + data-fw-theme=dark for a dark choice', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-fw-theme')).toBe('dark');
    });
    it('removes the .dark class for a light choice', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.getAttribute('data-fw-theme')).toBe('light');
    });
    it('system + OS-dark applies dark', () => {
      mockMatchMedia(true);
      applyTheme('system');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
