// @vitest-environment jsdom
/**
 * CHROME-P-01: in the iOS app the status bar's clock and battery were black on Clubhouse's dark-green phone bar, because the
 * glyphs followed the theme alone. A surface that paints its own bar under the status area now names the glyphs it needs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/haptics', () => ({ Haptics: {}, ImpactStyle: {}, NotificationType: {} }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: {} }));

import { statusBarGlyphs } from '@/lib/utils/capacitor';

afterEach(() => {
  const html = document.documentElement;
  html.className = '';
  delete html.dataset.statusBar;
});

describe('statusBarGlyphs', () => {
  it('follows the theme when no surface names a colour', () => {
    const html = document.documentElement;
    expect(statusBarGlyphs(html)).toBe('dark');
    html.classList.add('dark');
    expect(statusBarGlyphs(html)).toBe('light');
  });

  it('takes the colour a surface names, in either theme (Clubhouse green bar: light)', () => {
    const html = document.documentElement;
    html.dataset.statusBar = 'light';
    expect(statusBarGlyphs(html)).toBe('light');
    html.classList.add('dark');
    expect(statusBarGlyphs(html)).toBe('light');
  });

  it('ignores a value it does not know', () => {
    const html = document.documentElement;
    html.dataset.statusBar = 'green';
    expect(statusBarGlyphs(html)).toBe('dark');
  });
});
