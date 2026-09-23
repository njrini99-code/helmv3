/**
 * A retired tab's keyboard shortcut must keep working — and must never shadow
 * a live one.
 *
 * Shift+G meant "Golf journey lens". After the fold that surface is
 * `/admin/golf?view=journey`, and an operator with the muscle memory should
 * land there rather than nowhere. `AdminShell` consults `RETIRED_SHORTCUTS`
 * only AFTER `hrefForShortcut` misses, so a live tab can never be shadowed by a
 * retired letter; this test pins both halves of that.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_NAV,
  RESERVED_LOCAL_SHORTCUTS,
  hrefForShortcut,
} from '@/app/admin/_components/admin-nav';
import { RETIRED_SHORTCUTS, RETIRED_ADMIN_ROUTES, retiredDestination } from '@/lib/admin/retired-routes';
import { ADMIN_VIEWS, isViewHost } from '@/lib/admin/views';

const navHrefs = new Set(ADMIN_NAV.map((e) => e.href as string));
const entries = Object.entries(RETIRED_SHORTCUTS);

describe('retired keyboard shortcuts', () => {
  it('covers every retired route that owned one', () => {
    expect(entries.length).toBe(RETIRED_ADMIN_ROUTES.length);
    const destinations = new Set(Object.values(RETIRED_SHORTCUTS));
    for (const route of RETIRED_ADMIN_ROUTES) {
      expect(
        destinations.has(retiredDestination(route)),
        `${route.from} was retired but no shortcut points at ${retiredDestination(route)}.`,
      ).toBe(true);
    }
  });

  it('no retired key collides with a live ADMIN_NAV shortcut', () => {
    for (const [key] of entries) {
      expect(
        hrefForShortcut(key),
        `Shift+${key} is a live ADMIN_NAV shortcut AND a retired one. AdminShell ` +
          `prefers the live tab, so the retired mapping is dead code — remove it.`,
      ).toBeNull();
    }
  });

  it('no retired key collides with a reserved local shortcut', () => {
    for (const [key] of entries) {
      // The KEY as written, not its lowercase form. RESERVED_LOCAL_SHORTCUTS
      // holds plain 'r' (refresh); ADMIN_NAV's Reliability shortcut was
      // Shift+'R', and those are deliberately different events — the uppercase
      // convention exists precisely so a letter tab can never collide with a
      // plain-key local action. Lowercasing here would have rejected 'R', the
      // one shortcut most likely to be in an operator's fingers.
      expect(RESERVED_LOCAL_SHORTCUTS.has(key)).toBe(false);
      // Uppercase (Shift+letter) form only, same convention as ADMIN_NAV.
      expect(key).toMatch(/^[A-Z0-9]$/);
    }
  });

  it('every retired key is unique', () => {
    expect(new Set(entries.map(([k]) => k)).size).toBe(entries.length);
  });

  it('every destination is a live route with a registered view', () => {
    for (const [key, href] of entries) {
      const [pathname, query] = href.split('?') as [string, string | undefined];
      expect(navHrefs.has(pathname), `Shift+${key} points at ${pathname}, which is not in ADMIN_NAV.`).toBe(true);
      if (!query) continue;
      const view = new URLSearchParams(query).get('view')!;
      expect(isViewHost(pathname)).toBe(true);
      expect(
        (ADMIN_VIEWS[pathname as keyof typeof ADMIN_VIEWS] as readonly string[]).includes(view),
        `Shift+${key} opens ?view=${view}, which ${pathname} does not register.`,
      ).toBe(true);
    }
  });

  it('AdminShell consults the retired table AFTER the live one', () => {
    // Order is the whole safety property: consulted first, a retired letter
    // would shadow any future nav entry that reused it.
    const shell = fs.readFileSync(
      path.join(process.cwd(), 'src/app/admin/_components/AdminShell.tsx'),
      'utf8',
    );
    expect(shell).toContain('RETIRED_SHORTCUTS');
    const live = shell.indexOf('hrefForShortcut(');
    const retired = shell.indexOf('RETIRED_SHORTCUTS[');
    expect(live).toBeGreaterThanOrEqual(0);
    expect(retired).toBeGreaterThan(live);
  });
});
