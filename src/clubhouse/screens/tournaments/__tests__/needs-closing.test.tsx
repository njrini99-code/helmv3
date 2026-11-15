import { cleanup, render, screen, within } from '@testing-library/react';
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
import type { ChTourDeskSearch, ChTourEvent, ChTourHomeData } from '../types';
import '../../../__tests__/dialog-polyfill';

afterEach(cleanup);

/**
 * Coach audit 13 Nov 2026 (§10–§11): Tar Heel R1 was left `live` on 25 Oct and the Tournaments hero said "Live now ·
 * Follow live" for 18 days; the Carolinas Classic said "Upcoming" after it ended. An event past its day that isn't final
 * says "Needs closing" and offers the round to close.
 */
const ready = tourFixture('ready');
const home = ready.home;
const nextId = home.next!.eventId;
const stale = (e: ChTourEvent, live: boolean): ChTourEvent => ({ ...e, status: live ? 'live' : 'upcoming', mood: live ? 'live' : 'prep', show: 'needs_closing', close: { round: 1, live } });

describe('an event past its day that is not final', () => {
  it('the hero says Needs closing, never Live now, and its action finishes round 1', () => {
    const data: ChTourHomeData = { ...home, events: home.events.map((e) => (e.id === nextId ? stale(e, true) : e)), next: { ...home.next!, action: 'close' } };
    const { container } = render(<TournamentsHome data={data} load="ready" phone={false} />);
    const hero = container.querySelector('.ch-tour-home-feat') as HTMLElement;
    expect(hero.textContent).toContain('Needs closing');
    expect(hero.textContent).not.toContain('Live now');
    const finish = within(hero).getByRole('link', { name: /Finish round 1/ });
    expect(finish.getAttribute('href')).toBe(`/golf/dashboard/tournaments/${nextId}/live?round=1`);
  });

  it('a round never started is scored, not finished', () => {
    const data: ChTourHomeData = { ...home, events: home.events.map((e) => (e.id === nextId ? stale(e, false) : e)), next: { ...home.next!, action: 'close' } };
    const { container } = render(<TournamentsHome data={data} load="ready" phone={false} />);
    const hero = container.querySelector('.ch-tour-home-feat') as HTMLElement;
    expect(within(hero).getByRole('link', { name: /Score round 1/ })).toBeTruthy();
  });

  it('in the events list it says Needs closing, not Upcoming', () => {
    const other = home.events.find((e) => e.id !== nextId && e.status !== 'complete')!;
    const data: ChTourHomeData = { ...home, events: home.events.map((e) => (e.id === other.id ? stale(e, false) : e)) };
    render(<TournamentsHome data={data} load="ready" phone={false} />);
    const row = screen.getAllByText(other.name).map((el) => el.closest('li')).find(Boolean) as HTMLElement;
    expect(row.textContent).toContain('Needs closing');
    expect(row.textContent).not.toContain('Upcoming');
  });

  it('the desk’s head says Needs closing and its action finishes the round', () => {
    const desk = ready.desks.e33!;
    const search: ChTourDeskSearch = { tab: 'overview', round: 'all', view: 'team', holes: 'to-par' };
    const { container } = render(<EventDesk data={{ ...desk, event: stale(desk.event, true) }} search={search} load="ready" phone={false} />);
    const meta = container.querySelector('.ch-tour-desk-meta') as HTMLElement;
    expect(meta.textContent).toContain('Needs closing');
    expect(meta.textContent).not.toMatch(/\bLive\b/);
    expect(screen.getAllByRole('link', { name: /Finish round 1/ })[0]!.getAttribute('href')).toBe(`/golf/dashboard/tournaments/${desk.event.id}/live?round=1`);
  });
});
