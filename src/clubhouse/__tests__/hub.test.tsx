import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/** Team Hub: every numbered state in docs/clubhouse/catalog/hub.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const track = vi.hoisted(() => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track', () => track);
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
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: actions.coachAnns, createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: actions.docs, createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: actions.notifs, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/golf', () => ({ respondToEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import Loading from '@/app/golf/(dashboard)/dashboard/team-hub/loading';
import { folders, formatters, loadTeamHub, replyIsClosed, type ChTeamHub } from '../data/hub';
import { ClubhouseHubRoute } from '../routes/hub';
import { HubSkeleton } from '../screens/hub/HubSkeleton';
import { parseHubTab, TeamHub, type ChHubTab } from '../screens/hub/TeamHub';
import { createEnrichedAnnouncement, updateAnnouncement } from '@/app/golf/actions/announcements';
import { LIVE_HUB_WRITES, type ChHubWrites } from '../screens/hub/writes';
import { ClubhouseMarker } from '../shell/context';
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
    setTravelers: vi.fn(ok),
    uncompleteTask: vi.fn(ok),
    openDocument: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://files.example/d1' } })),
    postAnnouncement: vi.fn(() => Promise.resolve({ success: true, data: { announcementId: 'n' } })),
    editAnnouncement: vi.fn(ok),
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
const dialogOpen = () => document.querySelector('dialog[open]') !== null;

beforeEach(() => {
  hapticSpy.mockClear();
  track.chReport.mockClear();
  track.chTrail.mockClear();
  logServer.mockClear();
  router.refresh.mockClear();
  tables.current = {};
  for (const f of Object.values(actions)) f.mockReset();
});

describe('Team Hub · player', () => {
  it('100101 Home: RSVPs, the post waiting on them, the next trip, updates and tasks', () => {
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

  it('101301 a reply is optimistic and ticks; CH-10001 a refused reply puts it back', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER, writes({ reply: refuse() }));
    const group = screen.getByRole('radiogroup', { name: 'Your reply for Team dinner' });
    await user.click(within(group).getByRole('radio', { name: 'Going' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(w.reply).toHaveBeenCalledWith('r2', 'accepted');
    await expectCode('CH-10001', /Couldn't send your reply for Team dinner/);
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('false'));
  });

  it('101301 Got it acknowledges; CH-10002 a refusal brings the button back', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER, writes({ acknowledge: refuse() }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(w.acknowledge).toHaveBeenCalledWith('a1');
    await expectCode('CH-10002', /Couldn't acknowledge/);
    expect(await screen.findByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('101301 checking off a task is optimistic; CH-10003 a refusal unchecks it', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_PLAYER, writes({ completeTask: refuse() }));
    const box = screen.getByRole('button', { name: 'Sign travel waiver' });
    await user.click(box);
    await expectCode('CH-10003', /Couldn't mark Sign travel waiver done/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign travel waiver' }).getAttribute('aria-pressed')).toBe('false'));
  });

  it('a tick on a done task opens it again (an accidental tick), with its own write; CH-10011 a refusal leaves it done', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER, writes());
    const box = () => screen.getByRole('button', { name: /^Sign travel waiver/ });
    await user.click(box());
    await waitFor(() => expect(box().getAttribute('aria-pressed')).toBe('true'));
    await user.click(box());
    await waitFor(() => expect(w.uncompleteTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(w.uncompleteTask).mock.calls[0]![0]).toBe(vi.mocked(w.completeTask).mock.calls[0]![0]);
    await waitFor(() => expect(box().getAttribute('aria-pressed')).toBe('false'));
    cleanup();
    const refused = show(PREVIEW_HUB_PLAYER, writes({ uncompleteTask: refuse() }));
    await user.click(box());
    await waitFor(() => expect(box().getAttribute('aria-pressed')).toBe('true'));
    await user.click(box());
    await expectCode('CH-10011', /Couldn't reopen Sign travel waiver/);
    await waitFor(() => expect(box().getAttribute('aria-pressed')).toBe('true'));
    expect(refused.completeTask).toHaveBeenCalledTimes(1);
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

  it('100801 a player never sees coach controls', async () => {
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

  it('CH-10205 102301 a section that crashes stays inside its section, and is reported under its own surface', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    show({ ...PREVIEW_HUB_PLAYER, updates: { rows: null as never, error: false } });
    expect(code('CH-10205')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Your RSVPs' })).toBeTruthy();
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'hub.updates', severity: 'high' }));
    spy.mockRestore();
  });
});

describe('Team Hub · coach', () => {
  it('100101 Home: replies as counts, read receipts, travelers; the Tasks tab', async () => {
    show(PREVIEW_HUB_COACH);
    expect(screen.getByText('Coach view')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Home', 'Announcements', 'Travel', 'Documents', 'Tasks']);
    expect(screen.getByText('4 going · 1 maybe · 0 can’t · 1 no reply')).toBeTruthy();
    expect(screen.getByText('5 of 6 acknowledged')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    await tab('Tasks');
    expect(screen.getByLabelText('3 of 5 done')).toBeTruthy();
  });

  it('CH-10101 CH-10109 CH-10102 CH-10402 101201 posting: a headline, a message (the server requires one), an audience; the post keeps its text when it fails (CH-10005)', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const post = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ postAnnouncement: post }));
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10101', /at least three characters/);
    await expectCode('CH-10109', /Add a message/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    expect(post).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(within(dialog).getByRole('radio', { name: 'Choose players' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10102', /Choose at least one player/);
    await user.click(within(dialog).getByRole('button', { name: 'Eli Brandt' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await expectCode('CH-10402', /Posting/);
    expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: 'Details in the app.', requiresAck: true, playerIds: ['eli'], documentIds: [] });
    release({ success: false });
    await expectCode('CH-10005', /Couldn’t post the announcement/);
    expect((within(dialog).getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe('Bus leaves at 6');
  });

  it('CH-10208 a roster that didn’t load: the whole team still gets a post, choosing players says why it can’t, and Try again reads the page again', async () => {
    const user = userEvent.setup();
    const post = vi.fn(ok);
    show({ ...PREVIEW_HUB_COACH, players: [], playersError: true }, writes({ postAnnouncement: post }));
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    // No "Whole team · 0": the count is unknown, not zero.
    expect(within(dialog).getByRole('radio', { name: 'Whole team' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Choose players' }));
    await expectCode('CH-10208', /roster didn’t load/);
    expect(code('CH-10310')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
    await user.click(within(dialog).getByRole('radio', { name: 'Whole team' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: [] });
  });

  it('CH-10208 CH-10310 a task with no roster to choose from: never "For 0 of 0", and Assign stops with the reason, not "Choose at least one player"', async () => {
    const user = userEvent.setup();
    const assign = vi.fn(ok);
    show({ ...PREVIEW_HUB_COACH, players: [], playersError: true }, writes({ assignTask: assign }), 'tasks');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    let dialog = await screen.findByRole('dialog', { name: 'Assign a task' });
    await expectCode('CH-10208');
    expect(dialog.textContent).not.toMatch(/For \d+ of \d+/);
    await user.type(within(dialog).getByRole('textbox', { name: 'Task' }), 'Book physicals');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(assign).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(code('CH-10108')).toBeNull();
    cleanup();
    show({ ...PREVIEW_HUB_COACH, players: [], playersError: false }, writes({ assignTask: assign }), 'tasks');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    dialog = await screen.findByRole('dialog', { name: 'Assign a task' });
    await expectCode('CH-10310', /No players on the roster yet/);
    expect(dialog.textContent).not.toMatch(/For \d+ of \d+/);
    expect(code('CH-10208')).toBeNull();
  });

  it('CH-10208 a roster that arrives after Try again starts fully chosen, like the first one', async () => {
    const user = userEvent.setup();
    const assign = vi.fn(ok);
    const tree = (data: ChTeamHub) => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <TeamHub data={data} writes={writes({ assignTask: assign })} initialTab="tasks" viewerName="Maya Reyes" />
          </div>
        </ToastProvider>
      </LazyMotion>
    );
    const { rerender } = render(tree({ ...PREVIEW_HUB_COACH, players: [], playersError: true }));
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    rerender(tree(PREVIEW_HUB_COACH));
    const dialog = await screen.findByRole('dialog', { name: 'Assign a task' });
    for (const p of PREVIEW_HUB_COACH.players) expect(within(dialog).getByRole('button', { name: p.name }).getAttribute('aria-pressed')).toBe('true');
    await user.type(within(dialog).getByRole('textbox', { name: 'Task' }), 'Book physicals');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ playerIds: PREVIEW_HUB_COACH.players.map((p) => p.id) }));
  });

  it('100901 101501 a post that lands closes the sheet and refreshes the page', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH);
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(within(dialog).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('CH-10313 CH-10103 CH-10104 CH-10105 CH-10106 CH-10403 CH-10006 101201 planning a trip in steps: no event means no travelers to pick; Logistics checks the name, place and dates before Next; a failed save keeps them', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const plan = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ planTrip: plan }), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plan a trip' });
    const d = within(dialog);
    // Event (none), Travelers (none without an event), then Logistics, which checks before it lets you on.
    await user.click(d.getByRole('radio', { name: /No calendar event/ }));
    await user.click(d.getByRole('button', { name: 'Next: Travelers' }));
    await expectCode('CH-10313', /Travelers come from the trip’s calendar event/);
    await user.click(d.getByRole('button', { name: 'Next: Logistics' }));
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    await expectCode('CH-10103');
    await expectCode('CH-10104');
    await expectCode('CH-10105');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await user.type(d.getByRole('textbox', { name: 'Trip' }), 'Seahawk');
    await user.type(d.getByRole('textbox', { name: 'Where' }), 'Wilmington');
    fireEvent.change(d.getByLabelText('Leaves'), { target: { value: '2026-11-14' } });
    fireEvent.change(d.getByLabelText('Back'), { target: { value: '2026-11-12' } });
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    await expectCode('CH-10106', /can’t be before the departure/);
    fireEvent.change(d.getByLabelText('Back'), { target: { value: '2026-11-16' } });
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    await user.click(d.getByRole('button', { name: 'Publish' }));
    await expectCode('CH-10403', /Saving/);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ eventId: null, name: 'Seahawk', destination: 'Wilmington', departDate: '2026-11-14', returnDate: '2026-11-16', transport: 'bus', teamId: 't1' }));
    release({ success: false });
    await expectCode('CH-10006', /Couldn’t save Seahawk/);
    // Back returns to Logistics with everything kept.
    await user.click(d.getByRole('button', { name: 'Back' }));
    expect((d.getByRole('textbox', { name: 'Trip' }) as HTMLInputElement).value).toBe('Seahawk');
  });

  it("a trip for a calendar event: the event fills the trip, its invitees are the travelers, and Publish saves the trip once, then who travels", async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_COACH, writes({ planTrip: vi.fn(async () => ({ success: true, data: { id: 'trip-new' } })) }), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    const d = within(await screen.findByRole('dialog', { name: 'Plan a trip' }));
    await user.click(d.getByRole('radio', { name: /ECU Intercollegiate/ }));
    await user.click(d.getByRole('button', { name: 'Next: Travelers' }));
    expect(d.getByText('Who’s traveling · 0 of 6')).toBeTruthy();
    await user.click(d.getByRole('button', { name: /Theo Marchetti/ }));
    await user.click(d.getByRole('button', { name: /Eli Brandt/ }));
    await user.click(d.getByRole('button', { name: 'Next: Logistics' }));
    expect((d.getByRole('textbox', { name: 'Trip' }) as HTMLInputElement).value).toBe('ECU Intercollegiate');
    expect((d.getByRole('textbox', { name: 'Where' }) as HTMLInputElement).value).toBe('Greenville CC');
    expect((d.getByLabelText('Leaves') as HTMLInputElement).value).toBe('2026-11-17');
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    expect(d.getByText('2 from ECU Intercollegiate')).toBeTruthy();
    await user.click(d.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(w.setTravelers).toHaveBeenCalledWith('e-ecu', { add: ['theo', 'eli'], remove: [] }));
    expect(w.planTrip).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e-ecu', name: 'ECU Intercollegiate' }));
  });

  it("CH-10006 a travelers write that fails after the trip saved says so, and Retry writes only the travelers, never a second trip", async () => {
    const user = userEvent.setup();
    const setTravelers = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValue({ success: true });
    const w = show(PREVIEW_HUB_COACH, writes({ planTrip: vi.fn(async () => ({ success: true, data: { id: 'trip-new' } })), setTravelers }), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    const d = within(await screen.findByRole('dialog', { name: 'Plan a trip' }));
    await user.click(d.getByRole('radio', { name: /Carolina Fall Invitational/ }));
    await user.click(d.getByRole('button', { name: 'Next: Travelers' }));
    // The event's invitees come chosen; taking one off removes them.
    expect(d.getByText('Who’s traveling · 5 of 6')).toBeTruthy();
    await user.click(d.getByRole('button', { name: /Priya Natarajan/ }));
    await user.click(d.getByRole('button', { name: 'Next: Logistics' }));
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    await user.click(d.getByRole('button', { name: 'Publish' }));
    await expectCode('CH-10006', /Couldn’t save Carolina Fall Invitational/);
    expect(screen.getByText(/The trip is saved; its travelers didn’t update/)).toBeTruthy();
    expect(d.getByRole('button', { name: 'Update travelers' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(setTravelers).toHaveBeenCalledTimes(2));
    expect(setTravelers).toHaveBeenLastCalledWith('e-cfi', { add: [], remove: ['priya'] });
    expect(w.planTrip).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("CH-10210 CH-10312 the Event step: events that didn't load say so, and a team with none says where to add one; the trip can still go without one", async () => {
    const user = userEvent.setup();
    show({ ...PREVIEW_HUB_COACH, tripEvents: { rows: [], error: true } }, writes(), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    await expectCode('CH-10210', /Upcoming events didn’t load/);
    cleanup();
    show({ ...PREVIEW_HUB_COACH, tripEvents: { rows: [], error: false } }, writes(), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    await expectCode('CH-10312', /Add the tournament in Calendar/);
    expect(screen.getByRole('radio', { name: /No calendar event/ }).getAttribute('aria-checked')).toBe('true');
  });

  it("CH-10211 an event whose invitees didn't load: travelers can't be chosen, and Publish leaves the event's invitees alone", async () => {
    const user = userEvent.setup();
    const data = { ...PREVIEW_HUB_COACH, tripEvents: { rows: PREVIEW_HUB_COACH.tripEvents.rows.map((e) => ({ ...e, invited: null })), error: false } };
    const w = show(data, writes({ planTrip: vi.fn(async () => ({ success: true, data: { id: 'x' } })) }), 'travel');
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
    const d = within(await screen.findByRole('dialog', { name: 'Plan a trip' }));
    await user.click(d.getByRole('radio', { name: /ECU Intercollegiate/ }));
    await user.click(d.getByRole('button', { name: 'Next: Travelers' }));
    await expectCode('CH-10211', /can’t be chosen now/);
    await user.click(d.getByRole('button', { name: 'Next: Logistics' }));
    await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
    await user.click(d.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(w.planTrip).toHaveBeenCalledTimes(1));
    expect(w.setTravelers).not.toHaveBeenCalled();
  });

  it("New announcement offers the next trip's travelers as an audience, and sends to exactly them", async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_COACH, writes());
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const d = within(await screen.findByRole('dialog', { name: 'New announcement' }));
    await user.type(d.getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(d.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(d.getByRole('radio', { name: /travelers · 5$/ }));
    await user.click(d.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(w.postAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ playerIds: ['theo', 'sofia', 'ava', 'eli', 'priya'] })));
  });

  it('CH-10107 CH-10108 CH-10404 CH-10007 101201 assigning a task: a name, at least one player; the whole team by default', async () => {
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
    // The sheet stays open with everything as typed.
    expect(dialogOpen()).toBe(true);
    expect((within(dialog).getByRole('textbox', { name: 'Task' }) as HTMLInputElement).value).toBe('Book physicals');
    expect(within(dialog).getByRole('button', { name: 'Ava Lindqvist' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dialog).getByRole('button', { name: 'Eli Brandt' }).getAttribute('aria-pressed')).toBe('false');
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

  it('100102 ?tab= opens a tab the role has, else Home', () => {
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

  it('102101 102301 a player: their own summary; a failed summary marks RSVPs, trips and tasks failed, never empty', async () => {
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

  it('102101 a coach: reply counts, travelers from the trip’s event, task completion, each read once for every event and task together', async () => {
    base();
    actions.coachAnns.mockResolvedValue({ success: true, data: [] });
    const soon = new Date(Date.now() + 2 * 86400000).toISOString();
    const inAWeek = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const reads = { attendance: 0, assignments: 0 };
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Eli', last_name: 'Brandt' } }, { player: { id: 'p2', first_name: 'Ava', last_name: 'Lindqvist' } }] },
      golf_events: { data: [{ id: 'e1', title: 'Team dinner', event_type: 'meeting', start_time: soon, location: 'Carolina Inn' }] },
      golf_travel_itineraries: { data: [{ id: 'tr1', event_id: 'e2', event_name: 'Seahawk', destination: 'Wilmington', departure_date: inAWeek, return_date: inAWeek, transportation_type: 'bus' }] },
      golf_event_attendance: () => {
        reads.attendance += 1;
        return {
          data: [
            { event_id: 'e1', player_id: 'p1', status: 'accepted' },
            { event_id: 'e1', player_id: 'p2', status: 'pending' },
            { event_id: 'e2', player_id: 'p2', status: 'accepted' },
          ],
        };
      },
      golf_tasks: {
        data: [
          { id: 'k1', title: 'Waiver', description: null, due_date: null, category: null, status: 'pending' },
          { id: 'k2', title: 'Physicals', description: null, due_date: null, category: null, status: 'pending' },
        ],
      },
      golf_task_assignments: () => {
        reads.assignments += 1;
        return { data: [{ task_id: 'k1', status: 'completed' }, { task_id: 'k1', status: 'pending' }] };
      },
    };
    const data = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    // Two events (one is the trip's) and two tasks, and still one read of each: never a request per row.
    expect(reads).toEqual({ attendance: 1, assignments: 1 });
    expect(data.rsvps.rows[0]!.counts).toEqual({ going: 1, maybe: 0, no: 0, none: 1 });
    expect(data.trips.rows[0]!.travelers).toEqual(['Ava Lindqvist']);
    expect(data.trips.rows[0]!.travelerIds).toEqual(['p2']);
    expect(data.trips.rows[0]!.upcoming).toBe(true);
    // The trip builder's events come with who is invited, from the same one attendance read.
    expect(data.tripEvents.rows[0]).toMatchObject({ id: 'e1', title: 'Team dinner', location: 'Carolina Inn', invited: ['p1', 'p2'] });
    expect(data.tasks.rows[0]!.done).toEqual([1, 2]);
    expect(data.players.map((p) => p.name)).toEqual(['Ava Lindqvist', 'Eli Brandt']);
  });

  it('102101 102301 every failed read is flagged on its own section and logged by name, and a section that read fine still shows', async () => {
    actions.docs.mockResolvedValue({ data: null, error: 'documents failed' });
    actions.notifs.mockRejectedValue(new Error('bell down'));
    actions.coachAnns.mockResolvedValue({ success: true, data: [] });
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [] },
      golf_travel_itineraries: { error: { message: 'trips down' } },
      golf_tasks: { error: { message: 'tasks down' } },
      golf_events: { error: { message: 'events down' } },
    };
    const data = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    expect([data.documents.error, data.updates.error, data.trips.error, data.tasks.error, data.rsvps.error, data.tripEvents.error]).toEqual([true, true, true, true, true, true]);
    expect(data.announcements.error).toBe(false);
    for (const read of ['documents', 'updates', 'trips', 'tasks', 'events', 'tripEvents']) expect(logServer).toHaveBeenCalledWith('hub', read, expect.anything());
  });

  it('102101 CH-10208 a failed roster read is flagged for a coach, not passed off as an empty team, and logged', async () => {
    base();
    actions.coachAnns.mockResolvedValue({ success: true, data: [] });
    tables.current = { golf_teams: team, golf_team_members: { error: { message: 'roster down' } } };
    const coach = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    expect([coach.players, coach.playersError]).toEqual([[], true]);
    expect(logServer).toHaveBeenCalledWith('hub', 'roster', expect.anything());
    tables.current = { golf_teams: team, golf_team_members: { data: [] } };
    expect((await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null })).playersError).toBe(false);
  });

  it('101501 the posts a coach reads carry the urgency they were posted with, and one the server does not know reads as normal, so an edit sends it back as it was', async () => {
    base();
    const post = (id: string, urgency: string | null) => ({
      id,
      title: id,
      body: 'x',
      created_by: null,
      published_at: '2026-10-14T17:00:00Z',
      created_at: '2026-10-14T17:00:00Z',
      urgency,
      requires_acknowledgement: false,
      acknowledged_count: 0,
      recipient_count: 0,
      total_recipients: 0,
      task_count: 0,
      completed_task_count: 0,
      document_count: 0,
    });
    actions.coachAnns.mockResolvedValue({ success: true, data: [post('a', 'urgent'), post('b', 'low'), post('c', 'high'), post('d', null), post('e', 'panic')] });
    tables.current = { golf_teams: team, golf_team_members: { data: [] } };
    const coach = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    expect(coach.announcements.rows.map((r) => r.urgency)).toEqual(['urgent', 'low', 'high', 'normal', 'normal']);
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

type User = ReturnType<typeof userEvent.setup>;

/** A tab the page opened for a file: what `window.open('', '_blank')` gives back. */
const fileTab = () => ({ location: { href: '' }, close: vi.fn() });
let fileTabs: Array<ReturnType<typeof fileTab>> = [];

