import { beforeEach, describe, expect, it, vi } from 'vitest';

const setStyle = vi.fn();
const native = { isNative: true, platform: 'ios' };
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.isNative,
    getPlatform: () => native.platform,
  },
  registerPlugin: () => ({ setStyle: (o: unknown) => setStyle(o) }),
}));

describe('syncNativeAppearance (MOT-14)', () => {
  beforeEach(() => {
    vi.resetModules();
    setStyle.mockReset();
    setStyle.mockResolvedValue(undefined);
    native.isNative = true;
    native.platform = 'ios';
  });

  it("hands the app's theme choice to the native window, once per change", async () => {
    const { syncNativeAppearance } = await import('../helm-appearance');
    syncNativeAppearance('dark');
    syncNativeAppearance('dark');
    syncNativeAppearance('system');
    expect(setStyle.mock.calls).toEqual([[{ style: 'dark' }], [{ style: 'system' }]]);
  });

  it('does nothing on the web or Android', async () => {
    const { syncNativeAppearance } = await import('../helm-appearance');
    native.isNative = false;
    syncNativeAppearance('dark');
    native.isNative = true;
    native.platform = 'android';
    syncNativeAppearance('light');
    expect(setStyle).not.toHaveBeenCalled();
  });

  it('swallows an older binary without the plugin and retries next time', async () => {
    setStyle.mockRejectedValueOnce(new Error('UNIMPLEMENTED'));
    const { syncNativeAppearance } = await import('../helm-appearance');
    syncNativeAppearance('dark');
    await Promise.resolve();
    await Promise.resolve();
    syncNativeAppearance('dark');
    expect(setStyle).toHaveBeenCalledTimes(2);
  });
});
