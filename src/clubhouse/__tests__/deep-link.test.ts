import { describe, expect, it } from 'vitest';
import { currentPath, deepLinkPath } from '../lib/deep-link';

const ORIGIN = 'https://helmsportslabs.com';

describe('deepLinkPath (P001-C2)', () => {
  it('keeps the path, query and hash of our own links', () => {
    expect(deepLinkPath('https://helmsportslabs.com/golf/dashboard/messages?thread=t1', ORIGIN)).toBe('/golf/dashboard/messages?thread=t1');
    expect(deepLinkPath('https://www.helmsportslabs.com/golf/dashboard/calendar?event=e1#x', ORIGIN)).toBe('/golf/dashboard/calendar?event=e1#x');
    // A dev build runs on another origin; production links still route in it.
    expect(deepLinkPath('https://helmsportslabs.com/golf/dashboard', 'http://192.168.1.4:3100')).toBe('/golf/dashboard');
  });

  it('drops other hosts, other schemes and paths outside the app', () => {
    expect(deepLinkPath('https://evil.example/golf/dashboard', ORIGIN)).toBeNull();
    expect(deepLinkPath('http://helmsportslabs.com/golf/dashboard', 'http://localhost')).toBeNull();
    expect(deepLinkPath('https://helmsportslabs.com/pricing', ORIGIN)).toBeNull();
    expect(deepLinkPath('https://helmsportslabs.com//evil.example/golf', ORIGIN)).toBeNull();
    expect(deepLinkPath('not a url', ORIGIN)).toBeNull();
    expect(deepLinkPath(null, ORIGIN)).toBeNull();
  });

  it('names where the app is now', () => {
    expect(currentPath({ pathname: '/golf/dashboard', search: '?a=1', hash: '' })).toBe('/golf/dashboard?a=1');
  });
});