const openRowMenu = async (user: User, name: RegExp | string, item: string) => {
  await user.click(screen.getAllByRole('button', { name })[0]!);
  await user.click(await screen.findByRole('menuitem', { name: item }));
};
const reopen = async (user: User, opener: string, dialogName: string, field: string) => {
  await user.click(screen.getByRole('button', { name: opener }));
  return (within(await screen.findByRole('dialog', { name: dialogName })).getByRole('textbox', { name: field }) as HTMLInputElement).value;
};
const refreshed = () => waitFor(() => expect(router.refresh).toHaveBeenCalled());

/** Every write on the page, driven the way a person drives it, with what must not have happened after a refusal and what must have after it lands. */
interface Scenario {
  name: string;
  code: string;
  key: keyof ChHubWrites;
  data: ChTeamHub;
  tab?: ChHubTab;
  failed: RegExp;
  /** The success toast; empty when the change lands without one (Got it, opening a file). */
  done: string;
  drive: (user: User) => Promise<void>;
  /** After a refused write: nothing that follows a landed write has happened. */
  notYet: () => void;
  /** After it lands, by the first press or by Retry: everything the button does has happened. */
  landed: (user: User) => Promise<void>;
  /** After a press while offline, when that differs from notYet. */
  stays?: () => void;
}

