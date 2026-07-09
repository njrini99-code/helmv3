import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbs,
  isIdShapedSegment,
  singularize,
  toTitle,
} from '@/app/baseball/(dashboard)/_components/breadcrumbs';
import type { BaseballNavContext } from '@/lib/baseball/nav-registry';

// Table-driven — locks in buildBreadcrumbs's hub-vs-subpage label logic (the
// settings-collapse bug fixed at breadcrumbs.ts L80-91 already slipped
// through review once without a test).

const HOME_HREF = '/baseball/dashboard/command-center';
const COACH_CTX: BaseballNavContext = { role: 'coach', capabilities: {} };

describe('toTitle', () => {
  it('replaces dashes with spaces and title-cases each word', () => {
    expect(toTitle('dev-plans')).toBe('Dev Plans');
    expect(toTitle('permissions')).toBe('Permissions');
  });
});

describe('singularize', () => {
  it('strips a trailing non-"ss" s', () => {
    expect(singularize('players')).toBe('player');
    expect(singularize('games')).toBe('game');
  });

  it('leaves a trailing "ss" alone', () => {
    expect(singularize('progress')).toBe('progress');
  });

  it('leaves a single-character or already-singular segment alone', () => {
    expect(singularize('s')).toBe('s');
    expect(singularize('team')).toBe('team');
  });
});

describe('isIdShapedSegment', () => {
  it('recognizes a UUID', () => {
    expect(isIdShapedSegment('5e03752b-d7fe-5e31-ab39-f588ba3649d2')).toBe(true);
  });

  it('recognizes a purely-numeric segment', () => {
    expect(isIdShapedSegment('123')).toBe(true);
  });

  it('rejects an ordinary route segment', () => {
    expect(isIdShapedSegment('settings')).toBe(false);
    expect(isIdShapedSegment('dev-plans')).toBe(false);
  });
});

describe('buildBreadcrumbs', () => {
  it('returns just "Dashboard" on the home route', () => {
    expect(buildBreadcrumbs(HOME_HREF, COACH_CTX, HOME_HREF)).toEqual([{ label: 'Dashboard' }]);
  });

  it('hub landing page uses the registry entry\'s own label (Settings)', () => {
    const crumbs = buildBreadcrumbs('/baseball/dashboard/settings', COACH_CTX, HOME_HREF);
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Settings' },
    ]);
  });

  it('a subpage folded under the Settings hub uses its OWN trailing segment, not the hub label', () => {
    // Regression case for the settings-collapse bug: /settings/permissions
    // must read "Permissions", never fall back to the hub's "Settings" crumb.
    const crumbs = buildBreadcrumbs('/baseball/dashboard/settings/permissions', COACH_CTX, HOME_HREF);
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Permissions' },
    ]);
  });

  it('a UUID-shaped trailing segment falls back to the singularized parent segment, never the raw id', () => {
    const crumbs = buildBreadcrumbs(
      '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2',
      COACH_CTX,
      HOME_HREF,
    );
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Player' },
    ]);
  });

  it('a numeric-shaped trailing segment falls back the same way as a UUID', () => {
    const crumbs = buildBreadcrumbs('/baseball/dashboard/games/123', COACH_CTX, HOME_HREF);
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Game' },
    ]);
  });

  it('overrideLabel wins over the id-shaped-segment fallback', () => {
    const crumbs = buildBreadcrumbs(
      '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2',
      COACH_CTX,
      HOME_HREF,
      'Jordan Smith',
    );
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Jordan Smith' },
    ]);
  });

  it('overrideLabel wins over a non-id-shaped trailing segment too', () => {
    const crumbs = buildBreadcrumbs(
      '/baseball/dashboard/players/5e03752b-d7fe-5e31-ab39-f588ba3649d2/stats',
      COACH_CTX,
      HOME_HREF,
      'Jordan Smith — Stats',
    );
    expect(crumbs).toEqual([
      { label: 'Dashboard', href: HOME_HREF },
      { label: 'Jordan Smith — Stats' },
    ]);
  });
});
