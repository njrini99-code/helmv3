/**
 * The iOS app loads production, always, in anything committed. Local device
 * testing points one debug run at a dev server through CAP_SERVER_URL
 * (`npm run ios:dev`, docs/clubhouse/MOBILE.md); this fails if that override
 * ever reaches the tracked native config Xcode Cloud archives from, or if the
 * override accepts anything but an address on the local network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PRODUCTION_URL = 'https://helmsportslabs.com/golf/dashboard';
const load = async () => (await import('../../../capacitor.config')).default;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('capacitor config', () => {
  it('the tracked iOS config points at production over https', () => {
    const json = JSON.parse(readFileSync(join(process.cwd(), 'ios/App/App/capacitor.config.json'), 'utf8'));
    expect(json.server.url).toBe(PRODUCTION_URL);
    expect(json.server.cleartext).toBe(false);
    expect(json.server.allowNavigation).toEqual(['helmsportslabs.com', '*.helmsportslabs.com', 'www.helmsportslabs.com']);
  });

  it('without an override, the config is production', async () => {
    vi.stubEnv('CAP_SERVER_URL', '');
    const config = await load();
    expect(config.server?.url).toBe(PRODUCTION_URL);
    expect(config.server?.cleartext).toBe(false);
  });

  it('a local dev server is allowed for one debug run', async () => {
    vi.stubEnv('CAP_SERVER_URL', 'http://192.168.1.20:3000/golf/dashboard');
    const config = await load();
    expect(config.server?.url).toBe('http://192.168.1.20:3000/golf/dashboard');
    expect(config.server?.cleartext).toBe(true);
    expect(config.server?.allowNavigation).toContain('192.168.1.20:3000');
  });

  it('anything off the local network is refused', async () => {
    vi.stubEnv('CAP_SERVER_URL', 'http://example.com/golf/dashboard');
    await expect(load()).rejects.toThrow(/local network/);
  });
});
