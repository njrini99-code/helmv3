import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('server-only', () => ({}));
const gate = vi.hoisted(() => ({ on: false, routeCalls: 0 }));
vi.mock('@/clubhouse/gate', () => ({ isTournamentsFor: async () => gate.on }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ coach: { id: 'c1' } }) }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => 'coach' }));
vi.mock('@/clubhouse/routes/tournaments', () => ({
  ClubhouseTournamentsRoute: () => {
    gate.routeCalls += 1;
    return null;
  },
}));

import { TourNotice } from '../screens/tournaments/TourNotice';
import { activeNavItem, isRebuilt, navFor, phoneSectionsFor } from '../shell/nav';
import { deskSearchOf } from '../routes/tournaments-search';
import HomePage from '../../app/golf/(dashboard)/dashboard/tournaments/page';
import NewPage from '../../app/golf/(dashboard)/dashboard/tournaments/new/page';
import ComparePage from '../../app/golf/(dashboard)/dashboard/tournaments/compare/page';
import HistoryPage from '../../app/golf/(dashboard)/dashboard/tournaments/history/page';
import LinksPage from '../../app/golf/(dashboard)/dashboard/tournaments/links/page';
import DeskPage from '../../app/golf/(dashboard)/dashboard/tournaments/[id]/page';
import EditPage from '../../app/golf/(dashboard)/dashboard/tournaments/[id]/edit/page';
import LineupPage from '../../app/golf/(dashboard)/dashboard/tournaments/[id]/lineup/page';
import LivePage from '../../app/golf/(dashboard)/dashboard/tournaments/[id]/live/page';

afterEach(cleanup);
beforeEach(() => {
  gate.on = false;
  gate.routeCalls = 0;
});

/**
 * P016 wired (2026-10-25): the route states every Tournaments page draws instead of a view, the nav entry and routes
 * behind golf_tournaments_v1, and the flag-off answer of every page (not found, before any read).
 */
describe('Tournaments route states', () => {
  it('CH-16302: not set up yet (the held migrations are not applied), for a coach and a player', () => {
    const { container, unmount } = render(<TourNotice kind="not_set_up" phone={false} />);
    expect(container.querySelector('[data-ch-code="CH-16302"]')).not.toBeNull();
    expect(screen.getByText('Tournaments aren’t set up yet')).toBeTruthy();
    unmount();
    render(<TourNotice kind="not_set_up" coach={false} phone />);
    expect(screen.getByText(/once your coach’s Tournaments is set up/)).toBeTruthy();
  });

  it('CH-16303: on no team', () => {
    const { container } = render(<TourNotice kind="no_team" phone={false} />);
    expect(container.querySelector('[data-ch-code="CH-16303"]')).not.toBeNull();
  });

  it('CH-16304: an event that is not this team’s, with the way back', () => {
    const { container } = render(<TourNotice kind="not_found" phone={false} />);
    expect(container.querySelector('[data-ch-code="CH-16304"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to tournaments' }).getAttribute('href')).toBe('/golf/dashboard/tournaments');
  });

  it('CH-16305: a player on a coach’s page', () => {
    const { container } = render(<TourNotice kind="coach_only" coach={false} phone={false} />);
    expect(container.querySelector('[data-ch-code="CH-16305"]')).not.toBeNull();
  });

  it('the page failure is the views’ own CH-16201', () => {
    const { container } = render(<TourNotice kind="failed" title="Event" phone={false} />);
    expect(container.querySelector('[data-ch-code="CH-16201"]')).not.toBeNull();
  });
});

describe('Tournaments in the nav, behind golf_tournaments_v1', () => {
  it('off (nothing passed): no entry, no strip section, not a rebuilt route', () => {
    for (const role of ['coach', 'player'] as const) {
      expect(navFor(role).some((i) => i.id === 'tournaments')).toBe(false);
      expect(phoneSectionsFor(role).some((i) => i.id === 'tournaments')).toBe(false);
      expect(isRebuilt('/golf/dashboard/tournaments', role)).toBe(false);
    }
  });

  it('on: the Team group after Qualifiers (D-80), for coaches and players', () => {
    for (const role of ['coach', 'player'] as const) {
      const nav = navFor(role, { tournaments: true });
      const at = nav.findIndex((i) => i.id === 'qualifiers');
      expect(nav[at + 1]).toMatchObject({ id: 'tournaments', section: 'Team', href: '/golf/dashboard/tournaments' });
      expect(phoneSectionsFor(role, { tournaments: true }).some((i) => i.id === 'tournaments')).toBe(true);
    }
  });

  it('on: every planned route is rebuilt and highlights Tournaments', () => {
    const f = { tournaments: true };
    const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    for (const path of ['', '/new', '/compare', '/history', '/links', `/${id}`, `/${id}/edit`, `/${id}/lineup`, `/${id}/live`]) {
      expect(isRebuilt(`/golf/dashboard/tournaments${path}`, 'coach', f)).toBe(true);
      expect(activeNavItem(`/golf/dashboard/tournaments${path}`, 'coach', f)?.id).toBe('tournaments');
    }
    expect(isRebuilt('/golf/dashboard/tournaments/not-an-id', 'coach', f)).toBe(false);
  });
});

describe('the desk’s URL state', () => {
  it('reads tab, round, view and holes, and falls back for anything else', () => {
    expect(deskSearchOf({ tab: 'holes', round: '2', view: 'players', holes: 'scores' })).toEqual({ tab: 'holes', round: 2, view: 'players', holes: 'scores' });
    expect(deskSearchOf({ tab: 'nope', round: '9', view: 'x' })).toEqual({ tab: 'overview', round: 'all', view: 'team', holes: 'to-par' });
  });
});

type Page = (props: never) => Promise<unknown>;
const PAGES: Array<[string, Page]> = [
  ['', HomePage as Page],
  ['new', NewPage as Page],
  ['compare', ComparePage as Page],
  ['history', HistoryPage as Page],
  ['links', LinksPage as Page],
  ['[id]', DeskPage as Page],
  ['[id]/edit', EditPage as Page],
  ['[id]/lineup', LineupPage as Page],
  ['[id]/live', LivePage as Page],
];
const props = () => ({ params: Promise.resolve({ id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }), searchParams: Promise.resolve({}) }) as never;

describe('every Tournaments page with the flag off', () => {
  for (const [p, page] of PAGES) {
    it(`/tournaments/${p} is not found, and the route never runs`, async () => {
      await expect(page(props())).rejects.toThrow('NEXT_NOT_FOUND');
      expect(gate.routeCalls).toBe(0);
    });
  }

  it('with the flag on, the page hands over to the route', async () => {
    gate.on = true;
    await expect(HomePage(props())).resolves.toBeTruthy();
  });
});
