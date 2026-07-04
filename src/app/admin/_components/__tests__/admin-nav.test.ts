import { describe, it, expect } from 'vitest';
import { ADMIN_NAV, hrefForShortcut } from '@/app/admin/_components/admin-nav';

describe('ADMIN_NAV', () => {
  it('declares the canonical tabs in order', () => {
    expect(ADMIN_NAV.map((e) => e.href)).toEqual([
      '/admin',
      '/admin/activity',
      '/admin/errors',
      '/admin/auth',
      '/admin/golf',
      '/admin/baseball',
      '/admin/ben-leah',
      '/admin/work',
      '/admin/users',
      '/admin/jobs',
      '/admin/deploys',
      '/admin/health',
    ]);
    expect(ADMIN_NAV.map((e) => e.key)).toEqual(['1', '2', '3', '4', '5', '6', 'B', 'W', '7', '8', '9', '0']);
  });
  it('maps shortcut keys to hrefs', () => {
    expect(hrefForShortcut('2')).toBe('/admin/activity');
    expect(hrefForShortcut('3')).toBe('/admin/errors');
    expect(hrefForShortcut('B')).toBe('/admin/ben-leah');
    expect(hrefForShortcut('W')).toBe('/admin/work');
    expect(hrefForShortcut('9')).toBe('/admin/deploys');
    expect(hrefForShortcut('0')).toBe('/admin/health');
    expect(hrefForShortcut('x')).toBeNull();
  });
});
