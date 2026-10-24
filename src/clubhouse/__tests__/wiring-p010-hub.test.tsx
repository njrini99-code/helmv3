import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P010 wiring audit (2026-10-17): Team Hub's writes and reads checked against production's callers of the same actions.
 * Each block is one difference that was fixed.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const badges = vi.hoisted(() => ({ refetch: vi.fn(() => Promise.resolve()) }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => badges }));
const actions = vi.hoisted(() => ({
  summary: vi.fn(),
  playerAnns: vi.fn(),
  coachAnns: vi.fn(),
  docs: vi.fn(),
  notifs: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
  travelSeen: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: actions.summary }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: actions.playerAnns, markTravelSeen: actions.travelSeen }));
vi.mock('@/app/golf/actions/announcements', () => ({
  getAnnouncementsWithMeta: actions.coachAnns,
  getAnnouncementDetail: actions.detail,
  createEnrichedAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
}));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: actions.docs, createGolfDocument: actions.create, deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), prepareGolfDocumentUpload: actions.upload }));
// UP-1: the file goes to Storage on the signed URL; here the transfer always lands.
vi.mock('../screens/recruiting/upload', () => ({ putWithProgress: vi.fn(async () => ({ status: 200, body: '' })) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: actions.notifs, markNotificationRead: actions.markRead, markAllNotificationsRead: vi.fn() }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ respondToEvent: vi.fn(), updateGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({
  createGolfTravelItinerary: vi.fn(),
  getTravelerClassConflicts: vi.fn(),
  updateGolfTravelItinerary: vi.fn(),
  deleteGolfTravelItinerary: vi.fn(),
}));

import { fileKind, folders, formatters, loadTeamHub, type ChTeamHub } from '../data/hub';
import { TeamHub, type ChHubTab } from '../screens/hub/TeamHub';
import { HUB_UPLOAD_ACCEPT, uploadRefusal } from '../screens/hub/upload-rules';
import { LIVE_HUB_WRITES, type ChHubWrites } from '../screens/hub/writes';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../preview/fixtures-hub';

const ok = () => Promise.resolve({ success: true });
function writes(over: Partial<ChHubWrites> = {}): ChHubWrites {
  return {
    reply: vi.fn(ok),
    acknowledge: vi.fn(ok),
    completeTask: vi.fn(ok),
    uncompleteTask: vi.fn(ok),
    setTravelers: vi.fn(ok),
    travelerClasses: vi.fn(() => Promise.resolve({ success: true, data: { classes: [], partial: false } })),
    openDocument: vi.fn(() => Promise.resolve({ success: true, data: { url: 'https://files.example/d1' } })),
    postAnnouncement: vi.fn(() => Promise.resolve({ success: true, data: { announcementId: 'n' } })),
    editAnnouncement: vi.fn(ok),
    deleteAnnouncement: vi.fn(ok),
    assignTask: vi.fn(ok),
    deleteTask: vi.fn(ok),
    planTrip: vi.fn(ok),
    editTrip: vi.fn(ok),
    deleteTrip: vi.fn(ok),
    uploadDocument: vi.fn(ok),
    deleteDocument: vi.fn(ok),
    ...over,
  } as ChHubWrites;
}
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

beforeEach(() => {
  vi.clearAllMocks();
  tables.current = {};
  actions.docs.mockResolvedValue({ data: [], error: null });
  actions.notifs.mockResolvedValue({ success: true, data: { items: [] } });
});
afterEach(cleanup);

const team = { data: { name: 'Varsity', season: 'Fall 2026' } };
const soon = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

describe('a player’s trips: the event comes from the itinerary, not the aggregate', () => {
  // getPlayerHubSummaryData selects no event_id, so every pass read "—" for "You" (production: 2 of 9 recent trips have one).
  const summary = (trips: Array<{ id: string }>) => ({ events: [], trips: trips.map((t) => ({ ...t, event_name: 'Seahawk', destination: 'Wilmington', departure_date: soon(), return_date: soon(), transportation_type: 'bus' })), tasks: [], announcements: [], announcementsLoadError: false });

  it('reads each trip’s event and says whether the player travels', async () => {
    actions.summary.mockResolvedValue(summary([{ id: 'tr1' }, { id: 'tr2' }, { id: 'tr3' }]));
    let asked: unknown[] = [];
    tables.current = {
      golf_teams: team,
      golf_team_members: { data: [] },
      golf_travel_itineraries: (filters) => {
        asked = filters.find(([k]) => k === 'in')?.[1] ?? [];
        return { data: [{ id: 'tr1', event_id: 'e1' }, { id: 'tr2', event_id: 'e2' }, { id: 'tr3', event_id: null }] };
      },
      golf_event_attendance: { data: [{ event_id: 'e1' }] },
      golf_events: { data: [] },
    };
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(asked).toEqual(['id', ['tr1', 'tr2', 'tr3']]);
    expect(data.trips.rows.map((t) => [t.id, t.eventId, t.mine])).toEqual([
      ['tr1', 'e1', true],
      ['tr2', 'e2', false],
      ['tr3', null, null],
    ]);
  });

  it('a failed read leaves every trip unknown, never “Not traveling”, and is logged', async () => {
    actions.summary.mockResolvedValue(summary([{ id: 'tr1' }]));
    tables.current = { golf_teams: team, golf_team_members: { data: [] }, golf_travel_itineraries: { error: { message: 'down' } }, golf_events: { data: [] } };
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(data.trips.rows[0]!.mine).toBeNull();
    expect(logServer).toHaveBeenCalledWith('hub', 'tripLinks', expect.anything());
  });
});

describe('Updates: only links inside GolfHelm, and opening one marks it read', () => {
  it('drops an off-site link and keeps the row’s feed', async () => {
    tables.current = { golf_teams: team, golf_team_members: { data: [] } };
    actions.summary.mockResolvedValue({ events: [], trips: [], tasks: [], announcements: [], announcementsLoadError: false });
    actions.notifs.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 'n1', source: 'notifications', title: 'Plan', body: null, action_url: '/golf/dashboard/coachhelm', created_at: new Date().toISOString(), read_at: null },
          { id: 'n2', source: 'golf_calendar_notifications', title: 'Event', body: null, action_url: '//evil.example/x', created_at: new Date().toISOString(), read_at: null },
        ],
      },
    });
    const data = await loadTeamHub({ role: 'player', teamId: 't1', userId: 'u1', playerId: 'p1' });
    expect(data.updates.rows.map((n) => [n.id, n.href, n.source])).toEqual([
      ['n1', '/golf/dashboard/coachhelm', 'notifications'],
      ['n2', null, 'golf_calendar_notifications'],
    ]);
  });

  it('a tap on an unread update marks it read in its own feed and recounts the badge', async () => {
    const markUpdateRead = vi.fn(ok);
    const rows = [{ id: 'n1', title: 'New plan', body: null, href: '/golf/dashboard/coachhelm', when: 'now', unread: true, source: 'notifications' as const }];
    show({ ...PREVIEW_HUB_PLAYER, updates: { rows, error: false } }, writes({ markUpdateRead }));
    expect(screen.getByText('1 new')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('link', { name: /New plan/ }));
    await waitFor(() => expect(markUpdateRead).toHaveBeenCalledWith('n1', 'notifications'));
    await waitFor(() => expect(badges.refetch).toHaveBeenCalled());
    expect(screen.queryByText('1 new')).toBeNull();
  });
});

