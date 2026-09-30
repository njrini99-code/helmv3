import { LazyMotion, domAnimation } from 'framer-motion';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Team Hub: every numbered state in docs/clubhouse/catalog/hub.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const actions = vi.hoisted(() => ({
  summary: vi.fn(),
  playerAnns: vi.fn(),
  coachAnns: vi.fn(),
  docs: vi.fn(),
  notifs: vi.fn(),
}));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: actions.summary }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: actions.playerAnns }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: actions.coachAnns, createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: actions.docs, createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: actions.notifs, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/golf', () => ({ respondToEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import { folders, formatters, loadTeamHub, type ChTeamHub } from '../data/hub';
import { ClubhouseHubRoute } from '../routes/hub';
import { parseHubTab, TeamHub, type ChHubTab } from '../screens/hub/TeamHub';
import type { ChHubWrites } from '../screens/hub/writes';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_COACH_EMPTY, PREVIEW_HUB_COACH_FAILED, PREVIEW_HUB_PLAYER, PREVIEW_HUB_PLAYER_EMPTY, PREVIEW_HUB_PLAYER_FAILED } from '../preview/fixtures-hub';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const ok = () => Promise.resolve({ success: true });
function writes(over: Partial<ChHubWrites> = {}): ChHubWrites {
  return {
    reply: vi.fn(ok),
    acknowledge: vi.fn(ok),
    completeTask: vi.fn(ok),
    openDocument: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://files.example/d1' } })),
    postAnnouncement: vi.fn(() => Promise.resolve({ success: true, data: { announcementId: 'n' } })),
    deleteAnnouncement: vi.fn(ok),
    assignTask: vi.fn(ok),
    deleteTask: vi.fn(ok),
    planTrip: vi.fn(ok),
    uploadDocument: vi.fn(ok),
    deleteDocument: vi.fn(ok),
    ...over,
  };
}
const refuse = () => vi.fn(() => Promise.resolve({ success: false, error: 'refused' }));
function show(data: ChTeamHub, w: ChHubWrites = writes(), tab?: ChHubTab) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamHub data={data} writes={w} initialTab={tab} viewerName="Maya Reyes" />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return w;
}
const tab = (name: string) => userEvent.setup().click(screen.getByRole('tab', { name }));

beforeEach(() => {
  hapticSpy.mockClear();
  logServer.mockClear();
  router.refresh.mockClear();
  tables.current = {};
  for (const f of Object.values(actions)) f.mockReset();
});

