import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_NAV } from '../admin-nav';
import { DESK_TABS, MENU_HIDDEN_HREFS, PRODUCT_TABS, SHIP_TABS, SUPERSEDED_IN_MENU, TODAY_ACTIVITY_HREF, owningSpace } from '../space-tabs';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const navHrefs = new Set<string>(ADMIN_NAV.map((e) => e.href));

describe('what the admin menu leaves out', () => {
  it('hides only pages that ⌘K and breadcrumbs still know (every hidden page stays in ADMIN_NAV)', () => {
    for (const href of MENU_HIDDEN_HREFS) {
      if (!href.startsWith('/admin/')) continue;
      expect(navHrefs.has(href), href).toBe(true);
    }
  });

  it('a page hidden for being one tap away really is one tap from a space (its tab row or Today)', () => {
    // A phone has no ⌘K and no shortcut keys: a hidden page has to be reachable from a page the menu shows.
    expect(read('src/app/admin/spaces/product/page.tsx')).toMatch(/const TABS = PRODUCT_TABS;[\s\S]*<TabLinkRow links=\{TABS\}/);
    expect(read('src/app/admin/spaces/ship/page.tsx')).toMatch(/const TABS = SHIP_TABS;[\s\S]*<TabLinkRow links=\{TABS\}/);
    expect(read('src/app/admin/spaces/desk/page.tsx')).toMatch(/const TABS = DESK_TABS;[\s\S]*<TabLinkRow links=\{TABS\}/);
    expect(read('src/app/admin/spaces/today/page.tsx')).toContain('href={TODAY_ACTIVITY_HREF}');
    const reachable = new Set([...PRODUCT_TABS, ...SHIP_TABS, ...DESK_TABS].map((t) => t.href).concat(TODAY_ACTIVITY_HREF));
    const superseded = new Set(SUPERSEDED_IN_MENU.map((s) => s.href));
    for (const href of MENU_HIDDEN_HREFS) expect(reachable.has(href) || superseded.has(href), href).toBe(true);
  });

  it('keeps every space and every page no space opens in the menu', () => {
    for (const e of ADMIN_NAV.filter((x) => x.section === 'Spaces')) expect(MENU_HIDDEN_HREFS.has(e.href), e.href).toBe(false);
    for (const href of ['/admin/errors', '/admin/users', '/admin/auth', '/admin/traces', '/admin/clubhouse']) {
      expect(MENU_HIDDEN_HREFS.has(href), href).toBe(false);
    }
  });

  it('a superseded front door keeps its page and points at the space that replaced it', () => {
    for (const s of SUPERSEDED_IN_MENU) {
      expect(fs.existsSync(path.join(process.cwd(), 'src/app', s.href, 'page.tsx')), s.href).toBe(true);
      expect(navHrefs.has(s.by), s.by).toBe(true);
    }
  });
});

describe('owningSpace', () => {
  it('lights the space a deeper view belongs to', () => {
    expect(owningSpace('/admin/database')).toBe('/admin/spaces/ship');
    expect(owningSpace('/admin/health/budgets')).toBe('/admin/spaces/product');
    expect(owningSpace('/admin/ben-leah')).toBe('/admin/spaces/desk');
    expect(owningSpace('/admin/activity')).toBe('/admin/spaces/today');
  });
  it('claims nothing else, and never a prefix that only looks alike', () => {
    expect(owningSpace('/admin/errors')).toBeNull();
    expect(owningSpace('/admin/healthcheck')).toBeNull();
    expect(owningSpace('/golf/admin/crm')).toBeNull();
  });
});
