import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Team Hub, the Nov 15 gap pass (GAP-H-02, -03, -04, -13, -14, -15, -16, -20, -25; GAP-S-26 is in hub.test.tsx): what each fix does, on the
 * preview fixtures and through the loader.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const actions = vi.hoisted(() => ({ summary: vi.fn(), playerAnns: vi.fn(), docs: vi.fn(), notifs: vi.fn() }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: actions.summary }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: actions.playerAnns }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: actions.notifs, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn(), createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: actions.docs, createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ respondToEvent: vi.fn(), updateGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: vi.fn(), getTravelerClassConflicts: vi.fn(), updateGolfTravelItinerary: vi.fn(), deleteGolfTravelItinerary: vi.fn() }));

import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../preview/fixtures-hub';
import { formatters, loadTeamHub, weekOf, type ChHubTrip, type ChTeamHub } from '../data/hub';
import { ToastProvider } from '../ui/Toast';
import { TeamHub, type ChHubTab } from '../screens/hub/TeamHub';
import type { ChHubWrites } from '../screens/hub/writes';
import './dialog-polyfill';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

function show(data: ChTeamHub, opts: { tab?: ChHubTab; focusTask?: string; focusTrip?: string } = {}) {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamHub data={data} writes={writes()} initialTab={opts.tab} focusTask={opts.focusTask} focusTrip={opts.focusTrip} viewerName="Maya Reyes" />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return { user };
}

const [CFI, SEA] = PREVIEW_HUB_PLAYER.trips.rows as [ChHubTrip, ChHubTrip];

describe('GAP-H-03 · one failed read of the player’s summary fails only its own sections', () => {
  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  const summary = (failed: { events: boolean; travel: boolean; tasks: boolean }) => ({
    failed,
    events: failed.events ? [] : [{ id: 'e1', event_id: 'e1', title: 'Team dinner', event_type: 'team_event', start_time: soon, end_time: null, location: null, is_mandatory: false, rsvp_status: 'pending', going_count: 0, maybe_count: 0 }],
    trips: [],
    tasks: failed.tasks ? [] : [{ id: 'k1', title: 'Sign travel waiver', description: null, due_date: null, category: null, requires_upload: false, status: 'pending', completed_at: null }],
    announcements: [],
    announcementsLoadError: false,
  });
  const load = async (failed: { events: boolean; travel: boolean; tasks: boolean }) => {
    actions.docs.mockResolvedValue({ data: [], error: null });
    actions.notifs.mockResolvedValue({ success: true, data: { items: [] } });
    tables.current = { golf_teams: { data: { name: 'Varsity' } }, golf_team_members: { data: [] }, golf_events: { data: [] } };
    actions.summary.mockResolvedValue(summary(failed));
    return loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
  };

  it('a failed travel read fails the trips, and the replies, the week and the tasks stand', async () => {
    const data = await load({ events: false, travel: true, tasks: false });
    expect(data.trips.error).toBe(true);
    expect(data.rsvps).toMatchObject({ error: false, rows: [{ eventId: 'e1', title: 'Team dinner' }] });
    expect(data.week.error).toBe(false);
    expect(data.tasks).toMatchObject({ error: false, rows: [{ id: 'k1' }] });
  });

  it('a failed tasks read fails the tasks alone', async () => {
    const data = await load({ events: false, travel: false, tasks: true });
    expect(data.tasks.error).toBe(true);
    expect([data.rsvps.error, data.trips.error, data.week.error]).toEqual([false, false, false]);
  });

  it('a failed events read fails the replies and the week, and the tasks and trips stand', async () => {
    const data = await load({ events: true, travel: false, tasks: false });
    expect([data.rsvps.error, data.week.error]).toEqual([true, true]);
    expect([data.tasks.error, data.trips.error]).toEqual([false, false]);
  });

  it('a summary that could not run at all still fails every section it feeds', async () => {
    actions.docs.mockResolvedValue({ data: [], error: null });
    actions.notifs.mockResolvedValue({ success: true, data: { items: [] } });
    actions.playerAnns.mockResolvedValue({ success: true, data: [] });
    tables.current = { golf_teams: { data: { name: 'Varsity' } }, golf_team_members: { data: [] } };
    actions.summary.mockRejectedValue(new Error('Unauthorized'));
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect([data.rsvps.error, data.trips.error, data.week.error, data.tasks.error]).toEqual([true, true, true, true]);
  });
});

