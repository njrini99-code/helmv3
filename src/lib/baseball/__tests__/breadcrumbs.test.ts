import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbs,
  isIdShapedSegment,
  singularize,
} from '@/app/baseball/(dashboard)/_components/breadcrumbs';
import type { BaseballNavContext } from '@/lib/baseball/nav-registry';

const HOME_HREF = '/baseball/dashboard/command-center';

function coachCtx(overrides: Partial<BaseballNavContext> = {}): BaseballNavContext {
  return { role: 'coach', capabilities: {}, programType: 'college', ...overrides };
}

describe('isIdShapedSegment (Ruling 4)', () => {
  it('recognizes a UUID', () => {
    expect(isIdShapedSegment('5e03752b-d7fe-5e31-ab39-f588ba3649d2')).toBe(true);
  });

  it('recognizes an upper-case UUID', () => {
    expect(isIdShapedSegment('5E03752B-D7FE-5E31-AB39-F588BA3649D2')).toBe(true);
  });

  it('recognizes a purely-numeric id', () => {
    expect(isIdShapedSegment('482910')).toBe(true);
  });

  it('does not flag ordinary route words', () => {
    expect(isIdShapedSegment('stats')).toBe(false);
    expect(isIdShapedSegment('dev-plans')).toBe(false);
    expect(isIdShapedSegment('scout-packet')).toBe(false);
  });
});

describe('singularize', () => {
  it('strips a trailing s', () => {
    expect(singularize('players')).toBe('player');
    expect(singularize('games')).toBe('game');
    expect(singularize('programs')).toBe('program');
  });

  it('never strips a trailing ss', () => {
    expect(singularize('address')).toBe('address');
  });

  it('leaves words with no trailing s alone', () => {
    expect(singularize('lift')).toBe('lift');
  });
});

describe('buildBreadcrumbs — UUID/numeric-id segments never render raw (Ruling 4)', () => {
  it('never title-cases a UUID last segment (the reported bug shape)', () => {
    const pathname = '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    const last = crumbs[crumbs.length - 1]!.label;
    expect(last).not.toMatch(/5e03752b|D7fe|Ab39|F588ba3649d2/i);
    expect(last).not.toContain('-');
  });

  it('falls back to a singularized parent segment when no nav entry href prefix-matches (players → Player)', () => {
    const pathname = '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Player' },
    ]);
  });

  it('falls back to a singularized parent segment when no nav entry covers the route (stats/games → Game)', () => {
    const pathname = '/baseball/dashboard/stats/games/482910';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Game' },
    ]);
  });

  it('never title-cases a purely-numeric last segment either', () => {
    const pathname = '/baseball/dashboard/stats/games/482910';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    expect(crumbs[crumbs.length - 1]!.label).not.toBe('482910');
  });

  it('an override label (real record name) wins over any fallback', () => {
    const pathname = '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF, 'Jake Thompson');
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Jake Thompson' },
    ]);
  });

  it('a dynamic dev-plan id resolves via its registry entry, and an override still wins', () => {
    const pathname = '/baseball/dashboard/dev-plans/5e03752b-d7fe-5e31-ab39-f588ba3649d2';
    const withoutOverride = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    expect(withoutOverride[1]!.label).not.toMatch(/5e03752b/i);

    const withOverride = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF, 'Offseason Strength Plan');
    expect(withOverride[1]!.label).toBe('Offseason Strength Plan');
  });

  it('leaves non-id last segments title-cased as before (no regression)', () => {
    const pathname = '/baseball/dashboard/settings/imports';
    const crumbs = buildBreadcrumbs(pathname, coachCtx(), HOME_HREF);
    expect(crumbs[crumbs.length - 1]!.label).not.toBe('');
    expect(crumbs[crumbs.length - 1]!.label).not.toMatch(/^[0-9a-f-]+$/i);
  });

  it('routes moved by the nav IA read sensibly: announcements → Messages hub label', () => {
    const crumbs = buildBreadcrumbs('/baseball/dashboard/announcements', coachCtx(), HOME_HREF);
    expect(crumbs[1]!.label).toBe('Announcements');
  });

  it('routes moved by the nav IA read sensibly: documents/travel keep their own labels', () => {
    expect(buildBreadcrumbs('/baseball/dashboard/documents', coachCtx(), HOME_HREF)[1]!.label).toBe('Documents');
    expect(buildBreadcrumbs('/baseball/dashboard/travel', coachCtx(), HOME_HREF)[1]!.label).toBe('Travel');
  });

  it('the dashboard home route renders a single "Dashboard" crumb with no href', () => {
    expect(buildBreadcrumbs(HOME_HREF, coachCtx(), HOME_HREF)).toEqual([{ label: 'Dashboard' }]);
  });
});
