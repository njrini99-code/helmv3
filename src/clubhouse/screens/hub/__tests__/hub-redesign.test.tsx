import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Team Hub's summary surfaces (the strip, Home's band, the coach's task board) and the player's Tasks tab, on the preview
 * fixtures. The rules behind them are pinned in hub-summary.test.ts; this is what the page does with them.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({ createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ respondToEvent: vi.fn(), updateGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: vi.fn(), getTravelerClassConflicts: vi.fn(), updateGolfTravelItinerary: vi.fn(), deleteGolfTravelItinerary: vi.fn() }));

import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../../../preview/fixtures-hub';
import type { ChTeamHub } from '../../../data/hub';
import { ToastProvider } from '../../../ui/Toast';
import { TeamHub, type ChHubTab } from '../TeamHub';
import type { ChHubWrites } from '../writes';
import '../../../__tests__/dialog-polyfill';

const ok = () => Promise.resolve({ success: true });
const writes = (): ChHubWrites =>
  ({
    reply: vi.fn(ok),
    acknowledge: vi.fn(ok),
    completeTask: vi.fn(ok),
    uncompleteTask: vi.fn(ok),
    setTravelers: vi.fn(ok),
    travelerClasses: vi.fn(() => Promise.resolve({ success: true, data: { classes: [], partial: false } })),
    openDocument: vi.fn(ok),
    postAnnouncement: vi.fn(ok),
    editAnnouncement: vi.fn(ok),
    deleteAnnouncement: vi.fn(ok),
    assignTask: vi.fn(ok),
    deleteTask: vi.fn(ok),
    planTrip: vi.fn(ok),
    editTrip: vi.fn(ok),
    deleteTrip: vi.fn(ok),
    uploadDocument: vi.fn(ok),
    deleteDocument: vi.fn(ok),
  }) as ChHubWrites;

function show(data: ChTeamHub, tab: ChHubTab = 'home', w = writes()) {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamHub data={data} writes={w} initialTab={tab} viewerName="Maya Reyes" />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return { user, w };
}

const stripText = () => [...document.querySelectorAll('.ch-hb-strip li')].map((li) => li.textContent);

describe('100101 Team Hub · the strip under the title', () => {
  it('a coach’s line says what the team is waiting on, and a figure opens the tab it counts', async () => {
    const { user } = show(PREVIEW_HUB_COACH);
    expect(stripText()).toEqual(['6 players', '3 replies due this week', '1 post awaiting acknowledgement', 'next trip in 20 days', '3 tasks open, 1 overdue']);
    await user.click(within(screen.getByRole('list', { name: 'Team at a glance' })).getByRole('button', { name: /3 tasks open/ }));
    expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Task progress' })).toBeTruthy();
  });

  it('a player’s line is theirs: replies owed, posts to acknowledge, tasks open', () => {
    show(PREVIEW_HUB_PLAYER);
    expect(stripText()).toEqual(['2 replies due', '1 post to acknowledge', 'traveling in 20 days', '3 tasks open, 1 overdue']);
  });

  it('a read that failed leaves its figure out instead of saying zero', () => {
    show({ ...PREVIEW_HUB_COACH, tasks: { rows: [], error: true }, announcements: { rows: [], error: true }, trips: { rows: [], error: true }, rsvps: { rows: [], error: true } });
    expect(stripText()).toEqual(['6 players']);
  });

  it('the tab figures are drawn on the tabs and left to the strip for a screen reader', () => {
    show(PREVIEW_HUB_COACH);
    const tab = screen.getByRole('tab', { name: 'Tasks' });
    expect(tab.textContent).toBe('Tasks1');
    expect(tab.querySelector('.ch-hb-tabs__n')?.getAttribute('aria-hidden')).toBe('true');
    expect(tab.querySelector('.ch-hb-tabs__n')?.className).toContain('is-warn');
  });
});

