import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: vi.fn(),
  }),
}));

import { tourFixture } from '../../../preview/fixtures-tournaments';
import { TournamentsHome } from '../TournamentsHome';
import { EventDesk } from '../EventDesk';
import { setUpLanding } from '../../calendar/editor-tournament';
import { listedCount } from '../../calendar/model';
import type { ChTourDeskSearch } from '../types';
import '../../../__tests__/dialog-polyfill';

afterEach(cleanup);

const LINKS = '/golf/dashboard/tournaments/links';

/**
 * Coach audit 13 Nov 2026 (§11, corrected): the Link rounds inbox existed but nothing on screen opened it, and Set up from
 * calendar ended on Calendar. Guilford's six real events were untracked, so their rounds were never linked.
 */
describe('Link rounds is one click away', () => {
  const ready = tourFixture('ready');

  it('the season home always offers Link rounds with its count, 0 included', () => {
    const { unmount } = render(<TournamentsHome data={{ ...ready.home, links: { candidates: 3, high: 1 } }} load="ready" phone={false} />);
    expect(screen.getByRole('link', { name: 'Link rounds (3)' }).getAttribute('href')).toBe(LINKS);
    unmount();
    render(<TournamentsHome data={{ ...ready.home, links: { candidates: 0, high: 0 } }} load="ready" phone={false} />);
    expect(screen.getByRole('link', { name: 'Link rounds (0)' })).toBeTruthy();
  });

  it('when the count did not load, the link stays without one', () => {
    render(<TournamentsHome data={{ ...ready.home, links: null, errors: { ...ready.home.errors, links: true } }} load="ready" phone={false} />);
    expect(screen.getByRole('link', { name: 'Link rounds' }).getAttribute('href')).toBe(LINKS);
  });

  it('every event’s desk offers Link rounds with this event’s count', () => {
    const search: ChTourDeskSearch = { tab: 'overview', round: 'all', view: 'team', holes: 'to-par' };
    const { unmount } = render(<EventDesk data={{ ...ready.desks.e33!, links: 2 }} search={search} load="ready" phone={false} />);
    expect(screen.getByRole('link', { name: 'Link rounds (2)' }).getAttribute('href')).toBe(LINKS);
    unmount();
    render(<EventDesk data={{ ...ready.desks.e33!, links: 0 }} search={search} load="ready" phone={false} />);
    expect(screen.getByRole('link', { name: 'Link rounds (0)' })).toBeTruthy();
  });
});

describe('Set up from calendar lands where the work is', () => {
  it('an event already played lands on Link rounds; one still to come, on its desk', () => {
    expect(setUpLanding({ tournamentId: 't1', firstDay: '2026-11-06' }, '2026-11-12')).toBe(LINKS);
    expect(setUpLanding({ tournamentId: 't1', firstDay: '2026-11-12' }, '2026-11-12')).toBe(LINKS);
    expect(setUpLanding({ tournamentId: 't1', firstDay: '2026-11-20' }, '2026-11-12')).toBe('/golf/dashboard/tournaments/t1');
  });
});

describe('the invite count counts only people listed', () => {
  it('an invitee with no player profile is not counted (12 of 11 was the audit)', () => {
    expect(listedCount(['a', 'b', 'z'], [{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBe(2);
  });
});
