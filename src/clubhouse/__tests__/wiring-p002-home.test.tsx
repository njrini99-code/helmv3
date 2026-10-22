import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P002 wiring audit (2026-10-17): the first run's Invite players opens Roster's invite sheet (`?invite=1`, which Roster
 * reads once), on desktop and on the phone, rather than only the Roster page.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard' }));

import type { ChCoachHome } from '../data/home';
import { PREVIEW_HOME } from '../preview/fixtures';
import { CoachHome } from '../screens/home/CoachHome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const EMPTY: ChCoachHome = {
  ...PREVIEW_HOME,
  week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  latestRounds: { rounds: [], error: false, holesError: false },
  leaderboard: { rows: [], scorecards: 0, rosterSize: 0, error: false },
  phone: { next: null, today: [], form: null, weekNote: null },
};

const wrap = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <CoachHome data={EMPTY} now={new Date().toISOString()} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

describe('P002 · 20103 first run: Invite players opens the invite sheet', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });
  const media = (phone: boolean) =>
    ((q: string) => ({
      matches: phone && q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;

  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: the link is /golf/dashboard/roster?invite=1', (_, phone) => {
    window.matchMedia = media(phone);
    wrap();
    expect(screen.getByRole('link', { name: 'Invite players' }).getAttribute('href')).toBe('/golf/dashboard/roster?invite=1');
  });
});

describe('P002 · 20104 20105 coach parity wiring (spec B): the manifest names what Coach Home reads and does', () => {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(join(root, 'config/clubhouse/pages/P002-home.json'), 'utf8')) as { actions: Array<{ id: string; data: string[]; bridge: Record<string, number> }> };
  const action = (id: string) => manifest.actions.find((a) => a.id === id);

  it('Open Coach Home reads the team, the round cache, the Tour’s marks, tasks, posts and their acknowledgements, and join requests', () => {
    expect(action('ACT-P002-OPEN-COACH-HOME')!.data).toEqual(
      expect.arrayContaining([
        'golf_teams',
        'golf_round_stats_cache',
        'golf_pga_standards',
        'golf_tasks',
        'golf_task_assignments',
        'golf_announcements',
        'golf_announcement_recipients',
        'golf_announcement_acknowledgements',
        'golf_team_join_requests',
      ]),
    );
  });

  it('the new actions are in the manifest, each with its Bridge links', () => {
    for (const id of ['ACT-P002-OPEN-COACHHELM-PLAYER', 'ACT-P002-QUEUE-JOINS', 'ACT-P002-QUEUE-REPLIES', 'ACT-P002-QUEUE-TASKS', 'ACT-P002-QUEUE-POSTS', 'ACT-P002-NUDGE-NEXT', 'ACT-P002-OPEN-LEG-PLAYER']) {
      expect(action(id)?.bridge.links, id).toBe(20103);
    }
  });

  it('the new states are in the Home catalog, and the new rows have their styles', () => {
    const catalog = readFileSync(join(root, 'docs/clubhouse/catalog/home.md'), 'utf8');
    for (const c of ['CH-2218', 'CH-2219', 'CH-2220', 'CH-2221', 'CH-2314', 'CH-2315']) expect(catalog).toMatch(new RegExp(`^\\| ${c} \\|`, 'm'));
    const css = readFileSync(join(root, 'src/clubhouse/styles/home.css'), 'utf8');
    for (const cls of ['ch-h-queue', 'ch-h-legs', 'ch-hm-queue', 'ch-hm-legs']) expect(css, cls).toMatch(new RegExp(`\\.${cls}(__[a-z]+)? \\{`));
  });
});
