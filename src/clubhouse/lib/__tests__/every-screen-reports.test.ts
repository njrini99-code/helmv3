import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import graph from '../../../../docs/clubhouse/generated/bridge-graph.json';
import { pageRouteKeys, routeKey } from '@/lib/admin/clubhouse/route-key';
import { pageForPath } from '../signal-page';
import { routeForPath } from '../signal-route';

/**
 * Every screen reports (Bridge plan §4.2): each of the 66 route keys in the Bridge graph has, wired in the app router,
 *
 * - views and load time: the dashboard's shell (ClubhouseShell → ClubhouseFrame → useChSignals) or, on the front door,
 *   GateSignals (the golf layout → useChSignals). useChSignals counts a view per screen, times a switch to it, and
 *   reports LCP, INP and CLS once per document (use-signals.test.tsx shows each);
 * - errors: the nearest error.tsx renders RouteErrorBoundary inside Clubhouse (the shell's, or the front door's own view),
 *   which sends the crash as a reported signal (route-error-signal.test.tsx); a section's crash inside a screen goes
 *   through SectionBoundary, in the shell;
 * - the screen itself: its address resolves to its key, on a page that lists that key, so the signal route keeps it.
 *
 * A new route with none of these fails here, by name, before it ships silent.
 */

const ROOT = join(__dirname, '../../../..');
const APP = join(ROOT, 'src/app');
const GOLF = join(APP, 'golf');
const DASHBOARD_GROUP = join(GOLF, '(dashboard)');

type Screen = { page: string; route: string; view?: string; audience: string; name?: string };
const pages = graph.pages as unknown as Record<string, { screens: Omit<Screen, 'page'>[] }>;
const screens: Screen[] = Object.entries(pages).flatMap(([page, p]) => p.screens.map((s) => ({ ...s, page })));

/** Every page.tsx under src/app/golf, by the address it serves (route groups dropped). */
function pageFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name.startsWith('_')) continue;
        walk(full);
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        const url = '/' + relative(APP, dir).split(sep).filter((seg) => !/^\(.*\)$/.test(seg)).join('/');
        out.set(url, full);
      }
    }
  };
  walk(GOLF);
  return out;
}

/** The error.tsx nearest a page, walking up to src/app/golf. */
function nearestError(pageFile: string): string | null {
  for (let dir = dirname(pageFile); dir.startsWith(GOLF); dir = dirname(dir)) {
    const f = join(dir, 'error.tsx');
    if (existsSync(f)) return f;
    if (dir === GOLF) break;
  }
  return null;
}

const read = (f: string) => readFileSync(f, 'utf8');
const fill = (route: string) => route.replace(/\[[^\]]+\]/g, '3f9a1c2e-0000-4000-8000-00000000abcd');
const query = (view: string) => view.replace(/<id>/g, 'p-7').replace(/=([\w-]+)\|[\w|-]+/g, '=$1');
const ROLES = ['coach', 'player', 'signed-out'] as const;

const files = pageFiles();
const keys = [...new Set(screens.map((s) => routeKey(s.route, s.view)))];

describe('every screen reports to the Bridge', () => {
  it('counts 66 screens: the denominator the Pages view shows', () => {
    expect(keys).toHaveLength(66);
  });

  it('the emitters are mounted where the screens are drawn', () => {
    const shell = read(join(DASHBOARD_GROUP, 'layout.tsx'));
    expect(shell).toMatch(/<ClubhouseShell\b/);
    expect(read(join(ROOT, 'src/clubhouse/shell/ClubhouseShell.tsx'))).toMatch(/<ClubhouseFrame\b/);
    expect(read(join(ROOT, 'src/clubhouse/shell/ClubhouseFrame.tsx'))).toMatch(/useChSignals\(\{[^}]*pathname, search \}\)/);
    expect(read(join(GOLF, 'layout.tsx'))).toMatch(/<GateSignals\b/);
    const hook = read(join(ROOT, 'src/clubhouse/shell/use-signals.ts'));
    expect(hook).toMatch(/useReportWebVitals\(/);
    expect(hook).toMatch(/routeForPath\(pathname, search\)/);
  });

  for (const s of screens) {
    const key = routeKey(s.route, s.view);
    it(`${s.page} ${key}: views, load time and errors`, () => {
      // Drawn by the app router.
      const file = files.get(s.route);
      expect(file, `${s.route} has no page.tsx under src/app/golf`).toBeDefined();

      // The screen: its address is this key, on a page that lists it (else the signal route drops the key).
      const path = fill(s.route);
      const search = s.view ? query(s.view) : '';
      expect(routeForPath(path, search)).toBe(key);
      const roles = ROLES.filter((r) => (s.audience === 'shared' ? r !== 'signed-out' : r === s.audience));
      expect(roles.length, `${key} has an audience no role opens`).toBeGreaterThan(0);
      for (const role of roles) {
        const on = pageForPath(path, search, role);
        expect(pageRouteKeys(pages[on]?.screens), `${role} on ${key} counts under ${on}`).toContain(key);
      }

      // Views and load time: the shell inside the dashboard, GateSignals on the front door.
      const inDashboard = file!.startsWith(DASHBOARD_GROUP + sep);
      if (!inDashboard) expect(pageForPath(path, '', ''), `${key} is outside the shell, so GateSignals must claim it`).toBe('P015');

      // Errors: the nearest route boundary is Clubhouse's (inside the shell, or the front door's own view).
      const boundary = nearestError(file!);
      expect(boundary, `${key} has no error.tsx above it`).not.toBeNull();
      const src = read(boundary!);
      expect(src).toMatch(/<RouteErrorBoundary\b/);
      if (inDashboard) expect(boundary!.startsWith(DASHBOARD_GROUP + sep), `${key}'s boundary is outside the shell`).toBe(true);
      else expect(src).toMatch(/outsideShell=\{GateError\}/);
    });
  }
});
