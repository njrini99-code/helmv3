import { describe, it, expect } from 'vitest';
import { ADMIN_NAV, hrefForShortcut } from '@/app/admin/_components/admin-nav';

describe('ADMIN_NAV', () => {
  it('declares exactly the 9 tabs in canonical order (W16 adds Health)', () => {
    expect(ADMIN_NAV.map((e) => e.href)).toEqual([
      '/admin',
      '/admin/errors',
      '/admin/auth',
      '/admin/golf',
      '/admin/baseball',
      '/admin/users',
      '/admin/jobs',
      '/admin/deploys',
      '/admin/health',
    ]);
    expect(ADMIN_NAV.map((e) => e.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
  it('maps shortcut keys to hrefs and rejects unknowns', () => {
    expect(hrefForShortcut('2')).toBe('/admin/errors');
    expect(hrefForShortcut('9')).toBe('/admin/health');
    expect(hrefForShortcut('0')).toBeNull();
  });
});
