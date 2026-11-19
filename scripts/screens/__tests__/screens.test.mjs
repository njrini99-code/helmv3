// The screen list (every page.tsx plus the Clubhouse fixtures) and the sweep's pure parts: plan, dynamic routes, the
// production refusal and the blanked environment for its own server.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessOf, areaOf, listScreens, productOf, routeFromPageFile, summarize } from '../list.mjs';
import { blankedEnv, gallery, main, patternRegex, plan, resolveDynamic } from '../sweep.mjs';
import { KNOWN_PROD_PROJECT_REF } from '../../lib/prod-target-guard.mjs';

describe('routeFromPageFile', () => {
  it('drops route groups and keeps dynamic segments', () => {
    expect(routeFromPageFile('src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx')).toEqual({ route: '/golf/dashboard/roster/[id]', groups: ['(dashboard)'], dynamic: ['id'], catchAll: false });
    expect(routeFromPageFile('src/app/page.tsx').route).toBe('/');
    expect(routeFromPageFile('src/app/golf/(dashboard)/dashboard/[...missing]/page.tsx').catchAll).toBe(true);
  });
});

describe('classification', () => {
  it('names the product, the access and the area', () => {
    expect(productOf('/golf/admin/crm')).toBe('admin');
    expect(productOf('/lifting/dashboard/today')).toBe('lifting');
    expect(productOf('/pricing')).toBe('public');
    expect(accessOf({ route: '/golf/login', groups: ['(auth)'] })).toBe('public');
    expect(accessOf({ route: '/baseball/team/[id]', groups: ['(public)'] })).toBe('public');
    expect(accessOf({ route: '/baseball/dashboard/players', groups: ['(dashboard)'] })).toBe('signed-in');
    expect(accessOf({ route: '/admin/users', groups: [] })).toBe('admin');
    expect(areaOf('/golf/dashboard/roster/[id]')).toBe('roster');
    expect(areaOf('/golf/dashboard')).toBe('home');
  });
});

describe('listScreens on this repo', () => {
  it('finds every product, the Clubhouse fixture states and no API route', async () => {
    const screens = await listScreens();
    const sum = summarize(screens);
    for (const p of ['golf', 'baseball', 'lifting', 'admin', 'public', 'fixtures']) expect(sum[p]?.total, p).toBeGreaterThan(0);
    expect(screens.some((s) => s.route === '/golf/dashboard/team-hub')).toBe(true);
    expect(screens.some((s) => s.route === '/clubhouse-preview/home?state=empty')).toBe(true);
    expect(screens.some((s) => s.route.startsWith('/api'))).toBe(false);
    expect(screens.some((s) => s.route === '/clubhouse-preview/[screen]')).toBe(false);
    expect(new Set(screens.map((s) => s.id)).size).toBe(screens.length);
  });
});

describe('plan', () => {
  const s = (route, access, product = 'golf', dynamic = []) => ({ id: route, route, access, product, dynamic, area: 'x', kind: 'route' });
  it('opens public and fixture screens signed out, signed-in screens once per matching session, and says why the rest wait', () => {
    const { visits, skipped } = plan([s('/golf/login', 'public'), s('/golf/dashboard', 'signed-in'), s('/baseball/dashboard', 'signed-in', 'baseball'), s('/admin', 'admin', 'admin')], {
      sessions: { 'golf:coach': '/a.json', 'golf:player': '/b.json' },
    });
    expect(visits.map((v) => `${v.screen.route}|${v.session}`)).toEqual(['/golf/login|signed-out', '/golf/dashboard|golf:coach', '/golf/dashboard|golf:player']);
    expect(skipped.map((k) => k.screen.route)).toEqual(['/baseball/dashboard', '/admin']);
    expect(skipped[0].why).toMatch(/--session baseball:/);
  });
  it('skips the paid round review unless allowed, and the catch-all and impersonation routes always', () => {
    const screens = [s('/golf/dashboard/rounds/[id]', 'signed-in', 'golf', ['id']), s('/golf/dashboard/[...missing]', 'signed-in'), s('/admin/users/[id]/view-as', 'admin', 'admin', ['id'])];
    const sessions = { 'golf:coach': '/a.json', 'admin:owner': '/c.json' };
    expect(plan(screens, { sessions }).visits).toEqual([]);
    expect(plan(screens, { sessions, allowPaid: true }).visits.map((v) => v.screen.route)).toEqual(['/golf/dashboard/rounds/[id]']);
  });
});

