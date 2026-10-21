import { readFileSync } from 'node:fs';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Release blocker 19: the iOS number pad has no return key and the app hides the keyboard's accessory bar, so round
 * entry holds the native bar (with its Done key) up while it is mounted. The bar's own rules are
 * src/lib/utils/__tests__/capacitor-accessory-bar.test.ts; this is the round's side.
 */

const cap = vi.hoisted(() => ({ native: true, release: vi.fn(), pin: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => cap.native, pinKeyboardAccessoryBar: cap.pin }));

import { useRoundDoneKey } from '../use-done-key';

beforeEach(() => {
  cap.native = true;
  cap.release.mockReset();
  cap.pin.mockReset().mockImplementation(() => cap.release);
});

describe('useRoundDoneKey', () => {
  it('in the app, pins the accessory bar once on mount and releases it on unmount', () => {
    const view = renderHook(() => useRoundDoneKey());
    expect(cap.pin).toHaveBeenCalledTimes(1);
    view.rerender();
    expect(cap.pin).toHaveBeenCalledTimes(1);
    expect(cap.release).not.toHaveBeenCalled();
    view.unmount();
    expect(cap.release).toHaveBeenCalledTimes(1);
  });

  it('on the web does nothing: Mobile Safari draws its own bar', () => {
    cap.native = false;
    const view = renderHook(() => useRoundDoneKey());
    view.unmount();
    expect(cap.pin).not.toHaveBeenCalled();
  });

  it('spans the whole round: the new-round and the continue screens both hold it, setup and sheets included', () => {
    for (const file of ['NewRound.tsx', 'ContinueRound.tsx']) {
      const src = readFileSync(`src/clubhouse/screens/rounds/entry/${file}`, 'utf8');
      expect(src, file).toContain("import { useRoundDoneKey } from './use-done-key';");
      expect(src.match(/^\s+useRoundDoneKey\(\);$/gm), file).toHaveLength(1);
    }
  });
});
