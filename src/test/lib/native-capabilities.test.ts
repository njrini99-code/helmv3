// @vitest-environment jsdom
/**
 * Native capability bridge (§61 contract) — src/lib/native/capabilities.ts
 *
 * The load-bearing guarantees:
 *  1. Web/SSR resolves to null info and false for every capability.
 *  2. Native info is read once via @capacitor/app and cached.
 *  3. Capability gating is build-number >= min-build, false for unknown
 *     capabilities and on any bridge failure — web behavior is the fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const getInfo = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => getInfo() },
}));

import {
  __resetNativeAppInfoCacheForTests,
  getNativeAppInfo,
  hasNativeCapability,
} from '@/lib/native/capabilities';

beforeEach(() => {
  __resetNativeAppInfoCacheForTests();
  isNativePlatform.mockReset();
  getPlatform.mockReset();
  getInfo.mockReset();
});

describe('getNativeAppInfo', () => {
  it('returns null on web', async () => {
    isNativePlatform.mockReturnValue(false);
    expect(await getNativeAppInfo()).toBeNull();
    expect(getInfo).not.toHaveBeenCalled();
  });

  it('returns parsed identity on native and caches the bridge call', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    getInfo.mockResolvedValue({ name: 'Helm Sports Labs', id: 'com.helmsportslabs.golfhelm', version: '2.0', build: '9' });

    expect(await getNativeAppInfo()).toEqual({ platform: 'ios', appVersion: '2.0', build: 9 });
    expect(await getNativeAppInfo()).toEqual({ platform: 'ios', appVersion: '2.0', build: 9 });
    expect(getInfo).toHaveBeenCalledTimes(1);
  });

  it('degrades an unparsable build to 0 instead of NaN', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    getInfo.mockResolvedValue({ name: 'x', id: 'y', version: '2.0', build: 'not-a-number' });

    expect((await getNativeAppInfo())?.build).toBe(0);
  });

  it('returns null (not a throw) when the bridge fails', async () => {
    isNativePlatform.mockReturnValue(true);
    getInfo.mockRejectedValue(new Error('bridge down'));
    expect(await getNativeAppInfo()).toBeNull();
  });
});

describe('hasNativeCapability', () => {
  it('is false for every capability on web', async () => {
    isNativePlatform.mockReturnValue(false);
    expect(await hasNativeCapability('coreHapticsV1')).toBe(false);
    expect(await hasNativeCapability('liveActivityV1')).toBe(false);
  });

  it('gates a shipped capability on the min-build math', async () => {
    // coreHapticsV1 ships in build 10 (HelmHapticsPlugin) — false on the
    // build-9 binary, true from 10 up.
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    getInfo.mockResolvedValue({ name: 'x', id: 'y', version: '2.0', build: '9' });
    expect(await hasNativeCapability('coreHapticsV1')).toBe(false);

    __resetNativeAppInfoCacheForTests();
    getInfo.mockResolvedValue({ name: 'x', id: 'y', version: '2.1', build: '10' });
    expect(await hasNativeCapability('coreHapticsV1')).toBe(true);
  });

  it('skips the bridge entirely for capabilities with no shipped entry', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');

    expect(await hasNativeCapability('badgeV1')).toBe(false);
    expect(await hasNativeCapability('liveActivityV1')).toBe(false);
    expect(await hasNativeCapability('notificationActionsV1')).toBe(false);
    expect(getInfo).toHaveBeenCalledTimes(0);
  });
});