describe('documents: the stored type is the MIME type, and the label reads it', () => {
  it('a Clubhouse upload stores the MIME type, as Fairway’s Documents does', async () => {
    actions.upload.mockResolvedValue({ success: true, data: { signedUrl: 'https://x/sign', fileUrl: 'https://x/golf-documents/t1/a.docx', storagePath: 'golf-documents/t1/a.docx', contentType: 'application/octet-stream' } });
    actions.create.mockResolvedValue({ success: true });
    const file = new File(['x'], 'Waiver.docx', { type: '' });
    await LIVE_HUB_WRITES.uploadDocument({ teamId: 't1', file, folder: null });
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', title: 'Waiver', player_visible: true }));
  });

  it('labels a MIME type, an extension and an address alike', () => {
    expect(fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')).toBe('docx');
    expect(fileKind('application/pdf', 'x')).toBe('pdf');
    expect(fileKind('image/heic', 'x')).toBe('heic');
    expect(fileKind('image/svg+xml', 'x')).toBe('png');
    expect(fileKind('pdf', 'x')).toBe('pdf');
    expect(fileKind(null, 'https://x/a/b.xlsx?token=1')).toBe('xlsx');
    const f = formatters('America/New_York', new Date());
    const [team] = folders([{ id: 'd1', title: 'Waiver', folder: null, file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_url: 'https://x/a', file_size: 10, updated_at: null, created_at: null, is_public: true }], f);
    expect(team!.files[0]!.type).toBe('DOC');
  });
});

describe('a player’s writes recount Team Hub’s badge, as production’s hub does', () => {
  it('Got it and a task’s tick read the badge again once they land', async () => {
    const w = show(PREVIEW_HUB_PLAYER);
    const u = userEvent.setup();
    const gotIt = screen.queryAllByRole('button', { name: 'Got it' })[0];
    expect(gotIt).toBeTruthy();
    await u.click(gotIt!);
    await waitFor(() => expect(w.acknowledge).toHaveBeenCalled());
    await waitFor(() => expect(badges.refetch).toHaveBeenCalledTimes(1));
    const box = document.querySelector<HTMLButtonElement>('.ch-hb-check[aria-pressed="false"]');
    expect(box).toBeTruthy();
    await u.click(box!);
    await waitFor(() => expect(w.completeTask).toHaveBeenCalled());
    await waitFor(() => expect(badges.refetch).toHaveBeenCalledTimes(2));
  });

  it('a refused write leaves the badge alone', async () => {
    const w = show(PREVIEW_HUB_PLAYER, writes({ acknowledge: vi.fn(() => Promise.resolve({ success: false, error: 'no' })) }));
    await userEvent.setup().click(screen.queryAllByRole('button', { name: 'Got it' })[0]!);
    await waitFor(() => expect(w.acknowledge).toHaveBeenCalled());
    expect(badges.refetch).not.toHaveBeenCalled();
  });

  it('the Travel tab marks travel seen once a visit, for a player only', async () => {
    const markTravelSeen = vi.fn(ok);
    show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }), 'travel');
    await waitFor(() => expect(markTravelSeen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(badges.refetch).toHaveBeenCalled());
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: 'Home' }));
    await u.click(screen.getByRole('tab', { name: 'Travel' }));
    expect(markTravelSeen).toHaveBeenCalledTimes(1);
    cleanup();
    const coachSeen = vi.fn(ok);
    show(PREVIEW_HUB_COACH, writes({ markTravelSeen: coachSeen }), 'travel');
    await new Promise((r) => setTimeout(r, 20));
    expect(coachSeen).not.toHaveBeenCalled();
  });

  it('the live set marks travel seen and reads a post’s files through production’s actions', async () => {
    actions.travelSeen.mockResolvedValue({ success: true });
    await LIVE_HUB_WRITES.markTravelSeen!();
    expect(actions.travelSeen).toHaveBeenCalled();
    actions.detail.mockResolvedValue({
      success: true,
      data: {
        documents: [
          { id: 'j2', document_id: 'd2', sort_order: 1, document: { id: 'd2', title: 'Itinerary', file_url: 'u', file_type: 'application/pdf', file_size: 1 } },
          { id: 'j1', document_id: 'd1', sort_order: 0, document: { id: 'd1', title: 'Waiver', file_url: 'u', file_type: 'application/pdf', file_size: 1 } },
        ],
      },
    });
    const res = await LIVE_HUB_WRITES.announcementFiles!('a1');
    expect(actions.detail).toHaveBeenCalledWith('a1');
    expect(res.data!.files.map((f) => f.id)).toEqual(['d1', 'd2']);
  });
});

