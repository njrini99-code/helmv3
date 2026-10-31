import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as nav from '../shell/nav';

/**
 * Audit 2026-10-29, fix plan PR 6: the frame's route tables know the role and the real dashboard folders.
 * - F-0055: an old address aliases only for the roles its layout sends on; the other role sees its page at once instead of
 *   waiting 2 s for a redirect that never comes.
 * - F-0056: a coach's qualifying link opened by a player goes to the player's qualifier.
 * - F-0025: a mistyped dashboard address is "We couldn't find that", not "hasn't been rebuilt yet".
 * - F-0066: a player's address drops the coach-only parameters it was opened with.
 */
const DASH = join(process.cwd(), 'src/app/golf/(dashboard)/dashboard');
const hasPage = (dir: string): boolean =>
  readdirSync(dir).some((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? hasPage(p) : n === 'page.tsx';
  });

describe('role-aware aliases (F-0055, F-0056)', () => {
  it('courses aliases for a coach only; live and whats-new for a player only', () => {
    expect(nav.isAliased('/golf/dashboard/courses', 'coach')).toBe(true);
    expect(nav.isAliased('/golf/dashboard/courses', 'player')).toBe(false);
    expect(nav.isAliased('/golf/dashboard/live', 'coach')).toBe(false);
    expect(nav.isAliased('/golf/dashboard/live', 'player')).toBe(true);
    expect(nav.isAliased('/golf/dashboard/whats-new', 'coach')).toBe(false);
  });

  it('every layout’s role keys match the table', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/^(layout|page)\.tsx$/.test(n) && readFileSync(p, 'utf8').includes('redirectToClubhouse(')) out.push(p);
      }
      return out;
    };
    for (const file of walk(DASH)) {
      const src = readFileSync(file, 'utf8');
      const call = src.slice(src.indexOf('redirectToClubhouse('));
      const body = call.slice(0, call.indexOf(');'));
      const address =
        '/golf/dashboard/' +
        file
          .slice(DASH.length + 1)
          .split('/')
          .slice(0, -1)
          .map((s) => (/^\[.*\]$/.test(s) ? 'x' : s))
          .join('/');
      for (const role of ['coach', 'player'] as const) expect(nav.isAliased(address, role), `${address} ${role}`).toBe(new RegExp(`\\b${role}:`).test(body));
    }
  });

  it('a coach qualifying link sends a player to their qualifier (F-0056)', () => {
    const src = readFileSync(join(DASH, 'coachhelm/qualifying/[id]/layout.tsx'), 'utf8');
    expect(src).toMatch(/player: `\/golf\/dashboard\/qualifiers\/\$\{encodeURIComponent\(id\)\}`/);
    expect(nav.isAliased('/golf/dashboard/coachhelm/qualifying/q1', 'player')).toBe(true);
  });
});

describe('real dashboard folders (F-0025)', () => {
  it('CH_DASHBOARD_SEGMENTS is every folder under the dashboard with a page', () => {
    const real = readdirSync(DASH)
      .filter((n) => !n.startsWith('[') && !n.startsWith('_') && n !== '__tests__' && statSync(join(DASH, n)).isDirectory() && hasPage(join(DASH, n)))
      .sort();
    expect([...nav.CH_DASHBOARD_SEGMENTS].sort()).toEqual(real);
  });

  it('a mistyped address is not known; a real one is', () => {
    expect(nav.isKnownDashboardPath('/golf/dashboard/zz-anything')).toBe(false);
    expect(nav.isKnownDashboardPath('/golf/dashboard/calendar')).toBe(true);
    expect(nav.isKnownDashboardPath('/golf/dashboard')).toBe(true);
  });

  it('the frame renders the not-found page for an unknown address instead of "not rebuilt"', () => {
    const frame = readFileSync(join(process.cwd(), 'src/clubhouse/shell/ClubhouseFrame.tsx'), 'utf8');
    expect(frame).toMatch(/isKnownDashboardPath\(pathname\)/);
  });
});

describe('coach-only parameters (F-0066)', () => {
  it('a player’s Stats address drops ?player=, keeps the rest; Messages keeps its deep links', () => {
    expect(nav.withoutCoachParams('/golf/dashboard/stats', 'player=abc&window=season', 'player')).toBe('window=season');
    expect(nav.withoutCoachParams('/golf/dashboard/stats', 'player=abc', 'coach')).toBe('player=abc');
    expect(nav.withoutCoachParams('/golf/dashboard/messages', 'player=abc', 'player')).toBe('player=abc');
  });
});