describe('dynamic routes', () => {
  it('match concrete paths only for their own pattern', () => {
    expect(patternRegex('/golf/dashboard/roster/[id]').test('/golf/dashboard/roster/abc-123')).toBe(true);
    expect(patternRegex('/golf/dashboard/roster/[id]').test('/golf/dashboard/roster/abc/edit')).toBe(false);
    const found = resolveDynamic(['/golf/dashboard/roster/[id]', '/golf/dashboard/qualifiers/[id]/edit'], ['/golf/dashboard', '/golf/dashboard/roster/p1', '/golf/dashboard/roster/p2']);
    expect([...found.entries()]).toEqual([['/golf/dashboard/roster/[id]', '/golf/dashboard/roster/p1']]);
  });
});

describe('safety', () => {
  it('refuses the production site before it starts anything, unless HELM_ALLOW_PRODUCTION=1', async () => {
    const saved = process.env.HELM_ALLOW_PRODUCTION;
    delete process.env.HELM_ALLOW_PRODUCTION;
    try {
      await expect(main(['--base', 'https://helmsportslabs.com'])).rejects.toThrow(/does not open the production site unless HELM_ALLOW_PRODUCTION=1/);
      await expect(main(['--base', 'https://www.helmsportslabs.com/golf'])).rejects.toThrow(/production/);
      process.env.HELM_ALLOW_PRODUCTION = 'yes';
      await expect(main(['--base', 'https://helmsportslabs.com'])).rejects.toThrow(/production/);
    } finally {
      if (saved === undefined) delete process.env.HELM_ALLOW_PRODUCTION; else process.env.HELM_ALLOW_PRODUCTION = saved;
    }
  });
  it('checks the desktop engine before it starts anything', async () => {
    await expect(main(['--base', 'http://127.0.0.1:1', '--desktop-engine', 'firefox'])).rejects.toThrow(/--desktop-engine is webkit or chromium/);
  });
  it('blanks every env-file key for its own server, except the allowlist, and fakes Supabase', () => {
    const dir = mkdtempSync(join(tmpdir(), 'screens-env-'));
    writeFileSync(join(dir, '.env.local'), `RESEND_API_KEY=re_live\nANTHROPIC_API_KEY=sk-x\nNEXT_PUBLIC_SUPABASE_URL=https://${KNOWN_PROD_PROJECT_REF}.supabase.co\nNEXT_PUBLIC_APP_URL=http://x\n`);
    const env = blankedEnv({ PATH: '/bin' }, dir);
    expect(env.RESEND_API_KEY).toBe('');
    expect(env.ANTHROPIC_API_KEY).toBe('');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect('NEXT_PUBLIC_APP_URL' in env).toBe(false);
    expect(env.PATH).toBe('/bin');
  });
});

describe('gallery', () => {
  it('renders a filterable page with every shot, its findings and the screens not opened', () => {
    const html = gallery({
      base: 'http://127.0.0.1:3111', at: 'now', screens: 2,
      results: [{ url: '/golf/login', route: '/golf/login', product: 'golf', access: 'public', session: 'signed-out', viewport: 'phone', tier: 'W', theme: 'dark', status: 200, shot: 'shots/a.jpg', findings: { axe: [{ id: 'color-contrast', impact: 'serious', nodes: 2 }], smallTargets: [], clipped: [], sideways: false, consoleErrors: [] } }],
      skipped: [{ route: '/golf/dashboard', why: 'needs a golf session' }],
    });
    expect(html).toContain('<title>Every screen</title>');
    expect(html).toContain('axe color-contrast (serious) × 2');
    expect(html).toContain('data-n="1"');
    expect(html).toContain('needs a golf session');
  });
});