const going = () => within(screen.getByRole('radiogroup', { name: 'Your reply for Team dinner' })).getByRole('radio', { name: 'Going' });
const SHORT_GAME = 'Short-game block moves to Green 2';
const SHORT_GAME_EDITED = 'Short-game block moves to Green 3';
const scenarios: Scenario[] = [
  {
    name: 'a reply',
    code: 'CH-10001',
    key: 'reply',
    data: PREVIEW_HUB_PLAYER,
    failed: /Couldn't send your reply for Team dinner/,
    done: "You're going to Team dinner",
    drive: (user) => user.click(going()),
    notYet: () => expect(going().getAttribute('aria-checked')).toBe('false'),
    landed: () => waitFor(() => expect(going().getAttribute('aria-checked')).toBe('true')),
  },
  {
    name: 'Got it',
    code: 'CH-10002',
    key: 'acknowledge',
    data: PREVIEW_HUB_PLAYER,
    failed: /Couldn't acknowledge "Pairings and tee times for Thursday"/,
    done: '',
    drive: (user) => user.click(screen.getByRole('button', { name: 'Got it' })),
    notYet: () => expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy(),
    landed: async () => {
      await screen.findByText('Acknowledged');
      expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    },
  },
  {
    name: 'checking off a task',
    code: 'CH-10003',
    key: 'completeTask',
    data: PREVIEW_HUB_PLAYER,
    failed: /Couldn't mark Sign travel waiver done/,
    done: 'Sign travel waiver done',
    drive: (user) => user.click(screen.getByRole('button', { name: 'Sign travel waiver' })),
    notYet: () => expect(screen.getByRole('button', { name: 'Sign travel waiver' }).getAttribute('aria-pressed')).toBe('false'),
    landed: () => waitFor(() => expect(screen.getByRole('button', { name: 'Sign travel waiver, done' }).getAttribute('aria-pressed')).toBe('true')),
  },
  {
    name: 'opening a file',
    code: 'CH-10004',
    key: 'openDocument',
    data: PREVIEW_HUB_PLAYER,
    tab: 'docs',
    failed: /Couldn't open Travel waiver/,
    done: '',
    drive: async (user) => {
      fileTabs = [fileTab(), fileTab()];
      const queue = [...fileTabs];
      vi.spyOn(window, 'open').mockImplementation(() => queue.shift() as unknown as Window);
      await user.click(screen.getByRole('button', { name: 'Open Travel waiver, PDF' }));
    },
    notYet: () => {
      expect(fileTabs[0]!.close).toHaveBeenCalled();
      expect(fileTabs[0]!.location.href).toBe('');
      // The file can be pressed again.
      expect(screen.getByRole('button', { name: 'Open Travel waiver, PDF' }).hasAttribute('disabled')).toBe(false);
    },
    // A Retry is a second tap, so it opens its own tab: the link lands in one of them.
    landed: () => waitFor(() => expect(fileTabs.some((t) => t.location.href === 'https://files.example/d1')).toBe(true)),
    // Offline nothing is sent, and no blank tab is opened and left behind.
    stays: () => expect(window.open).not.toHaveBeenCalled(),
  },
  {
    name: 'posting an announcement',
    code: 'CH-10005',
    key: 'postAnnouncement',
    data: PREVIEW_HUB_COACH,
    failed: /Couldn’t post the announcement/,
    done: 'Posted "Bus leaves at 6"',
    drive: async (user) => {
      await user.click(screen.getByRole('button', { name: 'New announcement' }));
      const d = within(await screen.findByRole('dialog', { name: 'New announcement' }));
      await user.type(d.getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
      await user.type(d.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
      await user.click(d.getByRole('button', { name: 'Post' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      expect((screen.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe('Bus leaves at 6');
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async (user) => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      await refreshed();
      // The form is clear for the next post.
      expect(await reopen(user, 'New announcement', 'New announcement', 'Headline')).toBe('');
    },
  },
  {
    name: 'saving a trip',
    code: 'CH-10006',
    key: 'planTrip',
    data: PREVIEW_HUB_COACH,
    tab: 'travel',
    failed: /Couldn’t save Seahawk/,
    done: 'Seahawk is on Travel',
    drive: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
      const d = within(await screen.findByRole('dialog', { name: 'Plan a trip' }));
      await user.click(d.getByRole('radio', { name: /No calendar event/ }));
      await user.click(d.getByRole('button', { name: 'Next: Travelers' }));
      await user.click(d.getByRole('button', { name: 'Next: Logistics' }));
      await user.type(d.getByRole('textbox', { name: 'Trip' }), 'Seahawk');
      await user.type(d.getByRole('textbox', { name: 'Where' }), 'Wilmington');
      fireEvent.change(d.getByLabelText('Leaves'), { target: { value: '2026-11-14' } });
      await user.click(d.getByRole('button', { name: 'Next: Itinerary' }));
      await user.click(d.getByRole('button', { name: 'Publish' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      // Still on the last step, with the trip in its summary.
      expect(screen.getByText('Seahawk · Wilmington')).toBeTruthy();
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async (user) => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      await refreshed();
      // Reopened, the builder starts over at its first step.
      await user.click(screen.getByRole('button', { name: 'Plan a trip' }));
      const d = within(await screen.findByRole('dialog', { name: 'Plan a trip' }));
      expect(d.getByText('Event').getAttribute('aria-current')).toBe('step');
    },
  },
  {
    name: 'assigning a task',
    code: 'CH-10007',
    key: 'assignTask',
    data: PREVIEW_HUB_COACH,
    tab: 'tasks',
    failed: /Couldn’t assign Book physicals/,
    done: 'Book physicals assigned to the team',
    drive: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Assign' }));
      const d = within(await screen.findByRole('dialog', { name: 'Assign a task' }));
      await user.type(d.getByRole('textbox', { name: 'Task' }), 'Book physicals');
      await user.click(d.getByRole('button', { name: 'Assign' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      expect((screen.getByRole('textbox', { name: 'Task' }) as HTMLInputElement).value).toBe('Book physicals');
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async (user) => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      await refreshed();
      expect(await reopen(user, 'Assign', 'Assign a task', 'Task')).toBe('');
    },
  },
  {
    name: 'uploading a file',
    code: 'CH-10008',
    key: 'uploadDocument',
    data: PREVIEW_HUB_COACH,
    tab: 'docs',
    failed: /Couldn’t upload Local rules\.pdf/,
    done: 'Local rules.pdf shared with the team',
    drive: async (user) => {
      await user.upload(document.querySelector('.ch-hb-docs input[type="file"]') as HTMLInputElement, new File(['x'], 'Local rules.pdf', { type: 'application/pdf' }));
    },
    notYet: () => expect(router.refresh).not.toHaveBeenCalled(),
    landed: async () => {
      await refreshed();
      // The drop zone is free again.
      await waitFor(() => expect(code('CH-10401')).toBeNull());
    },
  },
  {
    name: 'editing an announcement',
    code: 'CH-10010',
    key: 'editAnnouncement',
    data: PREVIEW_HUB_COACH,
    tab: 'ann',
    failed: /Couldn’t save the announcement/,
    done: `Saved "${SHORT_GAME_EDITED}"`,
    drive: async (user) => {
      await openRowMenu(user, new RegExp(`More for ${SHORT_GAME}`), 'Edit announcement');
      const d = within(await screen.findByRole('dialog', { name: 'Edit announcement' }));
      await user.clear(d.getByRole('textbox', { name: 'Headline' }));
      await user.type(d.getByRole('textbox', { name: 'Headline' }), SHORT_GAME_EDITED);
      await user.click(d.getByRole('button', { name: 'Save changes' }));
    },
    notYet: () => {
      // The words stay in the sheet, and the card still says what was posted.
      expect(dialogOpen()).toBe(true);
      expect((screen.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe(SHORT_GAME_EDITED);
      expect(screen.queryByRole('heading', { level: 3, name: SHORT_GAME_EDITED })).toBeNull();
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async () => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      expect(screen.getByRole('heading', { level: 3, name: SHORT_GAME_EDITED })).toBeTruthy();
      expect(screen.queryByRole('heading', { level: 3, name: SHORT_GAME })).toBeNull();
      await refreshed();
    },
  },
  {
    name: 'deleting an announcement',
    code: 'CH-10009',
    key: 'deleteAnnouncement',
    data: PREVIEW_HUB_COACH,
    tab: 'ann',
    failed: new RegExp(`Couldn’t delete "${SHORT_GAME}"`),
    done: `Deleted "${SHORT_GAME}"`,
    drive: async (user) => {
      await openRowMenu(user, new RegExp(`More for ${SHORT_GAME}`), 'Delete announcement');
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      expect(screen.getByText(SHORT_GAME)).toBeTruthy();
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async () => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      expect(screen.queryByText(SHORT_GAME)).toBeNull();
      await refreshed();
    },
  },
  {
    name: 'deleting a task',
    code: 'CH-10009',
    key: 'deleteTask',
    data: PREVIEW_HUB_COACH,
    tab: 'tasks',
    failed: /Couldn’t delete Sign travel waiver/,
    done: 'Deleted Sign travel waiver',
    drive: async (user) => {
      await openRowMenu(user, 'More for Sign travel waiver', 'Delete task');
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      expect(screen.getByText('Sign travel waiver')).toBeTruthy();
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async () => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      expect(screen.queryByText('Sign travel waiver')).toBeNull();
      await refreshed();
    },
  },
  {
    name: 'deleting a file',
    code: 'CH-10009',
    key: 'deleteDocument',
    data: PREVIEW_HUB_COACH,
    tab: 'docs',
    failed: /Couldn’t delete NCAA hours log/,
    done: 'Deleted NCAA hours log',
    drive: async (user) => {
      await openRowMenu(user, 'More for NCAA hours log', 'Delete file');
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    },
    notYet: () => {
      expect(dialogOpen()).toBe(true);
      expect(screen.getByText('NCAA hours log')).toBeTruthy();
      expect(router.refresh).not.toHaveBeenCalled();
    },
    landed: async () => {
      await waitFor(() => expect(dialogOpen()).toBe(false));
      expect(screen.queryByText('NCAA hours log')).toBeNull();
      await refreshed();
    },
  },
];

describe('Team Hub · every write, by the button and by the failure toast’s Retry', () => {
  for (const sc of scenarios) {
    it(`100901 ${sc.data.role === 'coach' ? '101501 ' : ''}${sc.name}: a change that lands names itself in a toast with the success haptic, and everything the button does follows`, async () => {
      const user = userEvent.setup();
      const w = show(sc.data, writes(), sc.tab);
      await sc.drive(user);
      if (sc.done) await screen.findByText(sc.done);
      expect(w[sc.key]).toHaveBeenCalledTimes(1);
      expect(hapticSpy).toHaveBeenCalledWith('success');
      await sc.landed(user);
    });

    it(`101401 100901 ${sc.name}: the toast’s Retry sends the same write again, and everything a landed write does follows this time too`, async () => {
      const user = userEvent.setup();
      const w = writes();
      const write = w[sc.key] as Mock;
      write.mockImplementationOnce(() => Promise.resolve({ success: false, error: 'nope' }));
      show(sc.data, w, sc.tab);
      await sc.drive(user);
      await expectCode(sc.code, sc.failed);
      expect(write).toHaveBeenCalledTimes(1);
      sc.notYet();
      hapticSpy.mockClear();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
      expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
      if (sc.done) await screen.findByText(sc.done);
      expect(hapticSpy).toHaveBeenCalledWith('success');
      await sc.landed(user);
    });

    it(`10703 100701 ${sc.name}: offline it is not sent, the shell’s toast names what did not happen, the error haptic fires, and nothing moves on`, async () => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
      const user = userEvent.setup();
      const w = show(sc.data, writes(), sc.tab);
      await sc.drive(user);
      await expectCode('CH-1903', sc.failed);
      expect(w[sc.key]).not.toHaveBeenCalled();
      expect(hapticSpy).toHaveBeenCalledWith('error');
      (sc.stays ?? sc.notYet)();
    });
  }

  it('101401 CH-10401 a Retry of an upload shows the drop zone as uploading, and it cannot be pressed again until that upload is done', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const up = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'nope' })
      .mockImplementationOnce(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ uploadDocument: up }), 'docs');
    await user.upload(document.querySelector('.ch-hb-docs input[type="file"]') as HTMLInputElement, new File(['x'], 'Local rules.pdf', { type: 'application/pdf' }));
    await expectCode('CH-10008');
    expect(code('CH-10401')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await expectCode('CH-10401', /Uploading/);
    expect((code('CH-10401') as HTMLButtonElement).disabled).toBe(true);
    release({ success: true });
    await waitFor(() => expect(code('CH-10401')).toBeNull());
  });

  it('CH-10004 a signed link that throws closes the blank tab too, says so, and leaves the file pressable', async () => {
    const user = userEvent.setup();
    const win = fileTab();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    show(PREVIEW_HUB_PLAYER, writes({ openDocument: vi.fn(() => Promise.reject(new Error('signed link failed'))) }), 'docs');
    await user.click(screen.getByRole('button', { name: 'Open Travel waiver, PDF' }));
    await expectCode('CH-10004', /Couldn't open Travel waiver/);
    expect(win.close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open Travel waiver, PDF' }).hasAttribute('disabled')).toBe(false);
  });

  it('101301 a reply whose write throws (not only one that is refused) puts the tick back, says so, and is reported', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_PLAYER, writes({ reply: vi.fn(() => Promise.reject(new Error('socket closed'))) }));
    await user.click(going());
    await expectCode('CH-10001', /Couldn't send your reply for Team dinner/);
    await waitFor(() => expect(going().getAttribute('aria-checked')).toBe('false'));
    expect(track.chReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'socket closed' }), { surface: 'hub', action: 'hub.reply' });
  });

  it('101301 a reply goes back to the last one the server confirmed, not to whatever was on screen when the toast was raised', async () => {
    const user = userEvent.setup();
    const reply = vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'nope' });
    show(PREVIEW_HUB_PLAYER, writes({ reply }));
    const group = within(screen.getByRole('radiogroup', { name: 'Your reply for Team dinner' }));
    await user.click(group.getByRole('radio', { name: 'Going' }));
    await waitFor(() => expect(group.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('true'));
    await user.click(group.getByRole('radio', { name: 'Maybe' }));
    await expectCode('CH-10001');
    expect(group.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('true');
    expect(group.getByRole('radio', { name: 'Maybe' }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('Team Hub · what is sent to a player', () => {
  const team = { data: { name: 'Varsity', season: 'Fall 2026' } };
  const H = 3600 * 1000;
  const at = (ms: number) => new Date(Date.now() + ms).toISOString();
  const base = () => {
    actions.docs.mockResolvedValue({ data: [], error: null });
    actions.notifs.mockResolvedValue({ success: true, data: { items: [] } });
  };

  it('100802 a player’s data carries none of their teammates’ read receipts, replies, completions or names, and the same post reads out in full for the coach', async () => {
    base();
    const soon = at(48 * H);
    const post = {
      id: 'a1',
      title: 'Pairings',
      body: 'Thursday',
      created_by: 'c1',
      published_at: at(-H),
      created_at: at(-H),
      requires_acknowledgement: true,
      has_player_acknowledged: false,
      acknowledged_count: 5,
      recipient_count: 6,
      total_recipients: 6,
      document_count: 0,
      acknowledged_players: [{ player_id: 'p2', first_name: 'Ava', last_name: 'Lindqvist', avatar_url: null }],
    };
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [{ player: { id: 'p2', first_name: 'Ava', last_name: 'Lindqvist' } }] },
      golf_coaches: { data: [{ user_id: 'c1', full_name: 'Maya Reyes', title: 'Head coach' }] },
      golf_events: { data: [{ id: 'e1', status: null, cancelled_at: null, all_day: false, start_time: soon, rsvp_deadline: null }] },
      golf_event_attendance: { data: [{ event_id: 'e2', player_id: 'p1', status: 'accepted' }] },
    };
    actions.summary.mockResolvedValue({
      events: [{ id: 'e1', event_id: 'e1', title: 'Team dinner', event_type: 'meeting', start_time: soon, end_time: null, location: 'Carolina Inn', is_mandatory: false, rsvp_status: 'pending', going_count: 4, maybe_count: 1 }],
      trips: [{ id: 'tr1', event_id: 'e2', event_name: 'Seahawk', destination: 'Wilmington', departure_date: soon.slice(0, 10), return_date: soon.slice(0, 10), transportation_type: 'bus' }],
      tasks: [{ id: 'k1', title: 'Waiver', description: null, due_date: null, category: null, status: 'pending' }],
      announcements: [post],
      announcementsLoadError: false,
    });
    const player = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(player.announcements.rows[0]).toMatchObject({ needAck: true, acked: false, ackCount: 0, recipients: 0 });
    expect(player.rsvps.rows[0]).toMatchObject({ eventId: 'e1', mine: 'pending', counts: null });
    expect(player.trips.rows[0]).toMatchObject({ mine: true, travelers: null, travelerCount: null });
    expect(player.tasks.rows[0]).toMatchObject({ done: null });
    expect(player.players).toEqual([]);
    expect(JSON.stringify(player)).not.toMatch(/Ava|Lindqvist|p2/);

    actions.coachAnns.mockResolvedValue({ success: true, data: [post] });
    const coach = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'c1', playerId: null });
    expect(coach.announcements.rows[0]).toMatchObject({ ackCount: 5, recipients: 6 });
  });

  it('100803 a player is offered a reply only on an event they are invited to that still takes one: not one that started, was cancelled, is past its deadline, or began an all-day more than a day ago', async () => {
    base();
    const rows = [
      { id: 'open', status: 'scheduled', cancelled_at: null, all_day: false, start_time: at(2 * H), rsvp_deadline: null },
      { id: 'not-invited', status: 'scheduled', cancelled_at: null, all_day: false, start_time: at(2 * H), rsvp_deadline: null },
      { id: 'started', status: 'scheduled', cancelled_at: null, all_day: false, start_time: at(-H), rsvp_deadline: null },
      { id: 'cancelled-status', status: 'cancelled', cancelled_at: null, all_day: false, start_time: at(2 * H), rsvp_deadline: null },
      { id: 'cancelled-at', status: null, cancelled_at: at(-H), all_day: false, start_time: at(2 * H), rsvp_deadline: null },
      { id: 'late', status: 'scheduled', cancelled_at: null, all_day: false, start_time: at(2 * H), rsvp_deadline: at(-1000) },
      { id: 'all-day-today', status: 'scheduled', cancelled_at: null, all_day: true, start_time: at(-3 * H), rsvp_deadline: null },
      { id: 'all-day-old', status: 'scheduled', cancelled_at: null, all_day: true, start_time: at(-30 * H), rsvp_deadline: null },
    ];
    let ruleReads = 0;
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [] },
      golf_events: () => {
        ruleReads += 1;
        return { data: rows };
      },
    };
    actions.summary.mockResolvedValue({
      // The aggregate gives no reply status (null) for an event the player has no place on the invite list of.
      events: rows.map((r) => ({ id: r.id, event_id: r.id, title: r.id, event_type: 'meeting', start_time: r.start_time, end_time: null, location: null, is_mandatory: false, rsvp_status: r.id === 'not-invited' ? null : 'pending', going_count: 0, maybe_count: 0 })),
      trips: [],
      tasks: [],
      announcements: [],
      announcementsLoadError: false,
    });
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(data.rsvps.rows.map((r) => r.eventId)).toEqual(['open', 'all-day-today']);
    expect(data.rsvps.error).toBe(false);
    // The rules of every event they are invited to are read together, once.
    expect(ruleReads).toBe(1);

    // A rules read that fails closes nothing: the row stays, and the server still decides when they answer.
    tables.current = { ...tables.current, golf_events: { error: { message: 'boom' } } };
    const kept = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(kept.rsvps.rows).toHaveLength(rows.length - 1);
    expect(logServer).toHaveBeenCalledWith('hub', 'eventReplyRules', expect.anything());
  });

  it('100803 the reply rules are the server’s: an event exactly at its start, or a deadline that has just passed, is closed', () => {
    const now = Date.parse('2026-10-14T18:00:00Z');
    const open = { status: null, cancelled_at: null, all_day: false, start_time: '2026-10-14T18:00:01Z', rsvp_deadline: null };
    expect(replyIsClosed(open, now)).toBe(false);
    expect(replyIsClosed({ ...open, start_time: '2026-10-14T18:00:00Z' }, now)).toBe(true);
    expect(replyIsClosed({ ...open, rsvp_deadline: '2026-10-14T17:59:59Z' }, now)).toBe(true);
    expect(replyIsClosed({ ...open, rsvp_deadline: '2026-10-14T18:00:00Z' }, now)).toBe(false);
    expect(replyIsClosed({ ...open, all_day: true, start_time: '2026-10-13T18:00:01Z' }, now)).toBe(false);
    expect(replyIsClosed({ ...open, all_day: true, start_time: '2026-10-13T18:00:00Z' }, now)).toBe(true);
  });
});

describe('Team Hub · roles, states and layout', () => {
  it('100801 a coach never sees a player’s controls: no reply buttons, no Got it, no task boxes', async () => {
    show(PREVIEW_HUB_COACH);
    expect(screen.queryByRole('radiogroup', { name: /Your reply for/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Going' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    await tab('Tasks');
    expect(screen.getByLabelText('3 of 5 done')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign travel waiver' })).toBeNull();
  });

  it('CH-10202 CH-10306 CH-10305 100410 the page is empty only when every read answered and was empty: a failed Updates read still says so, and an update to read is shown', () => {
    show({ ...PREVIEW_HUB_PLAYER_EMPTY, updates: { rows: [], error: true } });
    expect(code('CH-10202')).not.toBeNull();
    expect(code('CH-10306')).toBeNull();
    cleanup();
    show({ ...PREVIEW_HUB_COACH_EMPTY, updates: { rows: [], error: true } });
    expect(code('CH-10202')).not.toBeNull();
    expect(code('CH-10305')).toBeNull();
    cleanup();
    show({ ...PREVIEW_HUB_PLAYER_EMPTY, updates: PREVIEW_HUB_PLAYER.updates });
    expect(code('CH-10306')).toBeNull();
    expect(screen.getByText('Coach Reyes posted')).toBeTruthy();
    cleanup();
    // With every read empty and answered, it is still the empty page.
    show(PREVIEW_HUB_PLAYER_EMPTY);
    expect(code('CH-10306')).not.toBeNull();
  });

  it('101402 CH-10201 CH-10202 Try again on a failed read has the server read the page again', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH_FAILED);
    expect(router.refresh).not.toHaveBeenCalled();
    await user.click(within(code('CH-10201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await refreshed();
    router.refresh.mockClear();
    await user.click(within(code('CH-10202') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await refreshed();
  });

  it('101201 Cancel keeps a half-written announcement: opening the sheet again finds it as it was', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH);
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialogOpen()).toBe(false));
    expect(await reopen(user, 'New announcement', 'New announcement', 'Headline')).toBe('Bus leaves at 6');
  });

  it('CH-10405 the route shows the Clubhouse skeleton inside the shell and the Fairway one outside it', () => {
    render(
      <ClubhouseMarker>
        <Loading />
      </ClubhouseMarker>,
    );
    expect(code('CH-10405')!.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByLabelText('Loading Team Hub')).toBeTruthy();
    cleanup();
    render(<Loading />);
    expect(code('CH-10405')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    cleanup();
    render(<HubSkeleton />);
    expect(code('CH-10405')).not.toBeNull();
  });

  it('102001 the tabs are one stop: arrows, Home and End move and select, Tab goes on to the panel; Enter and Space press the reply buttons', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_PLAYER);
    const tabs = screen.getAllByRole('tab');
    const selected = () => screen.getByRole('tab', { selected: true });
    expect(tabs.map((t) => t.tabIndex)).toEqual(tabs.map((_, i) => (i === 0 ? 0 : -1)));
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(screen.getByRole('tab', { name: 'Announcements' }));
    expect(document.activeElement).toBe(selected());
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(tabs[0]);
    await user.keyboard('{ArrowLeft}');
    expect(selected()).toBe(tabs[tabs.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tabs[0]);
    await user.keyboard('{Tab}');
    expect(document.activeElement?.getAttribute('role')).not.toBe('tab');
    going().focus();
    await user.keyboard(' ');
    expect(w.reply).toHaveBeenCalledWith('r2', 'accepted');
  });

  it('102001 Esc closes a sheet and focus goes back to the button that opened it', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_COACH);
    const opener = screen.getByRole('button', { name: 'New announcement' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'New announcement' });
    // What Esc does to a modal <dialog>: it asks to cancel.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(dialogOpen()).toBe(false));
    expect(document.activeElement).toBe(opener);
  });

  it('102301 a tab change and a write leave breadcrumbs, and a refused write is reported under the page’s surface with its action', async () => {
    const user = userEvent.setup();
    show(PREVIEW_HUB_PLAYER, writes({ reply: refuse() }));
    await tab('Travel');
    expect(track.chTrail).toHaveBeenCalledWith('hub tab travel');
    await tab('Home');
    await user.click(going());
    await expectCode('CH-10001');
    expect(track.chTrail).toHaveBeenCalledWith('action hub.reply');
    expect(track.chReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'refused' }), { surface: 'hub', action: 'hub.reply', severity: 'low' });
  });
});

describe('Team Hub · phone', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('101901 at 820px and below Team Hub is the phone build: the phone frame class, and the page title read by a screen reader instead of drawn', () => {
    show(PREVIEW_HUB_PLAYER);
    expect(screen.getByRole('main').classList.contains('is-phone')).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Team Hub' }).classList.contains('ch-sr-only')).toBe(true);
    cleanup();
    show(PREVIEW_HUB_COACH);
    expect(screen.getByRole('main').classList.contains('is-phone')).toBe(true);
    // The tabs, their panel and the coach's one primary action are all there.
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'New announcement' })).toBeTruthy();
  });
});

const tree = (data: ChTeamHub, w: ChHubWrites, tab?: ChHubTab) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <TeamHub data={data} writes={w} initialTab={tab} viewerName="Maya Reyes" />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const openCompose = async (user: User) => {
  await user.click(screen.getByRole('button', { name: 'New announcement' }));
  return within(await screen.findByRole('dialog', { name: 'New announcement' }));
};
const attached = (d: Pick<typeof screen, 'queryAllByRole'>) => d.queryAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label'));
const withDocuments = (documents: ChTeamHub['documents']): ChTeamHub => ({ ...PREVIEW_HUB_COACH, documents });

describe('Team Hub · Attach from Documents in New announcement', () => {
  it('CH-10005 101201 a post carries the files chosen from Documents, in the order chosen, as chips that come off; a refused post keeps them, Retry sends the same ones, and a landed post starts clear', async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValue({ success: true, data: { announcementId: 'n' } });
    show(PREVIEW_HUB_COACH, writes({ postAnnouncement: post }), 'ann');
    const dialog = await openCompose(user);
    expect(attached(dialog)).toEqual([]);
    const attach = dialog.getByRole('button', { name: 'Attach from Documents' });
    expect(attach.getAttribute('aria-expanded')).toBe('false');
    await user.click(attach);
    expect(attach.getAttribute('aria-expanded')).toBe('true');
    // The team's files, by folder, as they are in Documents.
    expect(dialog.getByRole('group', { name: 'Carolina Fall Invitational' })).toBeTruthy();
    expect(dialog.getByRole('group', { name: 'Compliance' })).toBeTruthy();
    hapticSpy.mockClear();
    await user.click(dialog.getByRole('button', { name: 'Travel waiver, PDF' }));
    await user.click(dialog.getByRole('button', { name: 'Pairings and tee times, PDF' }));
    await user.click(dialog.getByRole('button', { name: 'Hotel confirmation, PDF' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(dialog.getByRole('button', { name: 'Travel waiver, PDF' }).getAttribute('aria-pressed')).toBe('true');
    expect(attached(dialog)).toEqual(['Remove Travel waiver', 'Remove Pairings and tee times', 'Remove Hotel confirmation']);
    await user.click(dialog.getByRole('button', { name: 'Remove Pairings and tee times' }));
    expect(attached(dialog)).toEqual(['Remove Travel waiver', 'Remove Hotel confirmation']);
    expect(dialog.getByRole('button', { name: 'Pairings and tee times, PDF' }).getAttribute('aria-pressed')).toBe('false');

    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Waiver and hotel');

    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(dialog.getByRole('button', { name: 'Post' }));
    await expectCode('CH-10005');
    expect(post).toHaveBeenCalledWith({ title: 'Waiver and hotel', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: ['d3', 'd2'] });
    // Refused: the sheet and its files are still there.
    expect(dialogOpen()).toBe(true);
    expect(attached(dialog)).toEqual(['Remove Travel waiver', 'Remove Hotel confirmation']);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
    await waitFor(() => expect(dialogOpen()).toBe(false));
    // The next post starts with nothing attached.
    expect(attached(await openCompose(user))).toEqual([]);
  });

  it('CH-10311 a team with no documents yet: the sheet says where they are added, offers nothing to attach, and the post still goes with none', async () => {
    const user = userEvent.setup();
    const post = vi.fn(ok);
    show(withDocuments({ folders: [], error: false }), writes({ postAnnouncement: post }), 'ann');
    const dialog = await openCompose(user);
    await expectCode('CH-10311', /No documents yet\. Add files in the Documents tab/);
    expect(code('CH-10209')).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Attach from Documents' })).toBeNull();
    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(dialog.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: [] }));
  });

  it('CH-10209 documents that did not load: the sheet says so and is not passed off as empty; Try again reads the page again, and the files that arrive can be attached with the words kept', async () => {
    const user = userEvent.setup();
    const post = vi.fn(ok);
    const w = writes({ postAnnouncement: post });
    const { rerender } = render(tree(withDocuments({ folders: [], error: true }), w, 'ann'));
    const dialog = await openCompose(user);
    await expectCode('CH-10209', /Documents didn't load/);
    expect(code('CH-10311')).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Attach from Documents' })).toBeNull();
    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(within(code('CH-10209') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    // The read that follows gives the files.
    rerender(tree(PREVIEW_HUB_COACH, w, 'ann'));
    expect(code('CH-10209')).toBeNull();
    expect((dialog.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe('Bus leaves at 6');
    await user.click(dialog.getByRole('button', { name: 'Attach from Documents' }));
    await user.click(dialog.getByRole('button', { name: 'Team handbook, PDF' }));
    await user.click(dialog.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: ['d5'] }));
  });

  it('a failed read with the post still possible: the failure does not stop a post with no files', async () => {
    const user = userEvent.setup();
    const post = vi.fn(ok);
    show(withDocuments({ folders: [], error: true }), writes({ postAnnouncement: post }), 'ann');
    const dialog = await openCompose(user);
    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Bus leaves at 6');
    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(dialog.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ title: 'Bus leaves at 6', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: [] }));
  });

  it('a file deleted from Documents while the post is being written comes off its chips and is not sent', async () => {
    const user = userEvent.setup();
    const post = vi.fn(ok);
    const w = writes({ postAnnouncement: post });
    const { rerender } = render(tree(PREVIEW_HUB_COACH, w, 'ann'));
    const dialog = await openCompose(user);
    await user.click(dialog.getByRole('button', { name: 'Attach from Documents' }));
    await user.click(dialog.getByRole('button', { name: 'Travel waiver, PDF' }));
    await user.click(dialog.getByRole('button', { name: 'Hotel confirmation, PDF' }));
    const without = { ...PREVIEW_HUB_COACH.documents, folders: PREVIEW_HUB_COACH.documents.folders.map((f) => ({ ...f, files: f.files.filter((d) => d.id !== 'd3') })) };
    rerender(tree(withDocuments(without), w, 'ann'));
    expect(attached(dialog)).toEqual(['Remove Hotel confirmation']);
    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Hotel is booked');
    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(dialog.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ title: 'Hotel is booked', body: 'Details in the app.', requiresAck: true, playerIds: null, documentIds: ['d2'] }));
  });
});

describe('Team Hub · Edit an announcement', () => {
  it('101501 an edit starts from the post, offers only headline, message and acknowledgement, and sends the post’s id, the new words and its urgency as posted; the card shows it at once', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_HUB_COACH);
    // Home shows the latest post: the same menu, the same sheet.
    expect(screen.getByText('5 of 6 acknowledged')).toBeTruthy();
    await openRowMenu(user, /More for Pairings and tee times for Thursday/, 'Edit announcement');
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit announcement' }));
    const headline = () => dialog.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement;
    const message = () => dialog.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(headline().value).toBe('Pairings and tee times for Thursday');
    expect(message().value).toMatch(/^First group off at 8:42\./);
    expect((dialog.getByRole('switch', { name: 'Ask players to acknowledge' }) as HTMLInputElement).checked).toBe(true);
    // Who it went to and what is attached stay as posted: nothing to change, so nothing offered.
    expect(dialog.queryByRole('radiogroup', { name: 'Send to' })).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Attach from Documents' })).toBeNull();
    // A headline under three characters is stopped, as in a new post.
    await user.clear(headline());
    await user.type(headline(), 'Hi');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-10101', /at least three characters/);
    expect(w.editAnnouncement).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');

    await user.clear(headline());
    await user.type(headline(), 'Tee times moved to 8:50');
    await user.clear(message());
    await user.type(message(), 'Warm-up at 7:40.');
    await user.click(dialog.getByRole('switch', { name: 'Ask players to acknowledge' }));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.editAnnouncement).toHaveBeenCalledTimes(1));
    expect(w.editAnnouncement).toHaveBeenCalledWith('a1', { title: 'Tee times moved to 8:50', body: 'Warm-up at 7:40.', urgency: 'high', requiresAck: false });
    await screen.findByText('Saved "Tee times moved to 8:50"');
    await waitFor(() => expect(dialogOpen()).toBe(false));
    // The card says what was saved: the headline, the message, and read (not acknowledged) receipts.
    expect(screen.getByRole('heading', { level: 3, name: 'Tee times moved to 8:50' })).toBeTruthy();
    expect(screen.getByText('Warm-up at 7:40.')).toBeTruthy();
    expect(screen.getByText('5 of 6 read')).toBeTruthy();
    expect(screen.queryByText('5 of 6 acknowledged')).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('the sheet starts from the post once per opening: a page read that lands while it is open or a refused save leaves what was typed, reopening starts from the post again, and a draft of a new post survives an edit', async () => {
    const user = userEvent.setup();
    const w = writes({ editAnnouncement: refuse() });
    const { rerender } = render(tree(PREVIEW_HUB_COACH, w, 'ann'));
    let dialog = await openCompose(user);
    await user.type(dialog.getByRole('textbox', { name: 'Headline' }), 'Draft post');
    await user.type(dialog.getByRole('textbox', { name: 'Message' }), 'Details in the app.');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialogOpen()).toBe(false));

    await openRowMenu(user, /More for Pairings and tee times for Thursday/, 'Edit announcement');
    dialog = within(await screen.findByRole('dialog', { name: 'Edit announcement' }));
    const headline = () => dialog.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement;
    await user.type(headline(), ' (moved)');
    // A read lands while it is open: the same rows, new objects.
    rerender(tree({ ...PREVIEW_HUB_COACH, announcements: { rows: PREVIEW_HUB_COACH.announcements.rows.map((a) => ({ ...a })), error: false } }, w, 'ann'));
    expect(headline().value).toBe('Pairings and tee times for Thursday (moved)');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-10010');
    expect(headline().value).toBe('Pairings and tee times for Thursday (moved)');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialogOpen()).toBe(false));

    await openRowMenu(user, /More for Pairings and tee times for Thursday/, 'Edit announcement');
    dialog = within(await screen.findByRole('dialog', { name: 'Edit announcement' }));
    expect(headline().value).toBe('Pairings and tee times for Thursday');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialogOpen()).toBe(false));
    dialog = await openCompose(user);
    expect((dialog.getByRole('textbox', { name: 'Headline' }) as HTMLInputElement).value).toBe('Draft post');
  });

  it('CH-10406 an edit being saved says Saving on its button, which cannot be pressed twice', async () => {
    const user = userEvent.setup();
    let release: (v: { success: boolean }) => void = () => {};
    const save = vi.fn(() => new Promise<{ success: boolean }>((r) => (release = r)));
    show(PREVIEW_HUB_COACH, writes({ editAnnouncement: save }), 'ann');
    await openRowMenu(user, new RegExp(`More for ${SHORT_GAME}`), 'Edit announcement');
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit announcement' }));
    // A post that asks for no acknowledgement opens with the switch off, and is saved as it was.
    expect((dialog.getByRole('switch', { name: 'Ask players to acknowledge' }) as HTMLInputElement).checked).toBe(false);
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-10406', /Saving/);
    expect((code('CH-10406')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(code('CH-10402')).toBeNull();
    release({ success: true });
    await waitFor(() => expect(dialogOpen()).toBe(false));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('a2', { title: SHORT_GAME, body: 'Maintenance on the practice green through Friday. Same time, 3:30.', urgency: 'normal', requiresAck: false });
  });

  it('a player has no menu on a post, so nothing to edit or delete', () => {
    show(PREVIEW_HUB_PLAYER, writes(), 'ann');
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^More for / })).toBeNull();
  });
});

