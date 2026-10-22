// @vitest-environment jsdom
/**
 * The two shared, non-UI pieces Clubhouse's push opt-in reads (docs/clubhouse/phone/push-opt-in.md): what iOS says
 * about push (never prompting), and opening the app's page in iOS Settings for a permission only Settings can turn
 * back on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ native: true, platform: 'ios', receive: 'prompt' as string, throws: false }));
const checkPermissions = vi.hoisted(() => vi.fn());
const requestPermissions = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => env.native, getPlatform: () => env.platform, isPluginAvailable: () => true } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { checkPermissions, requestPermissions, register: vi.fn() } }));
vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/haptics', () => ({ Haptics: {}, ImpactStyle: {}, NotificationType: {} }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: {} }));
vi.mock('@/app/golf/actions/push-notifications', () => ({ registerDeviceToken: vi.fn() }));

import { canOpenNativeAppSettings, openNativeAppSettings } from '@/lib/utils/capacitor';
import { nativePushPermission } from '@/lib/utils/push-registration';

beforeEach(() => {
  env.native = true;
  env.platform = 'ios';
  env.throws = false;
  checkPermissions.mockReset().mockImplementation(async () => {
    if (env.throws) throw new Error('not implemented');
    return { receive: env.receive };
  });
  requestPermissions.mockReset();
});

describe('nativePushPermission', () => {
  it('maps what iOS says, and never shows its prompt', async () => {
    for (const [receive, want] of [
      ['prompt', 'prompt'],
      ['prompt-with-rationale', 'prompt'],
      ['granted', 'granted'],
      ['denied', 'denied'],
    ] as const) {
      env.receive = receive;
      expect(await nativePushPermission(), receive).toBe(want);
    }
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('is unsupported on the web and when the plugin cannot answer', async () => {
    env.throws = true;
    expect(await nativePushPermission()).toBe('unsupported');
    env.native = false;
    expect(await nativePushPermission()).toBe('unsupported');
    expect(checkPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('openNativeAppSettings', () => {
  it('in the iOS app, navigates to app-settings:, which the WebView hands to iOS', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { set href(v: string) { assign(v); } } });
    try {
      expect(canOpenNativeAppSettings()).toBe(true);
      expect(openNativeAppSettings()).toBe(true);
      expect(assign).toHaveBeenCalledWith('app-settings:');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('does nothing on the web or on Android', () => {
    env.native = false;
    expect(canOpenNativeAppSettings()).toBe(false);
    expect(openNativeAppSettings()).toBe(false);
    env.native = true;
    env.platform = 'android';
    expect(canOpenNativeAppSettings()).toBe(false);
    expect(openNativeAppSettings()).toBe(false);
  });
});