describe('Team Hub · player', () => {
  it('Home: RSVPs, the post waiting on them, the next trip, updates and tasks', () => {
    show(PREVIEW_HUB_PLAYER);
    expect(screen.getByRole('heading', { level: 1, name: 'Team Hub' })).toBeTruthy();
    expect(screen.getByText('Player view')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Home', 'Announcements', 'Travel', 'Documents']);
    expect(screen.getByText('2 need a reply')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Going', checked: true })).toBeTruthy();
    expect(screen.getByText('Needs your reply')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Pairings and tee times for Thursday' })).toBeTruthy();
    expect(screen.getByText('Traveling')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your tasks' })).toBeTruthy();
    expect(screen.getByText('2 open')).toBeTruthy();
  });

  it('a reply is optimistic and ticks; CH-10001 a refused reply puts it back', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER, writes({ reply: refuse() }));
    const group = screen.getByRole('radiogroup', { name: 'Your reply for Team dinner' });
    await user.click(within(group).getByRole('radio', { name: 'Going' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(w.reply).toHaveBeenCalledWith('r2', 'accepted');
    await expectCode('CH-10001', /Couldn't send your reply for Team dinner/);
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('false'));
  });

  it('Got it acknowledges; CH-10002 a refusal brings the button back', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER, writes({ acknowledge: refuse() }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(w.acknowledge).toHaveBeenCalledWith('a1');
    await expectCode('CH-10002', /Couldn't acknowledge/);
    expect(await screen.findByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('checking off a task is optimistic; CH-10003 a refusal unchecks it', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_PLAYER, writes({ completeTask: refuse() }));
    const box = screen.getByRole('button', { name: 'Sign travel waiver' });
    await user.click(box);
    await expectCode('CH-10003', /Couldn't mark Sign travel waiver done/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign travel waiver' }).getAttribute('aria-pressed')).toBe('false'));
  });

  it('a file opens its signed link in a new tab; CH-10004 one that fails says so and closes the tab', async () => {
    const user = userEvent.setup();
    const win = { location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    show(PREVIEW_HUB_PLAYER, writes(), 'docs');
    await user.click(screen.getByRole('button', { name: 'Open Pairings and tee times, PDF' }));
    await waitFor(() => expect(win.location.href).toBe('https://files.example/d1'));
    openSpy.mockRestore();
  });

  it('CH-10004 a file that won’t open', async () => {
    const user = userEvent.setup();
    const win = { location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    show(PREVIEW_HUB_PLAYER, writes({ openDocument: refuse() }), 'docs');
    await user.click(screen.getByRole('button', { name: 'Open Travel waiver, PDF' }));
    await expectCode('CH-10004', /Couldn't open Travel waiver/);
    expect(win.close).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('a player never sees coach controls', async () => {
    show(PREVIEW_HUB_PLAYER);
    expect(screen.queryByRole('button', { name: 'New announcement' })).toBeNull();
    await tab('Documents');
    expect(screen.queryByText('Drop files to share with the team')).toBeNull();
    expect(screen.queryByRole('button', { name: /More for/ })).toBeNull();
  });

  it('CH-10201 CH-10202 CH-10203 CH-10204 CH-10206 CH-10207 every failed read says so, never an empty panel', async () => {
    show(PREVIEW_HUB_PLAYER_FAILED);
    for (const c of ['CH-10201', 'CH-10202', 'CH-10203', 'CH-10206', 'CH-10207']) expect(code(c)).not.toBeNull();
    expect(code('CH-10301')).toBeNull();
    expect(code('CH-10306')).toBeNull();
    await tab('Documents');
    expect(code('CH-10204')).not.toBeNull();
  });

  it('CH-10306 CH-10301 a player with nothing yet', () => {
    show(PREVIEW_HUB_PLAYER_EMPTY);
    expect(code('CH-10306')!.textContent).toMatch(/No team updates yet/);
    show({ ...PREVIEW_HUB_PLAYER, rsvps: { rows: [], error: false } });
    expect(code('CH-10301')!.textContent).toMatch(/You’re all caught up/);
  });

  it('CH-10302 CH-10303 CH-10304 CH-10307 CH-10308 each empty tab says what fills it', async () => {
    const d = { ...PREVIEW_HUB_PLAYER_EMPTY, rsvps: PREVIEW_HUB_PLAYER.rsvps };
    show(d);
    expect(code('CH-10302')).not.toBeNull();
    expect(code('CH-10303')).not.toBeNull();
    await tab('Announcements');
    expect(code('CH-10307')).not.toBeNull();
    await tab('Travel');
    expect(code('CH-10308')).not.toBeNull();
    await tab('Documents');
    expect(code('CH-10304')).not.toBeNull();
  });

  it('CH-10205 a section that crashes stays inside its section', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    show({ ...PREVIEW_HUB_PLAYER, updates: { rows: null as never, error: false } });
    expect(code('CH-10205')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Your RSVPs' })).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Team Hub · coach', () => {
  it('Home: replies as counts, read receipts, travelers; the Tasks tab', async () => {
    show(PREVIEW_HUB_COACH);
    expect(screen.getByText('Coach view')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Home', 'Announcements', 'Travel', 'Documents', 'Tasks']);
    expect(screen.getByText('4 going · 1 maybe · 0 can’t · 1 no reply')).toBeTruthy();
    expect(screen.getByText('5 of 6 acknowledged')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    await tab('Tasks');
    expect(screen.getByLabelText('3 of 5 done')).toBeTruthy();
  });

  it('CH-10101 CH-10102 CH-10402 posting: a headline, an audience; the post keeps its text when it fails (CH-10005)', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const post = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ postAnnouncement: post }));
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10101', /at least three characters/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.click(within(dialog).getByRole('radio', { name: 'Choose players' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10102', /Choose at least one player/);
    await user.click(within(dialog).getByRole('button', { name: 'Eli Brandt' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10402', /Posting/);
    expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: '', requiresAck: true, playerIds: ['eli'] });
    release({ success: false });
    await expectCode('CH-10005', /Couldn’t post the announcement/);
    expect((within(dialog).getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe('Bus leaves at 6');
  });

  it('a post that lands closes the sheet and refreshes the page', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH);
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('CH-10103 CH-10104 CH-10105 CH-10106 CH-10403 CH-10006 planning a trip checks the name, place and dates; a failed save keeps them', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const plan = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ planTrip: plan }), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plan a trip' });
    await user.click(within(dialog).getByRole('button', { name: 'Save trip' }));
    await expectCode('CH-10103');
    await expectCode('CH-10104');
    await expectCode('CH-10105');
    await user.type(within(dialog).getByRole('textbox', { name: 'Trip' }), 'Seahawk');
    await user.type(within(dialog).getByRole('textbox', { name: 'Where' }), 'Wilmington');
    fireEvent.change(within(dialog).getByLabelText('Leaves'), { target: { value: '2026-11-14' } });
    fireEvent.change(within(dialog).getByLabelText('Back'), { target: { value: '2026-11-12' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save trip' }));
    await expectCode('CH-10106', /can’t be before the departure/);
    fireEvent.change(within(dialog).getByLabelText('Back'), { target: { value: '2026-11-16' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save trip' }));
    await expectCode('CH-10403', /Saving/);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ name: 'Seahawk', destination: 'Wilmington', departDate: '2026-11-14', returnDate: '2026-11-16', transport: 'bus', teamId: 't1' }));
    release({ success: false });
    await expectCode('CH-10006', /Couldn’t save Seahawk/);
    expect((within(dialog).getByRole('textbox', { name: 'Trip' }) as HTMLInputElement).value).toBe('Seahawk');
  });

  it('CH-10107 CH-10108 CH-10404 CH-10007 assigning a task: a name, at least one player; the whole team by default', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const assign = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ assignTask: assign }), 'tasks');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign a task' });
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await expectCode('CH-10107');
    await user.type(within(dialog).getByRole('textbox', { name: 'Task' }), 'Book physicals');
    for (const p of PREVIEW_HUB_COACH.players) await user.click(within(dialog).getByRole('button', { name: p.name }));
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await expectCode('CH-10108');
    await user.click(within(dialog).getByRole('button', { name: 'Ava Lindqvist' }));
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await expectCode('CH-10404', /Assigning/);
    expect(assign).toHaveBeenCalledWith({ teamId: 't1', title: 'Book physicals', detail: '', dueDate: null, playerIds: ['ava'] });
    release({ success: false });
    await expectCode('CH-10007', /Couldn’t assign Book physicals/);
  });

  it('CH-10401 CH-10008 uploading a file shows its progress; a failed upload says which file', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const up = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ uploadDocument: up }), 'docs');
    const input = document.querySelector('.ch-hb-docs input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'Local rules.pdf', { type: 'application/pdf' }));
    await expectCode('CH-10401', /Uploading/);
    expect(up).toHaveBeenCalledWith(expect.objectContaining({ teamId: 't1', folder: null }));
    release({ success: false });
    await expectCode('CH-10008', /Couldn’t upload Local rules\.pdf/);
  });

  it('CH-10501 CH-10502 CH-10503 CH-10009 deleting asks first with a warning; a refusal keeps the item', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_COACH, writes({ deleteDocument: refuse() }), 'ann');
    await user.click(screen.getAllByRole('button', { name: /More for Short-game block/ })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete announcement' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await expectCode('CH-10501', /acknowledgements go with it/);
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await tab('Tasks');
    await user.click(screen.getByRole('button', { name: 'More for Sign travel waiver' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete task' }));
    await expectCode('CH-10502', /every player’s list/);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(w.deleteTask).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(screen.queryByText('Sign travel waiver')).toBeNull());
    await tab('Documents');
    await user.click(screen.getByRole('button', { name: 'More for NCAA hours log' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete file' }));
    await expectCode('CH-10503', /can’t be undone/);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await expectCode('CH-10009', /Couldn’t delete NCAA hours log/);
    expect(screen.getByText('NCAA hours log')).toBeTruthy();
  });

  it('CH-10305 a coach with nothing posted: New announcement and Plan a trip', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH_EMPTY);
    expect(code('CH-10305')!.textContent).toMatch(/Nothing posted yet/);
    await user.click(within(code('CH-10305') as HTMLElement).getByRole('button', { name: 'Plan a trip' }));
    expect(await screen.findByRole('dialog', { name: 'Plan a trip' })).toBeTruthy();
  });

  it('CH-10201 the coach’s failed reads', () => {
    show(PREVIEW_HUB_COACH_FAILED);
    expect(code('CH-10201')!.textContent).toMatch(/This week's replies didn't load/);
  });

  it('CH-10309 no team: coach and player each get their own words', async () => {
    teamOf.current = null;
    session.current = { userId: 'u1', coach: { id: 'c1', full_name: 'Maya Reyes' }, player: null };
    render(await ClubhouseHubRoute({}));
    expect(code('CH-10309')!.textContent).toMatch(/Once your team is set up/);
    document.body.innerHTML = '';
    session.current = { userId: 'u2', coach: null, player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } };
    render(await ClubhouseHubRoute({}));
    expect(code('CH-10309')!.textContent).toMatch(/Ask your coach for your team's code/);
  });

  it('?tab= opens a tab the role has, else Home', () => {
    expect(parseHubTab('tasks', 'coach')).toBe('tasks');
    expect(parseHubTab('tasks', 'player')).toBe('home');
    expect(parseHubTab('nonsense', 'player')).toBe('home');
    expect(parseHubTab(undefined, 'coach')).toBe('home');
  });
});

describe('Team Hub · the loader', () => {
  const team = { data: { name: 'Varsity', season: 'Fall 2026' } };
  const base = () => {
    actions.docs.mockResolvedValue({ data: [], error: null });
    actions.notifs.mockResolvedValue({ success: true, data: { items: [] } });
  };

  it('a player: their own summary; a failed summary marks RSVPs, trips and tasks failed, never empty', async () => {
    base();
    tables.current = { golf_teams: team, golf_team_members: { data: [] } };
    actions.summary.mockRejectedValue(new Error('events read failed'));
    actions.playerAnns.mockResolvedValue({ success: true, data: [] });
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(actions.summary).toHaveBeenCalledWith('t1', 'p1');
    expect(data.rsvps.error && data.trips.error && data.tasks.error).toBe(true);
    expect(data.announcements.error).toBe(false);
    expect(data.players).toEqual([]);
    expect(logServer).toHaveBeenCalledWith('hub', 'playerSummary', expect.anything());
  });

  it('a coach: reply counts, travelers from the trip’s event, task completion', async () => {
    base();
    actions.coachAnns.mockResolvedValue({ success: true, data: [] });
    const soon = new Date(Date.now() + 2 * 86400000).toISOString();
    const inAWeek = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Eli', last_name: 'Brandt' } }, { player: { id: 'p2', first_name: 'Ava', last_name: 'Lindqvist' } }] },
      golf_events: { data: [{ id: 'e1', title: 'Team dinner', event_type: 'meeting', start_time: soon, location: 'Carolina Inn' }] },
      golf_travel_itineraries: { data: [{ id: 'tr1', event_id: 'e2', event_name: 'Seahawk', destination: 'Wilmington', departure_date: inAWeek, return_date: inAWeek, transportation_type: 'bus' }] },
      golf_event_attendance: {
        data: [
          { event_id: 'e1', player_id: 'p1', status: 'accepted' },
          { event_id: 'e1', player_id: 'p2', status: 'pending' },
          { event_id: 'e2', player_id: 'p2', status: 'accepted' },
        ],
      },
      golf_tasks: { data: [{ id: 'k1', title: 'Waiver', description: null, due_date: null, category: null, status: 'pending' }] },
      golf_task_assignments: { data: [{ task_id: 'k1', status: 'completed' }, { task_id: 'k1', status: 'pending' }] },
    };
    const data = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    expect(data.rsvps.rows[0]!.counts).toEqual({ going: 1, maybe: 0, no: 0, none: 1 });
    expect(data.trips.rows[0]!.travelers).toEqual(['Ava Lindqvist']);
    expect(data.trips.rows[0]!.upcoming).toBe(true);
    expect(data.tasks.rows[0]!.done).toEqual([1, 2]);
    expect(data.players.map((p) => p.name)).toEqual(['Ava Lindqvist', 'Eli Brandt']);
  });

  it('files group into folders ("Team" for none), newest first, with a type and a size', () => {
    const f = formatters('America/New_York', new Date('2026-10-14T18:00:00Z'));
    const out = folders(
      [
        { id: 'a', title: 'Old', folder: null, file_type: 'pdf', file_url: 'x/a.pdf', file_size: 2048, updated_at: '2026-08-01T12:00:00Z', created_at: null },
        { id: 'b', title: 'New', folder: '', file_type: null, file_url: 'x/b.xlsx?sig=1', file_size: 3 * 1024 * 1024, updated_at: '2026-10-10T12:00:00Z', created_at: null },
        { id: 'c', title: 'Waiver', folder: 'Trips', file_type: 'application/msword', file_url: 'x/c', file_size: null, updated_at: null, created_at: '2026-10-01T12:00:00Z' },
      ],
      f,
    );
    expect(out.map((x) => x.name)).toEqual(['Team', 'Trips']);
    expect(out[0]!.files.map((x) => [x.title, x.type, x.size])).toEqual([
      ['New', 'XLS', '3.0 MB'],
      ['Old', 'PDF', '2 KB'],
    ]);
  });

  it('labels in the team’s timezone: today, yesterday, a weekday, a date', () => {
    const f = formatters('America/New_York', new Date('2026-10-14T18:00:00Z'));
    expect(f.ago('2026-10-14T13:05:00Z')).toBe('Today 9:05 AM');
    expect(f.ago('2026-10-13T13:05:00Z')).toBe('Yesterday');
    expect(f.due('2026-10-15', '2026-10-14')).toBe('Tomorrow');
    expect(f.range('2026-11-03', '2026-11-05')).toBe('Tue 3 – Thu 5 Nov');
    expect(f.clock('15:30:00')).toBe('3:30 PM');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
