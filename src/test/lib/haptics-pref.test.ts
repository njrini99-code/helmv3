// @vitest-environment jsdom
//
// The preference is localStorage-backed, and this project's default unit
// environment is node — where `window` does not exist and every case below
// fails in setup rather than on its assertion.

/**
 * The haptics off switch must actually switch haptics off.
 *
 * It previously did not. The preference was private to lib/fairway/haptics.ts,
 * so it gated only the 13 call sites using `fwHaptic`; the other 164 call
 * `triggerHaptic` from lib/utils/capacitor.ts directly and bypassed it. A user
 * turning haptics off would still have felt roughly 93% of them.
 *
 * These tests pin the gate at the bottom layer — the function every path
 * funnels through — so the toggle cannot regress into a decorative control.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const impact = vi.fn();
const notification = vi.fn();

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: (...a: unknown[]) => impact(...a),
    notification: (...a: unknown[]) => notification(...a),
  },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

// Pretend we are the native app; on web triggerHaptic returns before the gate
// and the test would pass for the wrong reason.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

import { triggerHaptic } from '@/lib/utils/capacitor';
import {
  setHapticsEnabled,
  areHapticsEnabled,
  __resetHapticsPrefCache,
} from '@/lib/utils/haptics-pref';

/**
 * In-memory localStorage. The jsdom-provided one is not reliably present in
 * this project's unit environment — HubInsightSignalCard.test.tsx polyfills it
 * the same way for the same reason.
 */
function installStorage() {
  let store: Record<string, string> = {};
  const stub = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: () => null,
    length: 0,
  };
  Object.defineProperty(window, 'localStorage', { value: stub, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  return stub;
}

beforeEach(() => {
  impact.mockClear();
  notification.mockClear();
  installStorage();
  __resetHapticsPrefCache();
});

afterEach(() => {
  __resetHapticsPrefCache();
});

describe('haptics preference', () => {
  it('defaults to ON when nothing is stored', () => {
    expect(areHapticsEnabled()).toBe(true);
  });

  it('silences triggerHaptic — the path 164 call sites use — when off', async () => {
    setHapticsEnabled(false);
    await triggerHaptic('light');
    await triggerHaptic('success');
    expect(impact).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  /**
   * Non-vacuity guard. Without this, the assertion above would pass on a
   * triggerHaptic that never fired under any circumstances.
   */
  it('still fires when on', async () => {
    setHapticsEnabled(true);
    await triggerHaptic('light');
    expect(impact).toHaveBeenCalledTimes(1);

    await triggerHaptic('success');
    expect(notification).toHaveBeenCalledTimes(1);
  });

  it('persists across a reload', () => {
    setHapticsEnabled(false);
    __resetHapticsPrefCache(); // simulate a fresh page load
    expect(areHapticsEnabled()).toBe(false);
  });

  it('treats unwritable storage as ON rather than throwing in a tap handler', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      },
      configurable: true,
    });
    __resetHapticsPrefCache();
    expect(() => areHapticsEnabled()).not.toThrow();
    expect(areHapticsEnabled()).toBe(true);
    expect(() => setHapticsEnabled(false)).not.toThrow();
  });
});