describe('a post’s attachments open, as production’s announcement card opens them', () => {
  const withFiles = (): ChTeamHub => ({
    ...PREVIEW_HUB_PLAYER,
    announcements: { ...PREVIEW_HUB_PLAYER.announcements, rows: PREVIEW_HUB_PLAYER.announcements.rows.map((a, i) => (i === 0 ? { ...a, documentCount: 1 } : { ...a, documentCount: 0 })) },
  });

  it('the count lists the files on request and a file opens through Documents’ open', async () => {
    const announcementFiles = vi.fn(() => Promise.resolve({ success: true, data: { files: [{ id: 'd1', title: 'Waiver', type: 'application/pdf' }] } }));
    const w = show(withFiles(), writes({ announcementFiles }), 'ann');
    const u = userEvent.setup();
    const count = screen.getAllByRole('button', { name: /1 attachment/ })[0]!;
    expect(count.getAttribute('aria-expanded')).toBe('false');
    await u.click(count);
    const file = await screen.findByRole('button', { name: 'Open Waiver, PDF' });
    expect(announcementFiles).toHaveBeenCalledTimes(1);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, href: window.location.href });
    await u.click(file);
    await waitFor(() => expect(w.openDocument).toHaveBeenCalledWith('d1'));
    open.mockRestore();
    vi.unstubAllGlobals();
  });

  it('a failed read says so with Try again, which reads again', async () => {
    const announcementFiles = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'boom' })
      .mockResolvedValueOnce({ success: true, data: { files: [] } });
    show(withFiles(), writes({ announcementFiles }), 'ann');
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: /1 attachment/ })[0]!);
    expect((await screen.findByRole('alert')).textContent).toMatch('The attachments didn’t load.');
    await u.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('These files are no longer shared.')).toBeTruthy();
    expect(announcementFiles).toHaveBeenCalledTimes(2);
  });

  it('without the read (a preview set) the count stays plain text', () => {
    show(withFiles(), writes(), 'ann');
    expect(screen.queryByRole('button', { name: /1 attachment/ })).toBeNull();
    expect(screen.getAllByText('1 attachment').length).toBeGreaterThan(0);
  });
});

