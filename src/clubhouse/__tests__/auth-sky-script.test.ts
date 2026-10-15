// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { posterWash } from '../screens/auth/SceneMount';
import { isDarkSky, paperTint } from '../screens/auth/scene-sky';
import { clearSkyBoot, SKY_BOOT, SKY_OFFSET_KEY } from '../screens/auth/SkyScript';

/**
 * The sign in painted day and then switched to night (owner, 2026-10-15): the server has no clock, so SkyScript
 * stamps the hour's light on <html> before first paint. Its maths must be SceneMount's and SignIn's, hour for hour.
 */
const root = document.documentElement;
const boot = () => new Function(SKY_BOOT)();
const stamped = () => ({
  bg: root.style.getPropertyValue('--ch-au-wash-bg'),
  a: root.style.getPropertyValue('--ch-au-wash-a'),
  paper: root.style.getPropertyValue('--ch-au-paper') || null,
  dark: root.hasAttribute('data-ch-au-dark'),
});

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/golf/login');
  localStorage.clear();
});
afterEach(() => {
  clearSkyBoot();
  vi.useRealTimers();
});

describe('SkyScript: the first frame is already the right time of day', () => {
  it.each([0.5, 5.6, 6.4, 7.25, 12.5, 16.8, 18.6, 19.4, 20.2, 21, 22.75])('matches the real wash, tint and wordmark at %f h', (hour) => {
    vi.setSystemTime(new Date(2026, 9, 15, Math.floor(hour), Math.round((hour % 1) * 60)));
    boot();
    const want = posterWash(hour)!;
    expect(stamped()).toEqual({ bg: want.background, a: String(want.opacity), paper: paperTint(hour), dark: isDarkSky(hour) });
  });

  it('a night sign in is dark before React runs', () => {
    vi.setSystemTime(new Date(2026, 9, 15, 23, 10));
    boot();
    expect(root.hasAttribute('data-ch-au-dark')).toBe(true);
    expect(Number(root.style.getPropertyValue('--ch-au-wash-a'))).toBeGreaterThan(0.6);
  });

  it('adds the offset to the sun this device last saw', () => {
    vi.setSystemTime(new Date(2026, 9, 15, 18, 0));
    localStorage.setItem(SKY_OFFSET_KEY, '2');
    boot();
    expect(root.style.getPropertyValue('--ch-au-wash-bg')).toBe(posterWash(20)!.background);
    expect(root.hasAttribute('data-ch-au-dark')).toBe(isDarkSky(20));
  });

  it('leaves every other page alone, and clears after hydration', () => {
    vi.setSystemTime(new Date(2026, 9, 15, 23, 10));
    window.history.replaceState(null, '', '/golf/dashboard');
    boot();
    expect(stamped()).toEqual({ bg: '', a: '', paper: null, dark: false });
    window.history.replaceState(null, '', '/golf/welcome');
    boot();
    expect(stamped().dark).toBe(true);
    clearSkyBoot();
    expect(stamped()).toEqual({ bg: '', a: '', paper: null, dark: false });
  });
});
