import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined, headers: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (jar.cookie === undefined ? undefined : { value: jar.cookie }) }),
  headers: async () => ({ get: (k: string) => jar.headers.get(k) ?? null }),
}));

import { phoneFromRequest, phoneHint } from '../lib/phone-hint';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/130 Safari/537.36';

describe('the first-paint phone guess (audit F03, T01)', () => {
  it('a phone with no layout cookie is guessed a phone; an iPad, an Android tablet and a desktop are not', () => {
    expect(phoneFromRequest(null, IPHONE)).toBe(true);
    expect(phoneFromRequest(null, ANDROID_PHONE)).toBe(true);
    expect(phoneFromRequest(null, `${IPHONE} HelmSportsLabsApp`)).toBe(true);
    expect(phoneFromRequest(null, IPAD)).toBe(false);
    expect(phoneFromRequest(null, ANDROID_TABLET)).toBe(false);
    expect(phoneFromRequest(null, MAC)).toBe(false);
    expect(phoneFromRequest(null, null)).toBe(false);
  });

  it('the client hint wins over the user agent', () => {
    expect(phoneFromRequest('?1', MAC)).toBe(true);
    expect(phoneFromRequest('?0', IPHONE)).toBe(false);
  });

  it('a remembered layout wins over the guess (T02: a resized window keeps what it last drew)', async () => {
    jar.headers.set('user-agent', IPHONE);
    jar.cookie = '0';
    expect(await phoneHint()).toBe(false);
    jar.cookie = '1';
    jar.headers.set('user-agent', MAC);
    expect(await phoneHint()).toBe(true);
    jar.cookie = undefined;
    jar.headers.set('user-agent', IPHONE);
    expect(await phoneHint()).toBe(true);
  });
});