describe('GAP-H-02 · the player’s hero is their own trip', () => {
  it('the week marks a day on the road only for a trip that may be the player’s', () => {
    const f = formatters('America/New_York', new Date('2026-11-02T15:00:00Z'));
    const day = (trips: ChHubTrip[]) => weekOf('2026-11-03', f, [], trips)[0]!.trip;
    const on = { ...CFI, departDate: '2026-11-03', returnDate: '2026-11-05' };
    expect(day([{ ...on, mine: false }])).toBeNull();
    expect(day([{ ...on, mine: true }])).toBe(CFI.name);
    expect(day([{ ...on, mine: null }])).toBe(CFI.name);
  });

  it('counts down to the player’s own trip, never to a team trip they aren’t on', () => {
    show(PREVIEW_HUB_PLAYER);
    const trip = screen.getByRole('region', { name: 'Next trip' });
    expect(within(trip).getByText(CFI.name)).toBeTruthy();
    expect(within(trip).getByText('You’re traveling')).toBeTruthy();
    // The team's other trip (the player is not on it) is not a page of the hero.
    expect(within(trip).queryByRole('button', { name: 'Next trip' })).toBeNull();
    expect(within(trip).queryByText(SEA.name)).toBeNull();
  });

  it('with no trip of their own, the team’s trip is one plain line under the week’s next event, with no countdown', () => {
    show({ ...PREVIEW_HUB_PLAYER, trips: { rows: [SEA], error: false } });
    expect(screen.queryByRole('region', { name: 'Next trip' })).toBeNull();
    const next = screen.getByRole('region', { name: 'Next up' });
    expect(within(next).getByText('Short-game block')).toBeTruthy();
    expect(within(next).queryByText('31')).toBeNull();
    expect(next.querySelector('.ch-hw-you')!.textContent).toBe('Team away · Seahawk Intercollegiate · Fri 14 – Sun 16 Nov');
  });

  it('GAP-H-25 with no trips at all a player is told about team travel, and a coach still about planning', () => {
    show({ ...PREVIEW_HUB_PLAYER, trips: { rows: [], error: false } });
    expect(screen.getByRole('region', { name: 'Next up' }).querySelector('.ch-hw-you')!.textContent).toBe('No team travel coming up');
    cleanup();
    show({ ...PREVIEW_HUB_COACH, trips: { rows: [], error: false } });
    expect(screen.getByRole('region', { name: 'Next up' }).querySelector('.ch-hw-you')!.textContent).toBe('No trips planned');
  });
});

describe('GAP-H-20 · a page of the trip pager is said once', () => {
  it('the counter is not a live region; one polite line names the trip after a turn', async () => {
    const { user } = show(PREVIEW_HUB_COACH);
    const trip = screen.getByRole('region', { name: 'Next trip' });
    const counter = within(trip).getByText('1 of 2');
    expect(counter.getAttribute('aria-live')).toBeNull();
    const live = trip.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]!.textContent).toBe('');
    await user.click(within(trip).getByRole('button', { name: 'Next trip' }));
    const later = screen.getByRole('region', { name: 'Later trip' });
    expect(later.querySelector('[aria-live]')!.textContent).toBe('Trip 2 of 2: Seahawk Intercollegiate, Fri 14 – Sun 16 Nov');
  });
});

