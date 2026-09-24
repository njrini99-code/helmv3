// @vitest-environment jsdom
/**
 * iOS number pads have no Done key. The app hides the keyboard accessory bar
 * globally, so in round entry the pad could only be dismissed by tapping
 * elsewhere while it covered the sticky "Next shot" bar. The bar is now shown
 * only while a numeric/decimal input has focus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/haptics', () => ({ Haptics: {}, ImpactStyle: {}, NotificationType: {} }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: {} }));

import { installNumericAccessoryBar, wantsKeyboardAccessoryBar } from '@/lib/utils/capacitor';

function input(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('wantsKeyboardAccessoryBar', () => {
  it('is true for number/decimal pads', () => {
    expect(wantsKeyboardAccessoryBar(input({ inputmode: 'numeric' }))).toBe(true);
    expect(wantsKeyboardAccessoryBar(input({ inputmode: 'decimal' }))).toBe(true);
    expect(wantsKeyboardAccessoryBar(input({ type: 'number' }))).toBe(true);
    expect(wantsKeyboardAccessoryBar(input({ type: 'tel' }))).toBe(true);
  });

  it('is false for text inputs, textareas, read-only fields and nothing', () => {
    expect(wantsKeyboardAccessoryBar(input({ type: 'text' }))).toBe(false);
    expect(wantsKeyboardAccessoryBar(input({ type: 'search' }))).toBe(false);
    expect(wantsKeyboardAccessoryBar(input({ inputmode: 'numeric', readonly: '' }))).toBe(false);
    expect(wantsKeyboardAccessoryBar(document.createElement('textarea'))).toBe(false);
    expect(wantsKeyboardAccessoryBar(null)).toBe(false);
  });
});

describe('installNumericAccessoryBar', () => {
  it('shows the bar for a numeric field, keeps it across numeric fields, hides it for text', () => {
    const setAccessoryBarVisible = vi.fn(async () => {});
    const cleanup = installNumericAccessoryBar({ setAccessoryBarVisible });

    const yards = input({ inputmode: 'numeric' });
    const putts = input({ inputmode: 'decimal' });
    const note = input({ type: 'text' });

    yards.focus();
    expect(setAccessoryBarVisible).toHaveBeenLastCalledWith({ isVisible: true });
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(1);

    // numeric -> numeric: no off/on flicker.
    putts.focus();
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(1);

    // numeric -> text: hidden again.
    note.focus();
    expect(setAccessoryBarVisible).toHaveBeenLastCalledWith({ isVisible: false });
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(2);

    // text -> nothing: already hidden, no call.
    note.blur();
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(2);

    // numeric -> nothing (keyboard dismissed): hidden.
    yards.focus();
    yards.blur();
    expect(setAccessoryBarVisible).toHaveBeenLastCalledWith({ isVisible: false });
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(4);

    cleanup();
    yards.focus();
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(4);
  });

  it('swallows a failing plugin call', async () => {
    const setAccessoryBarVisible = vi.fn(async () => { throw new Error('not implemented'); });
    const cleanup = installNumericAccessoryBar({ setAccessoryBarVisible });
    input({ inputmode: 'numeric' }).focus();
    await Promise.resolve();
    expect(setAccessoryBarVisible).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