describe('100101 Team Hub · Home’s band', () => {
  it('leads with the next event and, for a coach, who has replied', () => {
    show(PREVIEW_HUB_COACH);
    const band = screen.getByRole('region', { name: 'Course prep · 9 holes' });
    expect(band.getAttribute('data-band')).toBe('event');
    expect(within(band).getByText('4')).toBeTruthy();
    expect(band.querySelector('.is-warn dd')?.textContent).toBe('1');
    expect(within(band).getByRole('link', { name: 'Open event' }).getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-15&event=r1');
  });

  it('a trip leaving within two days takes the band, and the trip is not said a second time below it', () => {
    const [first, ...rest] = PREVIEW_HUB_COACH.trips.rows;
    show({ ...PREVIEW_HUB_COACH, trips: { rows: [{ ...first!, inDays: 1 }, ...rest], error: false } });
    const band = screen.getByRole('region', { name: 'Carolina Fall Invitational' });
    expect(band.getAttribute('data-band')).toBe('trip-soon');
    expect(within(band).getByRole('button', { name: 'Edit trip' })).toBeTruthy();
    expect(document.querySelector('.ch-hb-home .ch-hb-pass')).toBeNull();
  });

  it('a player who owes a reply is sent to the soonest one that needs it', () => {
    show(PREVIEW_HUB_PLAYER);
    // Course prep is answered; Team dinner is the first still owed.
    const band = screen.getByRole('region', { name: 'Team dinner' });
    expect(band.getAttribute('data-band')).toBe('event');
    expect(within(band).getByRole('button', { name: 'Reply below' })).toBeTruthy();
  });

  it('is withheld while a read it leans on is down, so a failure is never a quiet calendar', () => {
    show({ ...PREVIEW_HUB_COACH, rsvps: { rows: [], error: true } });
    expect(document.querySelector('.ch-hb-band')).toBeNull();
  });

  it('says so when there is nothing to lead with', () => {
    show({ ...PREVIEW_HUB_COACH, rsvps: { rows: [], error: false }, trips: { rows: [], error: false } });
    const band = document.querySelector('.ch-hb-band')!;
    expect(band.getAttribute('data-band')).toBe('none');
    expect(within(band as HTMLElement).getByRole('link', { name: 'Create event' })).toBeTruthy();
  });
});

describe('100101 100102 Team Hub · Tasks (a player has the tab; the coach’s board)', () => {
  it('the coach’s board totals completions across the team and names what no one has done', () => {
    show(PREVIEW_HUB_COACH, 'tasks');
    const board = screen.getByRole('region', { name: 'Task progress' });
    expect([...board.querySelectorAll('.ch-hb-board__f > div')].map((d) => `${d.querySelector('dt')?.textContent} ${d.querySelector('dd')?.textContent}`)).toEqual(['done 13', 'left 10', 'overdue 1']);
    expect(within(board).getByText('1 overdue task has no one done yet.')).toBeTruthy();
    expect(board.querySelector('.is-warn')).not.toBeNull();
  });

  it('each task shows its completion as a figure with a track, not a ring', () => {
    show(PREVIEW_HUB_COACH, 'tasks');
    expect(document.querySelector('.ch-hb-ring')).toBeNull();
    const first = document.querySelector('.ch-hb-task.is-coach .ch-hb-prog')!;
    expect(first.getAttribute('aria-label')).toBe('0 of 6 done');
    expect(first.querySelector('b')?.textContent).toBe('0/6');
  });

  it('overdue says so in amber text, never red', () => {
    show(PREVIEW_HUB_COACH, 'tasks');
    expect(screen.getByText('Overdue · Oct 10').className).toContain('is-soon');
  });

  it('a player has a Tasks tab with their own list, and ticking a task writes it', async () => {
    const { user, w } = show(PREVIEW_HUB_PLAYER, 'home');
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeTruthy();
    // A player gets no team board and no delete.
    expect(screen.queryByRole('region', { name: 'Task progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More for/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Submit eligibility form' }));
    expect(w.completeTask).toHaveBeenCalledWith('t4');
  });

  it('a notification that names a task opens a player on the Tasks tab', () => {
    show(PREVIEW_HUB_PLAYER, 'tasks');
    expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign travel waiver' })).toBeTruthy();
  });
});

describe('Team Hub · Travel', () => {
  it('the next trip’s pass counts the days to go, and only that pass', () => {
    show(PREVIEW_HUB_COACH, 'travel');
    const counts = [...document.querySelectorAll('.ch-hb-pass__count')];
    expect(counts.map((c) => c.textContent)).toEqual(['20 days to go']);
    expect(counts[0]!.closest('.ch-hb-pass')?.className).toContain('is-next');
  });

  it('says leaves tomorrow or today rather than a figure of one or none', () => {
    const [first, ...rest] = PREVIEW_HUB_COACH.trips.rows;
    show({ ...PREVIEW_HUB_COACH, trips: { rows: [{ ...first!, inDays: 1 }, ...rest], error: false } }, 'travel');
    expect(document.querySelector('.ch-hb-pass__count')?.textContent).toBe('Leaves tomorrow');
  });
});