describe('travel is marked seen only on a player’s Travel tab, once a visit', () => {
  it('Home, Announcements and Documents never mark it; Travel does, once, however often it is opened', async () => {
    const markTravelSeen = vi.fn(ok);
    show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }));
    const u = userEvent.setup();
    for (const name of ['Announcements', 'Documents', 'Home']) {
      await u.click(screen.getByRole('tab', { name }));
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(markTravelSeen).not.toHaveBeenCalled();
    await u.click(screen.getByRole('tab', { name: 'Travel' }));
    await waitFor(() => expect(markTravelSeen).toHaveBeenCalledTimes(1));
    for (const name of ['Documents', 'Travel', 'Home', 'Travel']) await u.click(screen.getByRole('tab', { name }));
    await new Promise((r) => setTimeout(r, 10));
    expect(markTravelSeen).toHaveBeenCalledTimes(1);
  });

  it('opening Team Hub on any other tab marks nothing; a new visit on Travel marks it again', async () => {
    const markTravelSeen = vi.fn(ok);
    for (const tab of ['home', 'ann', 'docs'] as const) {
      show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }), tab);
      await new Promise((r) => setTimeout(r, 10));
      cleanup();
    }
    expect(markTravelSeen).not.toHaveBeenCalled();
    show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }), 'travel');
    await waitFor(() => expect(markTravelSeen).toHaveBeenCalledTimes(1));
    cleanup();
    show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }), 'travel');
    await waitFor(() => expect(markTravelSeen).toHaveBeenCalledTimes(2));
  });

  it('a refused mark leaves the badge alone', async () => {
    const markTravelSeen = vi.fn(() => Promise.resolve({ success: false, error: 'no' }));
    show(PREVIEW_HUB_PLAYER, writes({ markTravelSeen }), 'travel');
    await waitFor(() => expect(markTravelSeen).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(badges.refetch).not.toHaveBeenCalled();
  });
});

describe('Documents takes what Fairway’s Documents takes', () => {
  const FAIRWAY_ACCEPT =
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/svg+xml,text/plain,text/markdown,text/csv,video/mp4,video/webm,video/quicktime,application/zip';
  const sized = (f: File, bytes: number) => Object.defineProperty(f, 'size', { value: bytes });

  it('the picker offers Fairway’s exact file types', () => {
    expect(HUB_UPLOAD_ACCEPT).toBe(FAIRWAY_ACCEPT);
    show(PREVIEW_HUB_COACH, writes(), 'docs');
    expect(document.querySelector('.ch-hb-docs input[type="file"]')!.getAttribute('accept')).toBe(FAIRWAY_ACCEPT);
  });

  it('refuses a type or size the bucket would refuse, by name, before sending', () => {
    expect(uploadRefusal(new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }))).toEqual({ title: 'setup.exe can’t be shared', body: 'Team Hub takes PDF, Word, Excel, PowerPoint, images, text, CSV, video and ZIP files.' });
    expect(uploadRefusal(sized(new File(['x'], 'Film.mov', { type: 'video/quicktime' }), 26 * 1024 * 1024))).toEqual({ title: 'Film.mov is too large', body: 'Files can be up to 25 MB.' });
    // iOS gives a camera capture no type: the extension decides, as the upload itself does.
    expect(uploadRefusal(new File(['x'], 'IMG_0001.HEIC', { type: '' }))).toBeNull();
    expect(uploadRefusal(sized(new File(['x'], 'Rules.pdf', { type: 'application/pdf' }), 25 * 1024 * 1024))).toBeNull();
  });

  it('a drop of mixed files sends only the ones that can be shared and says why the others were not', async () => {
    const w = show(PREVIEW_HUB_COACH, writes(), 'docs');
    const files = [new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }), sized(new File(['x'], 'Film.mov', { type: 'video/quicktime' }), 30 * 1024 * 1024), new File(['x'], 'Rules.pdf', { type: 'application/pdf' })];
    fireEvent.drop(screen.getByRole('button', { name: /Drop files to share with the team/ }), { dataTransfer: { files } });
    await waitFor(() => expect(w.uploadDocument).toHaveBeenCalledTimes(1));
    expect((w.uploadDocument as ReturnType<typeof vi.fn>).mock.calls[0]![0].file.name).toBe('Rules.pdf');
    expect(await screen.findByText('setup.exe can’t be shared')).toBeTruthy();
    expect(screen.getByText('Film.mov is too large')).toBeTruthy();
  });

  it('nothing sendable sends nothing', async () => {
    const w = show(PREVIEW_HUB_COACH, writes(), 'docs');
    fireEvent.drop(screen.getByRole('button', { name: /Drop files to share with the team/ }), { dataTransfer: { files: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })] } });
    expect(await screen.findByText('a.exe can’t be shared')).toBeTruthy();
    expect(w.uploadDocument).not.toHaveBeenCalled();
  });
});