describe('Team Hub · the live writes', () => {
  it('101501 a post hands the files chosen to createEnrichedAnnouncement, and an edit hands the post’s id, its words, urgency and acknowledgement to updateAnnouncement', async () => {
    vi.mocked(createEnrichedAnnouncement).mockResolvedValue({ success: true, data: { announcementId: 'n' } });
    vi.mocked(updateAnnouncement).mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.postAnnouncement({ title: ' Waiver ', body: ' Sign it ', requiresAck: true, playerIds: ['p1'], documentIds: ['d3', 'd2'] });
    expect(createEnrichedAnnouncement).toHaveBeenCalledWith({ title: 'Waiver', body: 'Sign it', urgency: 'normal', requiresAcknowledgement: true, recipientPlayerIds: ['p1'], documentIds: ['d3', 'd2'], inlineTasks: [] });
    await LIVE_HUB_WRITES.editAnnouncement('a1', { title: ' Tee times ', body: ' Warm-up ', urgency: 'urgent', requiresAck: false });
    expect(updateAnnouncement).toHaveBeenCalledWith('a1', { title: 'Tee times', body: 'Warm-up', urgency: 'urgent', requiresAcknowledgement: false });
  });
});

describe('Team Hub · this file', () => {
  it('102401 every catalog row of kinds 0 to 5 that is not marked preview is named by a test here, and so is every Bridge ID this page proves', () => {
    const root = process.cwd();
    const read = (file: string) => readFileSync(join(root, file), 'utf8');
    const own = read('src/clubhouse/__tests__/hub.test.tsx');
    const rows = [...read('docs/clubhouse/catalog/hub.md').matchAll(/^\|\s*(CH-10[0-5]\d\d)\s*\|.*$/gm)]
      .filter((m) => !/\|\s*preview\s*\|\s*$/.test(m[0].trim()) && !/retired/i.test(m[0]))
      .map((m) => m[1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(rows.length).toBeGreaterThanOrEqual(41);
    expect(rows.filter((c) => !own.includes(c))).toEqual([]);
    // Every hand contract the registry marks implemented is named in a test title of one of the files it lists.
    const bridge = JSON.parse(read('config/clubhouse/bridge-contracts.json')) as Array<{ id: number; page: string; chCode?: string; status: string; tests?: string[] }>;
    const titles = (file: string) => read(file).split('\n').filter((l) => /^\s*(it|describe|test)(\.each\(.*\))?\(/.test(l) || /^\s*(it|test)\(`/.test(l));
    const unnamed = bridge.filter((r) => r.page === 'P010' && !r.chCode && r.status === 'implemented').filter((r) => !(r.tests ?? []).some((f) => titles(f).some((l) => l.includes(String(r.id)))));
    expect(unnamed.map((r) => r.id)).toEqual([]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
