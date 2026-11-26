import { describe, it, expect } from 'vitest';
import {
  ADMIN_NAV,
  ADMIN_MORE_VIEWS,
  hrefForShortcut,
  isNavEntryActive,
  navEntryForPath,
  RESERVED_LOCAL_SHORTCUTS,
  BRIDGE_BOTTOM_NAV_HREFS,
  BRIDGE_BOTTOM_NAV_LABELS,
} from '@/app/admin/_components/admin-nav';
import { RETIRED_SHORTCUTS } from '@/lib/admin/retired-routes';

describe('ADMIN_NAV', () => {
  // Regrouped 2026-11-25 for the Clubhouse edition (plan §7.1, owner D3): a
  // Clubhouse section leads, the per-sport tabs and Ben + Leah moved under
  // More. Keyboard keys are deliberately NOT renumbered — '1'-'9'/'0' and
  // every existing letter keep their routes, so muscle memory survives the
  // regrouping; the five Clubhouse screens take letters nothing else used.
  it('declares the canonical tabs in order', () => {
    expect(ADMIN_NAV.map((e) => e.href)).toEqual([
      '/admin/spaces/today',
      '/admin/spaces/people',
      '/admin/spaces/product',
      '/admin/spaces/reliability',
      '/admin/spaces/ship',
      '/admin/spaces/desk',
      '/admin',
      '/admin/clubhouse',
      '/admin/clubhouse/controls',
      '/admin/clubhouse/actions',
      '/admin/clubhouse/codes',
      '/admin/clubhouse/readiness',
      '/admin/clubhouse/sessions',
      '/admin/clubhouse/experience',
      '/admin/clubhouse/releases',
      '/admin/clubhouse/drift',
      '/admin/clubhouse/duet',
      '/admin/errors',
      '/admin/health',
      '/admin/jobs',
      '/admin/database',
      '/admin/traces',
      '/admin/teams',
      '/admin/users',
      '/admin/activity',
      '/admin/utilization',
      '/admin/deploys',
      '/admin/releases',
      '/admin/auth',
      '/admin/work',
      '/admin/golf',
      '/admin/baseball',
      '/admin/lifting',
      '/admin/engineering',
      '/admin/ben-leah',
    ]);
    // Sessions took N, the last free letter; Experience, Releases, Drift and the
    // Duet desk have none (undefined), a deliberate change: the plan's letters
    // for them are retired shortcuts still in use.
    // The six spaces lead and carry no key: no letter is free (plan 2026-11-26-bridge-spaces-build.md).
    expect(ADMIN_NAV.map((e) => e.key)).toEqual([
      undefined, undefined, undefined, undefined, undefined, undefined,
      '1', 'H', 'I', 'J', 'C', 'M', 'N', undefined, undefined, undefined, undefined,
      '3', '0', '8', 'X', 'F', 'T',
      '7', '2', 'U',
      '9', 'K', '4', 'W',
      '5', '6', 'L', 'Z', 'B',
    ]);
  });

  it('leads with the six spaces, then Clubhouse, and keeps More last (replaces D3, owner approval 2026-11-26)', () => {
    const sections = [...new Set(ADMIN_NAV.map((e) => e.section))];
    expect(sections).toEqual(['Spaces', 'Clubhouse', 'Triage', 'Customers', 'Platform', 'More']);
    const more = ADMIN_NAV.filter((e) => e.section === 'More').map((e) => e.href);
    expect(more).toEqual(['/admin/golf', '/admin/baseball', '/admin/lifting', '/admin/engineering', '/admin/ben-leah']);
  });

  it('every key a tab had before the regrouping still opens that tab', () => {
    // The pre-Clubhouse map, verbatim. A regrouping that moved one of these
    // would silently retrain an operator's hands.
    const before: Record<string, string> = {
      '1': '/admin', '3': '/admin/errors', '0': '/admin/health', '8': '/admin/jobs', X: '/admin/database',
      F: '/admin/traces', T: '/admin/teams', '7': '/admin/users', '2': '/admin/activity', U: '/admin/utilization',
      '5': '/admin/golf', '6': '/admin/baseball', L: '/admin/lifting', '9': '/admin/deploys', K: '/admin/releases',
      '4': '/admin/auth', W: '/admin/work', Z: '/admin/engineering', B: '/admin/ben-leah',
    };
    for (const [key, href] of Object.entries(before)) expect(hrefForShortcut(key), key).toBe(href);
  });

  it('the Clubhouse screens take letters no live or retired shortcut uses', () => {
    const clubhouse = ADMIN_NAV.filter((e) => e.section === 'Clubhouse' && e.href !== '/admin');
    for (const entry of clubhouse) {
      // A Clubhouse screen with no free letter has no key at all, never a borrowed one.
      if (entry.key === undefined) continue;
      expect(entry.key, entry.href).toMatch(/^[A-Z]$/);
      expect(RETIRED_SHORTCUTS[entry.key], `${entry.key} is a retired shortcut`).toBeUndefined();
    }
    expect(hrefForShortcut('C')).toBe('/admin/clubhouse/codes');
    expect(hrefForShortcut('H')).toBe('/admin/clubhouse');
    expect(hrefForShortcut('N')).toBe('/admin/clubhouse/sessions');
  });

  // PR 3 and PR 4 change this on purpose: a tab may go without a key, but only
  // when no letter is free. Every key-less tab is a Clubhouse lens, and every
  // letter is taken by a live tab or a retired shortcut, so giving one a letter
  // would retrain an operator's hands or break a shortcut they still use.
  it('leaves a tab without a key only when no letter is free', () => {
    const keyless = ADMIN_NAV.filter((e) => e.key === undefined).map((e) => e.href);
    expect(keyless).toEqual([
      '/admin/spaces/today', '/admin/spaces/people', '/admin/spaces/product', '/admin/spaces/reliability', '/admin/spaces/ship', '/admin/spaces/desk',
      '/admin/clubhouse/experience', '/admin/clubhouse/releases', '/admin/clubhouse/drift', '/admin/clubhouse/duet']);
    const taken = new Set([...ADMIN_NAV.map((e) => e.key), ...Object.keys(RETIRED_SHORTCUTS)]);
    const free = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !taken.has(l));
    expect(free).toEqual([]);
  });

  it('owns every page under a space with that space, so a team page lights up People', () => {
    expect(navEntryForPath('/admin/spaces/people/abc')?.label).toBe('People');
    expect(navEntryForPath('/admin/spaces/reliability/speed')?.label).toBe('Reliability');
    expect(navEntryForPath('/admin/spaces')).toBeNull();
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

  // Regression for Bridge Premium Phase 6: AdminShell's global keydown
  // handler used to intercept BOTH 'r' and 'R' for "refresh now" before ever
  // consulting hrefForShortcut, which made Reliability's 'R' tab shortcut
  // permanently unreachable (Shift+R always refreshed, never navigated).
  // AdminShell now only reserves the exact keys in RESERVED_LOCAL_SHORTCUTS
  // (case-sensitive) — this asserts no ADMIN_NAV entry's key can ever fall
  // into that reserved set again, on either side of a future edit.
  it('no ADMIN_NAV shortcut collides with a key AdminShell reserves locally', () => {
    for (const entry of ADMIN_NAV) {
      expect(
        entry.key !== undefined && RESERVED_LOCAL_SHORTCUTS.has(entry.key),
        `${entry.href}'s shortcut '${entry.key}' is reserved by AdminShell's local keydown ` +
          'handler (see RESERVED_LOCAL_SHORTCUTS) and can never navigate there',
      ).toBe(false);
    }
  });
});

describe('navEntryForPath (rail highlight and breadcrumbs)', () => {
  it('picks the longest matching tab, so a Clubhouse sub-screen never lights up Pages too', () => {
    expect(navEntryForPath('/admin/clubhouse')?.label).toBe('Pages');
    expect(navEntryForPath('/admin/clubhouse/P007')?.label).toBe('Pages');
    expect(navEntryForPath('/admin/clubhouse/controls')?.label).toBe('Controls');
    expect(navEntryForPath('/admin/clubhouse/controls/CTL-P007-014')?.label).toBe('Controls');
    expect(navEntryForPath('/admin/clubhouse/codes/70603')?.label).toBe('Codes');
    expect(isNavEntryActive('/admin/clubhouse', '/admin/clubhouse/codes/70603')).toBe(false);
    expect(isNavEntryActive('/admin/clubhouse/codes', '/admin/clubhouse/codes/70603')).toBe(true);
  });

  it('matches on a segment boundary, and /admin owns only itself', () => {
    expect(navEntryForPath('/admin')?.label).toBe('Pulse');
    expect(navEntryForPath('/admin/users/abc')?.href).toBe('/admin/users');
    expect(navEntryForPath('/admin/users-archive')).toBeNull();
    expect(navEntryForPath('/admin/thread/user/1')).toBeNull();
  });
});

describe('ADMIN_MORE_VIEWS (owner D5: self-heal views under More)', () => {
  it('points at views of live tabs, never at a route of its own', () => {
    const navHrefs = new Set(ADMIN_NAV.map((e) => e.href as string));
    for (const view of ADMIN_MORE_VIEWS) {
      const path = view.href.split(/[?#]/)[0]!;
      expect(navHrefs.has(path), `${view.href} is not a view of a live tab`).toBe(true);
      expect(view.href).not.toBe(path);
    }
  });

  it('shows a key hint only when that key already lands on it', () => {
    for (const view of ADMIN_MORE_VIEWS) {
      if (!view.key) continue;
      expect(hrefForShortcut(view.key)).toBeNull();
      expect(RETIRED_SHORTCUTS[view.key]).toBe(view.href);
    }
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

  it('the bottom bar and the rail name the same place the same way', () => {
    expect(BRIDGE_BOTTOM_NAV_LABELS['/admin']).toBe(ADMIN_NAV.find((e) => e.href === '/admin')!.label);
  });
});
