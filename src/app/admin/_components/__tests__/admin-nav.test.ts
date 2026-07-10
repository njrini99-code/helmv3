import { describe, it, expect } from 'vitest';
import {
  ADMIN_NAV,
  ADMIN_COMMAND_SHORTCUTS,
  hrefForShortcut,
  BRIDGE_BOTTOM_NAV_HREFS,
  BRIDGE_BOTTOM_NAV_LABELS,
} from '@/app/admin/_components/admin-nav';

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

  it('keeps command-center shortcuts on real Bridge tabs', () => {
    const navHrefs = new Set(ADMIN_NAV.map((entry) => entry.href));
    for (const shortcut of ADMIN_COMMAND_SHORTCUTS) {
      expect(navHrefs.has(shortcut.href), `${shortcut.href} is not a registered admin tab`).toBe(true);
    }
    expect(ADMIN_COMMAND_SHORTCUTS.map((s) => s.href)).not.toContain('/admin/audit');
  });
});

describe('BRIDGE_BOTTOM_NAV_HREFS', () => {
  it('declares the daily-loop four in tab order (Synthesis Decision 6)', () => {
    expect(BRIDGE_BOTTOM_NAV_HREFS).toEqual(['/admin', '/admin/errors', '/admin/health', '/admin/users']);
  });

  it('every bottom-nav href is a real registered ADMIN_NAV tab', () => {
    const navHrefs = new Set(ADMIN_NAV.map((entry) => entry.href));
    for (const href of BRIDGE_BOTTOM_NAV_HREFS) {
      expect(navHrefs.has(href), `${href} is not a registered admin tab`).toBe(true);
    }
  });

  it('has a short label for every bottom-nav href', () => {
    for (const href of BRIDGE_BOTTOM_NAV_HREFS) {
      expect(BRIDGE_BOTTOM_NAV_LABELS[href]).toBeTruthy();
    }
    // "Users & Teams" (the rail label) is deliberately shortened for the tab column.
    expect(BRIDGE_BOTTOM_NAV_LABELS['/admin/users']).toBe('Users');
  });
});
