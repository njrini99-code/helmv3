import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeScript } from '../ThemeScript';

function bootSource(): string {
  const markup = renderToStaticMarkup(<ThemeScript />);
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  return parsed.querySelector('script')?.textContent ?? '';
}

function runBoot(): void {
  const execute = new Function(
    'location',
    'localStorage',
    'window',
    'document',
    bootSource(),
  );
  execute(window.location, window.localStorage, window, document);
}

function installLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

describe('ThemeScript (#1044)', () => {
  beforeEach(() => {
    installLocalStorage();
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-fw-theme');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it('boots the saved GolfHelm theme before paint on a dashboard hard load', () => {
    window.history.replaceState({}, '', '/golf/dashboard/players');
    window.localStorage.setItem('golf_theme', 'dark');

    runBoot();

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).toHaveAttribute('data-fw-theme', 'dark');
  });

  it.each(['/baseball/dashboard', '/golf/dashboard-preview'])(
    'does not apply a GolfHelm preference on %s',
    (pathname) => {
      window.history.replaceState({}, '', pathname);
      window.localStorage.setItem('golf_theme', 'dark');

      runBoot();

      expect(document.documentElement).not.toHaveClass('dark');
      expect(document.documentElement).not.toHaveAttribute('data-fw-theme');
    },
  );
});