describe('GAP-H-04 · one place to reply, and no stack of filled keys', () => {
  it('a pending event offers its replies once on Home, in the queue; the week shows the state', async () => {
    const { user } = show(PREVIEW_HUB_PLAYER);
    const week = screen.getByRole('region', { name: 'Next 7 days' });
    await user.click(within(week).getByRole('button', { name: /^Thu 16: / }));
    expect(screen.getAllByRole('radiogroup', { name: 'Your reply for Team dinner' })).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Your queue' })).getByRole('radiogroup', { name: 'Your reply for Team dinner' })).toBeTruthy();
    expect(within(week).queryAllByRole('radiogroup')).toHaveLength(0);
    // An answer given before this visit reads as its state on the week.
    await user.click(within(week).getByRole('button', { name: /^Wed 15: / }));
    expect(within(week).getByRole('link', { name: /Course prep/ }).closest('li')!.textContent).toContain('Your reply: Going');
  });

  it('Got it is a secondary key, so Home holds at most one filled primary', () => {
    show(PREVIEW_HUB_PLAYER);
    const got = screen.getByRole('button', { name: 'Got it' });
    expect(got.className).toContain('ch-btn--secondary');
    expect(document.querySelectorAll('.ch-btn--primary').length).toBeLessThanOrEqual(1);
  });
});

describe('GAP-H-13 · "replies due" goes to the replies', () => {
  it('on Home it moves focus to the queue', async () => {
    const { user } = show(PREVIEW_HUB_PLAYER);
    await user.click(within(screen.getByRole('list', { name: 'Team at a glance' })).getByRole('button', { name: '2 replies due' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('ch-hw-queue'));
  });

  it('from another tab it opens Home and then moves focus to the queue', async () => {
    const { user } = show(PREVIEW_HUB_PLAYER, { tab: 'tasks' });
    await user.click(within(screen.getByRole('list', { name: 'Team at a glance' })).getByRole('button', { name: '2 replies due' }));
    expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe('ch-hw-queue'));
  });

  it('a coach’s goes to the week, where the replies are', async () => {
    const { user } = show(PREVIEW_HUB_COACH);
    await user.click(within(screen.getByRole('list', { name: 'Team at a glance' })).getByRole('button', { name: '3 replies due' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('ch-hw-week'));
  });
});

describe('GAP-H-14 · the Files tile lists the newest files across every folder', () => {
  it('newest first, whatever folder they are in', () => {
    show(PREVIEW_HUB_PLAYER);
    const files = screen.getByRole('region', { name: 'Files' });
    expect([...files.querySelectorAll('.ch-hw-files b')].map((b) => b.textContent)).toEqual(['Pairings and tee times', 'NCAA hours log', 'Hotel confirmation', 'Travel waiver']);
  });
});

describe('GAP-H-15 · a folder with a space in its name keeps its accessible name', () => {
  it('the section is named by its heading', () => {
    show({ ...PREVIEW_HUB_PLAYER, documents: { error: false, folders: [{ name: 'Travel forms', files: [{ id: 'x1', title: 'Waiver', type: 'PDF', size: null, date: null, isPublic: true }] }] } }, { tab: 'docs' });
    expect(screen.getByRole('region', { name: 'Travel forms' })).toBeTruthy();
  });
});

describe('GAP-H-16 · a player’s finished tasks are in a collapsed Done section', () => {
  it('open tasks first; Done (N) opens the finished ones', async () => {
    const { user } = show(PREVIEW_HUB_PLAYER, { tab: 'tasks' });
    const done = screen.getByRole('button', { name: 'Done (1)' });
    expect(done.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Upload class schedule')).toBeNull();
    expect(screen.getByText('Submit eligibility form')).toBeTruthy();
    await user.click(done);
    expect(done.getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('group', { name: 'Done' })).getByText('Upload class schedule')).toBeTruthy();
  });

  it('a link to a finished task opens the section', () => {
    show(PREVIEW_HUB_PLAYER, { focusTask: 't3' });
    expect(screen.getByRole('button', { name: 'Done (1)' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Upload class schedule')).toBeTruthy();
  });

  it('a coach’s list is unchanged: no Done section', () => {
    show(PREVIEW_HUB_COACH, { tab: 'tasks' });
    expect(screen.queryByRole('button', { name: /^Done \(/ })).toBeNull();
  });
});
