import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Roster: every numbered state in docs/clubhouse/catalog/roster.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
/** A face or name goes to the player's profile where that page is rebuilt (owner, 2026-10-08); most of this file drives the
 *  peek, which a face opens where it isn't, so the profile route reads as not rebuilt unless a test turns it on. */
const profile = vi.hoisted(() => ({ rebuilt: false }));
vi.mock('../shell/nav', async (orig) => {
  const nav = await orig<typeof import('../shell/nav')>();
  return { ...nav, rebuiltHref: (href: string, role?: Parameters<typeof nav.rebuiltHref>[1]) => (href.startsWith('/golf/dashboard/stats?player=') && !profile.rebuilt ? null : nav.rebuiltHref(href, role)) };
});
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const actions = vi.hoisted(() => ({
  remove: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  requests: vi.fn(),
  intent: vi.fn(),
  status: vi.fn(),
  availability: vi.fn(),
  availabilityNote: vi.fn(),
}));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: actions.remove }));
vi.mock('@/app/golf/actions/team-management', () => ({ setPlayerAvailabilityCoachNote: actions.availabilityNote, updatePlayerStatus: actions.status, setPlayerAvailability: actions.availability }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: actions.accept, rejectJoinRequest: actions.reject, getTeamJoinRequests: actions.requests }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: actions.intent }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { attentionFor, loadRoster, type ChRoster } from '../data/roster';
import { ClubhouseRosterRoute } from '../routes/roster';
import { resolveClubhouseTeam } from '../routes/team';
import { chReport, chTrail } from '../lib/track';
import { Roster } from '../screens/roster/Roster';
import { RosterSkeleton } from '../screens/roster/RosterSkeleton';
import { NOTE_MAX } from '../screens/roster/RosterPeek';
import { availabilityLine, rowNote } from '../screens/roster/format';
import { nameList, useJoinRequests } from '../screens/roster/useJoinRequests';
import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { PREVIEW_ROSTER, PREVIEW_ROSTER_AVAILABILITY, PREVIEW_ROSTER_FAILED, PREVIEW_ROSTER_PARTIAL } from '../preview/fixtures-roster';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const tree = (data: ChRoster) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Roster data={data} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
function wrap(data: ChRoster) {
  return render(tree(data));
}
const roster = (over: Partial<ChRoster> = {}): ChRoster => ({ ...PREVIEW_ROSTER, ...over });
const fail = () => Promise.resolve({ success: false, error: 'nope' });
const theo = PREVIEW_ROSTER.players[0]!;

async function toList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'List view' }));
}
async function openRemove(user: ReturnType<typeof userEvent.setup>) {
  await toList(user);
  await user.click(screen.getByRole('button', { name: `Actions for ${theo.name}` }));
  await user.click(await screen.findByRole('menuitem', { name: 'Remove from team' }));
}
async function openPeek(user: ReturnType<typeof userEvent.setup>, name = theo.name) {
  await user.click(screen.getAllByRole('button', { name: new RegExp(name) })[0]!);
}

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  for (const f of Object.values(actions)) f.mockReset();
  actions.requests.mockResolvedValue({ success: true, data: [] });
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
  vi.mocked(chReport).mockClear();
  vi.mocked(chTrail).mockClear();
  tables.current = {};
  profile.rebuilt = false;
  router.push.mockClear();
  localStorage.clear();
});

describe('Roster · saves that fail', () => {
  it('CH-3501 CH-3001 removing asks first; a failed remove keeps the player and the dialog', async () => {
    const user = userEvent.setup();
    actions.remove.mockImplementation(fail);
    wrap(roster());
    await openRemove(user);
    await expectCode('CH-3501', /Remove Theo Marchetti from Varsity\?/);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3001', /Couldn’t remove Theo Marchetti/);
    expect(code('CH-3501')).not.toBeNull();
    expect(screen.getAllByText(theo.name).length).toBeGreaterThan(0);
  });

  it('CH-3002 31301 approving fails: the request comes back', async () => {
    const user = userEvent.setup();
    actions.accept.mockImplementation(fail);
    wrap(roster());
    const req = PREVIEW_ROSTER.requests[0]!;
    await user.click(within(screen.getByRole('region', { name: 'Join requests' })).getAllByRole('button', { name: 'Approve' })[0]!);
    await expectCode('CH-3002', new RegExp(`Couldn’t approve ${req.name}`));
    expect(screen.getByText(req.name)).toBeTruthy();
  });

  it('CH-3007 31401 approve all: every failure is named, the count added is said, and Retry re-tries only those', async () => {
    const user = userEvent.setup();
    const three = [...PREVIEW_ROSTER.requests, { id: 'r3', name: 'Sam Reyes', meta: 'Freshman', classYear: 'Freshman', gradYear: 2030, requested: 'today', handicap: null }];
    actions.accept.mockImplementation((id: string) => Promise.resolve(id === 'r1' ? { success: true } : { success: false, error: 'nope' }));
    const { result } = renderHook(() => useJoinRequests('Varsity', three), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    });
    await act(() => result.current.approveAll());
    await expectCode('CH-3007', /Couldn’t approve Owen Park and Sam Reyes/);
    expect(code('CH-3007')!.textContent).toMatch(/1 of 3 added to Varsity/);
    expect(result.current.reqs.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(actions.accept.mock.calls.map((c) => c[0])).toEqual(['r1', 'r2', 'r3']);
    expect(hapticSpy).toHaveBeenCalledWith('error');

    actions.accept.mockClear();
    actions.accept.mockResolvedValue({ success: true });
    await user.click(within(code('CH-3007') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('2 players added to Varsity')).toBeTruthy());
    expect(actions.accept.mock.calls.map((c) => c[0])).toEqual(['r2', 'r3']);
    expect(result.current.reqs).toEqual([]);
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('approve all that lands says how many were added, one success tap (D-70)', async () => {
    actions.accept.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useJoinRequests('Varsity', PREVIEW_ROSTER.requests), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    });
    await act(() => result.current.approveAll());
    expect(screen.getByText('2 players added to Varsity')).toBeTruthy();
    expect(result.current.reqs).toEqual([]);
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('CH-3003 31301 declining fails: the request comes back', async () => {
    const user = userEvent.setup();
    actions.reject.mockImplementation(fail);
    wrap(roster());
    const req = PREVIEW_ROSTER.requests[0]!;
    await user.click(within(screen.getByRole('region', { name: 'Join requests' })).getAllByRole('button', { name: 'Decline' })[0]!);
    await expectCode('CH-3003', new RegExp(`Couldn’t decline ${req.name}`));
    expect(screen.getByText(req.name)).toBeTruthy();
  });

  it('CH-3004 31201 the coach note does not save: the text stays in the field', async () => {
    const user = userEvent.setup();
    actions.intent.mockImplementation(fail);
    wrap(roster());
    await openPeek(user);
    const note = screen.getByRole('textbox', { name: /Coach’s note/ });
    await user.clear(note);
    await user.type(note, 'Work on lag putting');
    await user.tab();
    await expectCode('CH-3004', /Couldn’t save your note about Theo/);
    expect((note as HTMLTextAreaElement).value).toBe('Work on lag putting');
  });

  it('CH-3005 the export is blocked by the browser', async () => {
    const user = userEvent.setup();
    const url = URL as unknown as { createObjectURL?: unknown };
    const prev = url.createObjectURL;
    url.createObjectURL = () => {
      throw new Error('blocked');
    };
    wrap(roster());
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await expectCode('CH-3005', /Couldn’t export the roster/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    url.createObjectURL = prev;
  });

  it('CH-3006 copying the team code fails: copy it by hand', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    wrap(roster());
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await user.click((await screen.findAllByRole('button', { name: 'Copy' }))[0]!);
    await expectCode('CH-3006', /Couldn’t copy the team code/);
  });
});

describe('Roster · player status (Active / Inactive)', () => {
  async function openStatus(user: ReturnType<typeof userEvent.setup>, name = theo.name, item = 'Mark inactive') {
    await toList(user);
    await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  }
  afterEach(() => {
    delete (window.navigator as unknown as Record<string, unknown>).onLine;
  });

  it('CH-3502 CH-3404 CH-3008 marking a player inactive asks first, waits while it saves, and a failure keeps the player active and the dialog open', async () => {
    const user = userEvent.setup();
    let settle!: (v: { success: boolean; error?: string }) => void;
    actions.status.mockImplementation(() => new Promise((r) => (settle = r)));
    wrap(roster());
    await openStatus(user);
    await expectCode('CH-3502', /Move Theo Marchetti to Inactive on Varsity\?/);
    expect(code('CH-3502')!.textContent).toMatch(/stay on the team with their account and stats/);
    await user.click(within(code('CH-3502') as HTMLElement).getByRole('button', { name: 'Mark inactive' }));
    expect(actions.status).toHaveBeenCalledWith(theo.id, 'inactive');
    await expectCode('CH-3404', /Saving…/);
    expect((code('CH-3404')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => settle({ success: false, error: 'Failed to update player status' }));
    await expectCode('CH-3008', /Couldn’t mark Theo Marchetti inactive/);
    expect((code('CH-3502') as HTMLDialogElement).hasAttribute('open')).toBe(true);
    // Not destructive: no warning haptic before the write (D-70), and the row still reads Active.
    expect(hapticSpy).not.toHaveBeenCalledWith('warning');
    const row = screen.getByRole('button', { name: `${theo.name}. Open profile` }).closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText('Active')).toBeTruthy();
  });

  it('CH-3502 a status change that lands says so, moves the player to Inactive, and the menu then offers Mark active', async () => {
    const user = userEvent.setup();
    actions.status.mockResolvedValue({ success: true });
    wrap(roster());
    await openStatus(user);
    await user.click(within(code('CH-3502') as HTMLElement).getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(screen.getByText('Theo Marchetti marked inactive')).toBeTruthy());
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // Under Active he is gone; under Inactive he is listed, and his menu turns him back.
    expect(screen.queryByRole('button', { name: `${theo.name}. Open profile` })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Inactive/ }));
    await openStatus(user, theo.name, 'Mark active');
    await expectCode('CH-3502', /Move Theo Marchetti back to the active roster of Varsity\?/);
    await user.click(within(code('CH-3502') as HTMLElement).getByRole('button', { name: 'Mark active' }));
    expect(actions.status).toHaveBeenLastCalledWith(theo.id, 'active');
    await waitFor(() => expect(screen.getByText('Theo Marchetti marked active')).toBeTruthy());
  });

  it('CH-3502 CH-1903 offline, nothing is sent and the coach is told', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    wrap(roster());
    await openStatus(user);
    await user.click(within(code('CH-3502') as HTMLElement).getByRole('button', { name: 'Mark inactive' }));
    await expectCode('CH-1903', /Couldn’t mark Theo Marchetti inactive: you’re offline/);
    expect(actions.status).not.toHaveBeenCalled();
  });
});

describe('Roster · validation', () => {
  it('CH-3101 CH-3804 a note near the 2,000 limit counts down, politely', async () => {
    const user = userEvent.setup();
    const long = 'x'.repeat(NOTE_MAX - 150);
    wrap(roster({ players: [{ ...theo, coachNote: long }, ...PREVIEW_ROSTER.players.slice(1)] }));
    await openPeek(user);
    await expectCode('CH-3101', /150 characters left/);
    expect(code('CH-3101')!.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('textbox', { name: /Coach’s note/ }).getAttribute('maxlength')).toBe(String(NOTE_MAX));
  });
});

describe('Roster · reads that fail', () => {
  it('CH-3201 the roster does not load: a notice, never "no players"', async () => {
    const user = userEvent.setup();
    wrap(roster({ playersError: true, players: [] }));
    await expectCode('CH-3201', /The roster didn’t load/);
    expect(code('CH-3301')).toBeNull();
    await user.click(within(code('CH-3201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-3202 season stats do not load: the roster stays, figures read as missing', async () => {
    wrap(PREVIEW_ROSTER_PARTIAL);
    await expectCode('CH-3202', /Season stats didn’t load/);
    expect(screen.getAllByText(theo.name).length).toBeGreaterThan(0);
  });

  it('CH-3203 join requests do not load: Try again re-reads', async () => {
    const user = userEvent.setup();
    wrap(roster({ requestsError: true, requests: [] }));
    await expectCode('CH-3203', /Join requests didn’t load/);
    await user.click(within(code('CH-3203') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-1209 the roster and join requests both failing are told once under the head, with one Try again; each part keeps its title', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_ROSTER_FAILED);
    await expectCode('CH-1209', /Some of this page didn’t load.*The roster and join requests didn’t load/);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    for (const [c, title] of [['CH-3201', 'The roster didn’t load'], ['CH-3203', 'Join requests didn’t load']] as const) {
      expect(code(c)!.textContent).toBe(title);
    }
    await user.click(within(code('CH-1209') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-3204 CH-3205 CH-3206 a crash stays inside its section', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    // Jonah has a Needs a look chip, which still opens the panel after the list has crashed.
    const jonah = PREVIEW_ROSTER.players.find((p) => p.id === 'jonah')!;
    const broken = { ...jonah, trend: null as never, recent: null as never };
    wrap(roster({ requests: null as never, players: PREVIEW_ROSTER.players.map((p) => (p.id === 'jonah' ? broken : p)) }));
    expect(code('CH-3204')!.textContent).toMatch(/Join requests couldn’t be shown/);
    expect(code('CH-3205')!.textContent).toMatch(/The roster couldn’t be shown/);
    expect(screen.getByRole('heading', { name: 'Your players' })).toBeTruthy();
    await user.click(within(screen.getByRole('region', { name: 'Needs a look' })).getByRole('button', { name: /Jonah/ }));
    await expectCode('CH-3206', /The player panel couldn’t be shown/);
    quiet.mockRestore();
  });

  it('CH-3207 the team row does not load: Invite says the code did not load, not that there is none', async () => {
    tables.current = { golf_teams: { error: { message: 'boom' } } };
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(data.teamError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('roster', 'team', expect.anything(), 'teams');
    const user = userEvent.setup();
    wrap(roster({ teamError: true, joinCode: null }));
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await expectCode('CH-3207', /The team code didn’t load/);
    expect(code('CH-3304')).toBeNull();
  });

  it('CH-3208 development counts that do not load read as a dash, never 0', async () => {
    const user = userEvent.setup();
    wrap(roster({ players: [{ ...theo, focusAreas: null, goals: null }, ...PREVIEW_ROSTER.players.slice(1)] }));
    await openPeek(user);
    await expectCode('CH-3208');
    expect(code('CH-3208')!.textContent).not.toMatch(/\b0\b/);
  });

  it('CH-3212 CoachHelm counts that do not load read as dashes and say so, never 0 or "No reads yet"', async () => {
    const user = userEvent.setup();
    wrap(roster({ helm: { status: 'failed' } }));
    await openPeek(user);
    await expectCode('CH-3212');
    expect(code('CH-3212')!.textContent).not.toMatch(/\b0\b|No reads yet/);
    expect(screen.getByText('Didn’t load. Refresh to try again.')).toBeTruthy();
  });

  it('CH-3209 notes do not load: the field is locked so a blank can never overwrite a note', async () => {
    tables.current = { golf_team_members: { data: [{ status: 'active', jersey_number: null, joined_at: null, player: { id: 'p1', first_name: 'Theo', last_name: 'M' } }] }, golf_coach_player_intent: { error: { message: 'boom' } } };
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(data.notesError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('roster', 'coachNotes', expect.anything());
    const user = userEvent.setup();
    wrap(roster({ notesError: true }));
    await openPeek(user);
    const note = screen.getByRole('textbox', { name: /Coach’s note/ });
    expect(note.hasAttribute('readonly')).toBe(true);
    await expectCode('CH-3209', /can’t be edited right now/);
    await user.click(note);
    await user.tab();
    expect(actions.intent).not.toHaveBeenCalled();
  });
});

describe('Roster · empty', () => {
  it('CH-3301 no players yet: the v2 page empty state, invite first and copy the team code second', () => {
    wrap(roster({ players: [], requests: [] }));
    const el = code('CH-3301') as HTMLElement;
    expect(el.classList.contains('ch-es--page')).toBe(true);
    expect(el.getAttribute('data-ch-state')).toBe('first-run');
    expect(el.querySelector('.ch-es-shape--people')).not.toBeNull();
    expect(within(el).getByRole('heading', { level: 2, name: 'No players yet' })).toBeTruthy();
    const buttons = within(el).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Invite players', 'Copy team code']);
    // One primary per screen: the header's Invite players steps aside.
    expect(screen.getAllByRole('button', { name: 'Invite players' })).toHaveLength(1);
    // Wave 10 (A): a code or link join is instant, so the coach is not told they approve it.
    expect(el.textContent).toMatch(/Players fill this list themselves: they join with your team code or invite link, and you can remove anyone here\./);
    expect(el.textContent).not.toMatch(/approve/);
    // Wave 10 (B): with nobody on the roster the head drops its 0 counts; the team and season stay.
    expect(document.querySelector('.ch-rs-head p')).toBeNull();
    expect(document.querySelector('.ch-rs-team__name')!.textContent).toBeTruthy();
  });

  it('wave 10 the invite sheet names the team code and invite link, and says which joins are instant', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Team code')).toBeTruthy();
    expect(within(sheet).getByText(/open the invite link join .* right away\. Players already on GolfHelm who enter the code in Settings send a request you approve\./)).toBeTruthy();
    expect(within(sheet).getByText('Players who open it join right away, after making an account if they need one.')).toBeTruthy();
    expect(within(sheet).queryByText(/Join code|join request/)).toBeNull();
  });

  it('wave 10 the invite link field shows the link without its scheme, ending in the code; Copy sends the full URL', async () => {
    const user = userEvent.setup();
    delete (navigator as { share?: unknown }).share;
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    wrap(roster());
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    const field = (await screen.findByLabelText('Invite link')) as HTMLInputElement;
    expect(field.value).toBe(`${window.location.host}/golf/join/FINLEY-26`);
    expect(field.value).not.toMatch(/^https?:/);
    const sheet = screen.getByRole('dialog');
    const copies = within(sheet).getAllByRole('button', { name: 'Copy' });
    await user.click(copies[copies.length - 1]!);
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/golf/join/FINLEY-26`);
    expect(await screen.findByText('Invite link copied')).toBeTruthy();
  });

  it('CH-3302 a search with no match offers Show everyone', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'zzz');
    await expectCode('CH-3302', /No players match “zzz”/);
    await user.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(code('CH-3302')).toBeNull();
  });

  it('CH-3303 a filter with nobody in it', async () => {
    const user = userEvent.setup();
    wrap(roster({ players: PREVIEW_ROSTER.players.filter((p) => p.status === 'active') }));
    await user.click(screen.getByRole('button', { name: /Inactive/ }));
    await expectCode('CH-3303', /No inactive players/);
  });

  it('CH-3304 no team code yet: a way to make one', async () => {
    const user = userEvent.setup();
    wrap(roster({ joinCode: null }));
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await expectCode('CH-3304', /no team code yet/);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
  });

  it('CH-3305 a player with no rounds: form says what will appear', async () => {
    const user = userEvent.setup();
    wrap(roster({ players: [{ ...theo, trend: [], recent: [], rounds: 0 }, ...PREVIEW_ROSTER.players.slice(1)] }));
    await openPeek(user);
    await expectCode('CH-3305', /Form appears once rounds are posted/);
  });

  it("CH-3306 a coach with no team gets Roster's own page state, not Home's", async () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    render(<>{await ClubhouseRosterRoute()}</>);
    const el = code('CH-3306') as HTMLElement;
    expect(el.classList.contains('ch-es--page')).toBe(true);
    expect(within(el).getByRole('heading', { level: 2, name: 'You aren’t on a team yet' })).toBeTruthy();
    expect(el.textContent).toMatch(/Your players appear here once your team is set up/);
    expect(within(el).getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
    expect(el.textContent).not.toMatch(/Home/);
    expect(code('CH-2307')).toBeNull();
    // Not `.ch-rs`, which the stylesheet hides under 820px until the phone view takes over.
    expect(el.closest('main')!.className).toBe('ch-rs-none');
  });
});

describe('Roster · loading, haptics, accessibility', () => {
  it('a face (grid) or a name (list) goes to the player’s profile; only a Needs a look chip opens the peek', async () => {
    const user = userEvent.setup();
    profile.rebuilt = true;
    wrap(roster());
    await user.click(screen.getByRole('button', { name: new RegExp(`^${theo.name}.*Open profile`) }));
    expect(router.push).toHaveBeenLastCalledWith(`/golf/dashboard/stats?player=${theo.id}`);
    expect(screen.queryByRole('complementary', { name: theo.name })).toBeNull();
    await toList(user);
    await user.click(screen.getByRole('button', { name: `${theo.name}. Open profile` }));
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith(`/golf/dashboard/stats?player=${theo.id}`);
    expect(screen.queryByRole('complementary')).toBeNull();
    await user.click(within(screen.getByRole('region', { name: 'Needs a look' })).getByRole('button', { name: /Jonah/ }));
    expect(await screen.findByRole('complementary', { name: 'Jonah Okafor' })).toBeTruthy();
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it('CH-3401 the route skeleton is busy', () => {
    render(<RosterSkeleton />);
    expect(code('CH-3401')!.getAttribute('aria-busy')).toBe('true');
  });

  it('CH-3401 the desktop skeleton draws the head\'s two actions and where the team sits before the toolbar (2026-10-18)', () => {
    render(<RosterSkeleton />);
    const desk = code('CH-3401')!.querySelector('.ch-rs-skel-desk')!;
    expect(desk.querySelector('.ch-rs-head .ch-rs-head__act')!.children).toHaveLength(2);
    expect([...desk.children].map((c) => c.className.split(' ')[0])).toEqual(['ch-rs-head', 'ch-rs-sp', 'ch-rs-bar', 'ch-rs-faces']);
  });

  it('CH-3402 removing shows its progress and cannot be pressed twice', async () => {
    const user = userEvent.setup();
    actions.remove.mockImplementation(() => new Promise(() => {}));
    wrap(roster());
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3402', /Removing…/);
    expect((code('CH-3402')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('CH-3701 CH-3702 opening a player ticks; an export lands with a success tap (D-70)', async () => {
    const user = userEvent.setup();
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = () => 'blob:x';
    url.revokeObjectURL = () => {};
    wrap(roster());
    await openPeek(user);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    [url.createObjectURL, url.revokeObjectURL] = prev;
  });

  it('CH-3801 the list view is a table: every value sits in a cell under a header', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await toList(user);
    const table = screen.getByRole('table', { name: 'Roster' });
    for (const row of table.querySelectorAll('[role="row"]'))
      for (const child of row.children) expect(['cell', 'columnheader']).toContain(child.getAttribute('role'));
  });

  it('CH-3802 a player card reads its status as a word; the dot is decoration, drawn only under All (P003-A3)', async () => {
    const user = userEvent.setup();
    wrap(roster());
    const card = screen.getAllByRole('button', { name: new RegExp(theo.name) })[0]!;
    expect(card.textContent).toMatch(/Active/);
    // Under Active every dot is the same, so none is drawn.
    expect(card.querySelector('.ch-rs-face__dot')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All' }));
    const all = screen.getAllByRole('button', { name: new RegExp(theo.name) })[0]!;
    expect(all.querySelector('.ch-rs-face__dot')!.getAttribute('aria-hidden')).toBe('true');
  });

  it("View insights, the row menu's first item, opens CoachHelm's Deep dive of that player", async () => {
    const user = userEvent.setup();
    wrap(roster());
    await toList(user);
    await user.click(screen.getByRole('button', { name: `Actions for ${theo.name}` }));
    const items = await screen.findAllByRole('menuitem');
    expect(items[0]!.textContent).toBe('View insights');
    expect(items[0]!.getAttribute('href')).toBe(`/golf/dashboard/coachhelm?view=deep-dive&player=${theo.id}`);
  });

  it("Schedule 1:1 in the player panel opens Calendar's editor with only that player invited (D-52)", async () => {
    const user = userEvent.setup();
    wrap(roster());
    await openPeek(user);
    const panel = screen.getByRole('complementary', { name: theo.name });
    expect(within(panel).getByRole('link', { name: 'Schedule 1:1' }).getAttribute('href')).toBe(`/golf/dashboard/calendar?new=1&with=${theo.id}`);
  });

  it('desktop player Message keeps the selected player target, including keyboard activation', async () => {
    const user = userEvent.setup();
    wrap(roster());
    const targets: string[] = [];
    for (const p of [theo, PREVIEW_ROSTER.players[3]!]) {
      await openPeek(user, p.name);
      const panel = await screen.findByRole('complementary', { name: p.name });
      const message = within(panel).getByRole('link', { name: /^Message$/ });
      const expected = `/golf/dashboard/messages?player=${encodeURIComponent(p.id)}`;
      expect(message.getAttribute('href')).toBe(expected);
      message.addEventListener('click', (event) => {
        event.preventDefault();
        targets.push(message.getAttribute('href')!);
      });
      message.focus();
      await user.keyboard('{Enter}');
      expect(targets.at(-1)).toBe(expected);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('complementary', { name: p.name })).toBeNull());
    }
    expect(new Set(targets).size).toBe(2);
  });

  it('desktop row Message menu keeps each row target when opened with the keyboard', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await toList(user);
    for (const p of [theo, PREVIEW_ROSTER.players[3]!]) {
      screen.getByRole('button', { name: `Actions for ${p.name}` }).focus();
      await user.keyboard('{Enter}');
      const message = await screen.findByRole('menuitem', { name: /^Message$/ });
      expect(message.getAttribute('href')).toBe(`/golf/dashboard/messages?player=${encodeURIComponent(p.id)}`);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  it('CH-3803 Esc closes the player panel, but not while typing a note', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await openPeek(user);
    const note = screen.getByRole('textbox', { name: /Coach’s note/ });
    await user.click(note);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: theo.name })).not.toBeNull();
    note.blur();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: theo.name })).toBeNull());
  });
});

describe('Roster · phone (docs/clubhouse/phone/roster.md)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    // The phone's profile links are the production ones (the stats page is rebuilt).
    profile.rebuilt = true;
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    router.back.mockClear();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });
  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const phone = (data: ChRoster) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <Roster data={data} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );
  const names = (list: string) =>
    within(screen.getByRole('list', { name: list }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label')!.split(',')[0]);
  const profileHeading = (name: string) => screen.queryByRole('heading', { level: 2, name });

  it('the top bar is the section title Roster (no "‹ More") and Invite players, which opens the invite sheet', async () => {
    const user = userEvent.setup();
    phone(roster());
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'Roster' })).toBeTruthy();
    expect(within(top).queryByRole('button', { name: 'Back to More' })).toBeNull();
    await user.click(within(top).getByRole('button', { name: 'Invite players' }));
    expect(await screen.findByText('FINLEY-26')).toBeTruthy();
    // An icon action that isn't a primary button is silent (D-70).
    expect(hapticSpy).not.toHaveBeenCalledWith('press');
  });

  it('CH-3301 no players yet on the phone: Invite players first and Copy team code second, as the board draws it', () => {
    phone(roster({ players: [], requests: [] }));
    const el = code('CH-3301') as HTMLElement;
    expect(within(el).getAllByRole('button').map((b) => b.textContent)).toEqual(['Invite players', 'Copy team code']);
    // Wave 10 (C): the top bar's invite icon steps aside while the empty state carries the primary.
    expect(screen.getAllByRole('button', { name: 'Invite players' })).toHaveLength(1);
    // Wave 10 (B): the kicker drops "0 active".
    expect(document.querySelector('.ch-rsm-kicker')!.textContent).not.toMatch(/active/);
  });

  it('wave 10 (C) the phone top bar keeps its invite icon when the roster failed to load', () => {
    phone(roster({ players: [], playersError: true }));
    expect(screen.getByRole('button', { name: 'Invite players' })).toBeTruthy();
  });

  it('30101 CH-3701 the phone opens on the list: active players by average, then Inactive; SG and Name (by last name, D-59) re-sort with a tick', async () => {
    const user = userEvent.setup();
    phone(roster());
    expect(names('Active players')).toEqual(['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Jonah Okafor', 'Eli Brandt', 'Priya Natarajan', 'Luca Ferraro']);
    expect(names('Inactive')).toEqual(['Mia Thornton']);
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(names('Active players')).toEqual(['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Luca Ferraro']);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('radio', { name: 'Name' }));
    expect(names('Active players')).toEqual(['Sofia Alvarez', 'Eli Brandt', 'Luca Ferraro', 'Ava Lindqvist', 'Theo Marchetti', 'Priya Natarajan', 'Jonah Okafor']);
  });

  it('CH-3806 a row is one button that reads name, class, note, average and handicap; the spark needs three rounds (D-57)', () => {
    phone(roster());
    const jonah = screen.getByRole('button', { name: 'Jonah Okafor, Sophomore, Scoring up 2.1, average 74.1, handicap 3.9' });
    expect(jonah.getAttribute('data-ch-code')).toBe('CH-3806');
    expect(jonah.querySelector('.ch-rsm-row__spark')?.getAttribute('aria-hidden')).toBe('true');
    const luca = screen.getByRole('button', { name: /^Luca Ferraro, Freshman, Early read · 2 rounds/ });
    expect(luca.querySelector('svg')).toBeNull();
    expect(screen.getByRole('button', { name: /^Mia Thornton, Junior, inactive, Improving, average 73.8/ })).toBeTruthy();
  });

  it('31901 CH-1906 a player is a pushed screen: a history entry, "‹ Roster" and the back gesture both pop it', async () => {
    const user = userEvent.setup();
    phone(roster());
    await user.click(screen.getByRole('button', { name: /^Jonah Okafor/ }));
    expect((window.history.state as { chPhone?: number } | null)?.chPhone).toBe(1);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(profileHeading('Jonah Okafor')).toBeTruthy();
    expect(screen.getByText('Sophomore · Class of 2029')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Message' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=jonah');
    expect(screen.getByRole('link', { name: 'Plan 1:1' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1&with=jonah');
    expect(screen.getByRole('link', { name: 'All 21 rounds this season' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=jonah&window=season&tab=rounds');
    // Real facts only (D-51): no birthday, home course or major.
    expect(screen.getByText('Hometown')).toBeTruthy();
    expect(screen.queryByText(/Birthday|Home course/)).toBeNull();
    expect(screen.getByRole('textbox', { name: /Coach.s note/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to Roster' }));
    await waitFor(() => expect(profileHeading('Jonah Okafor')).toBeNull());

    await user.click(screen.getByRole('button', { name: /^Eli Brandt/ }));
    expect(profileHeading('Eli Brandt')).toBeTruthy();
    act(() => window.history.back());
    await waitFor(() => expect(profileHeading('Eli Brandt')).toBeNull());
  });

  it('30102 a link with ?player= opens the profile once; an inactive player is labelled (D-58)', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=mia');
    phone(roster());
    expect(profileHeading('Mia Thornton')).toBeTruthy();
    expect(screen.getByText('Junior · Class of 2028 · Inactive')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it("CH-3501 ⋯ opens the action sheet; Remove from team asks first, and a removed player's profile closes", async () => {
    const user = userEvent.setup();
    actions.remove.mockResolvedValue({ success: true });
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster());
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    expect(within(sheet).getByRole('link', { name: 'View stats' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=theo');
    await user.click(within(sheet).getByRole('button', { name: 'Remove from team' }));
    await expectCode('CH-3501', /Remove Theo Marchetti from Varsity/);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await waitFor(() => expect(profileHeading('Theo Marchetti')).toBeNull());
    expect(screen.queryByRole('button', { name: /^Theo Marchetti/ })).toBeNull();
  });

  it("CH-3502 the profile's ⋯ sheet marks a player inactive, asking first", async () => {
    const user = userEvent.setup();
    actions.status.mockResolvedValue({ success: true });
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster());
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    await user.click(within(sheet).getByRole('button', { name: 'Mark inactive' }));
    await expectCode('CH-3502', /Move Theo Marchetti to Inactive on Varsity\?/);
    await user.click(within(code('CH-3502') as HTMLElement).getByRole('button', { name: 'Mark inactive' }));
    expect(actions.status).toHaveBeenCalledWith('theo', 'inactive');
    // The open profile reads the new status in its identity line (D-58).
    await waitFor(() => expect(screen.getByText(/· Inactive$/)).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2, name: 'Theo Marchetti' })).toBeTruthy();
  });

  it('the join requests banner opens the sheet; approving one leaves the banner counting the rest', async () => {
    const user = userEvent.setup();
    actions.accept.mockResolvedValue({ success: true });
    phone(roster());
    await user.click(screen.getByRole('button', { name: /2 join requests/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Join requests' });
    expect(within(sheet).getByText('2 waiting · Varsity')).toBeTruthy();
    expect(within(sheet).getByText('Requested yesterday')).toBeTruthy();
    expect(within(sheet).getByText('FINLEY-26')).toBeTruthy();
    await user.click(within(sheet).getAllByRole('button', { name: 'Approve' })[0]!);
    await waitFor(() => expect(within(sheet).queryByText('Grace Liu')).toBeNull());
    expect(screen.getByRole('button', { name: /1 join request/ })).toBeTruthy();
  });

  it('CH-3403 Approve all shows its progress and cannot be pressed twice; the sheet closes once every request is in', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    actions.accept.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ success: true }))));
    phone(roster());
    await user.click(screen.getByRole('button', { name: /2 join requests/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Join requests' });
    await user.click(within(sheet).getByRole('button', { name: 'Approve all 2' }));
    await expectCode('CH-3403', /Approving…/);
    expect((code('CH-3403')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    act(() => finish());
    await waitFor(() => expect(actions.accept).toHaveBeenCalledTimes(2));
    act(() => finish());
    await waitFor(() => expect(screen.getByText('2 players added to Varsity')).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('button', { name: /join request/ })).toBeNull());
  });

  it('CH-3203 join requests that did not load say so in the banner slot', () => {
    phone(roster({ requestsError: true, requests: [] }));
    expect(code('CH-3203')!.textContent).toMatch(/Join requests didn’t load/);
  });

  it('CH-1209 on the phone, the roster and join requests failing are one notice under the head with one Try again', () => {
    phone(PREVIEW_ROSTER_FAILED);
    expect(code('CH-1209')!.textContent).toMatch(/Some of this page didn’t load.*The roster and join requests didn’t load/);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    expect([code('CH-3201')!.textContent, code('CH-3203')!.textContent]).toEqual(['The roster didn’t load', 'Join requests didn’t load']);
  });

  it('CH-3202 season stats that did not load: the profile says so instead of "no rounds"', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster({ statsError: true, players: PREVIEW_ROSTER.players.map((p) => ({ ...p, avg: null, sgPerRound: null, trend: [], recent: [], rounds: 0, form: 'early', attention: null })) }));
    expect(screen.getAllByText(/Season stats didn’t load/).length).toBeGreaterThan(0);
    expect(code('CH-3305')).toBeNull();
  });

  it('30102 a ?player= for someone who is not on this roster opens nothing, and the address is still cleaned', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=someone-else');
    phone(roster());
    expect(screen.getByRole('list', { name: 'Active players' })).toBeTruthy();
    expect(document.querySelector('.ch-rsm-prof')).toBeNull();
    expect((window.history.state as { chPhone?: number } | null)?.chPhone ?? 0).toBe(0);
    expect(window.location.search).toBe('');
  });

  it('31203 a note saved in the profile reads back when the player is opened again', async () => {
    const user = userEvent.setup();
    actions.intent.mockResolvedValue({ ok: true });
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster());
    await user.type(screen.getByRole('textbox', { name: /Coach.s note/ }), 'Lag putting drills');
    await user.tab();
    expect(await screen.findByText('Note saved for Theo')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to Roster' }));
    await waitFor(() => expect(profileHeading('Theo Marchetti')).toBeNull());
    await user.click(screen.getByRole('button', { name: /^Theo Marchetti/ }));
    expect((screen.getByRole('textbox', { name: /Coach.s note/ }) as HTMLTextAreaElement).value).toBe('Lag putting drills');
  });

  it('availability on the phone: the kicker counts injured and away, a row reads "Junior · Injured" in plain ink', () => {
    phone(PREVIEW_ROSTER_AVAILABILITY);
    expect(document.querySelector('.ch-rsm-kicker')!.textContent).toBe('Varsity · 7 active · 1 injured · 1 away');
    const ava = screen.getByRole('button', { name: /^Ava Lindqvist, Junior, Injured/ });
    expect(ava.querySelector('.ch-rsm-row__b > span')!.textContent).toBe('Junior · Injured');
    // Plain ink: the availability word takes no tone class (red is under par; CH-3809).
    expect(ava.querySelector('.ch-rsm-row__b > span > span')!.className).toBe('');
    expect(screen.getByRole('button', { name: /^Luca Ferraro, Freshman, Away/ })).toBeTruthy();
  });

  it('CH-3009 the phone profile says the word in its identity line and sets availability in its own panel above the note; the ⋯ sheet is unchanged', async () => {
    const user = userEvent.setup();
    actions.availability.mockResolvedValue({ success: true });
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=ava');
    phone(PREVIEW_ROSTER_AVAILABILITY);
    expect(screen.getByText('Junior · Class of 2028 · Injured')).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: 'Availability for Ava Lindqvist' });
    expect(within(group).getByRole('radio', { name: 'Injured' }).getAttribute('aria-checked')).toBe('true');
    // The panel sits above the coach's note.
    const panels = [...document.querySelectorAll('.ch-rsm-prof > section')];
    const at = (el: Element) => panels.indexOf(el.closest('section')!);
    expect(at(group)).toBe(at(screen.getByRole('textbox', { name: /Coach.s note/ })) - 1);
    await user.click(within(group).getByRole('radio', { name: 'Available' }));
    expect(actions.availability).toHaveBeenCalledWith({ playerId: 'ava', availability: 'available' });
    await waitFor(() => expect(screen.getByText('Junior · Class of 2028')).toBeTruthy());
    expect(await screen.findByText('Ava Lindqvist marked available')).toBeTruthy();
    // The word only: no availability note field, injured or not (teammates could read it).
    expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ava Lindqvist' });
    expect([...sheet.querySelectorAll('.ch-rsm-act b')].map((b) => b.textContent)).toEqual(['View stats', 'Mark inactive', 'Remove from team']);
  });
});

/** Availability (P003): can they play. Display only, never team access; coaches only. */
describe('Roster · availability (injured, away)', () => {
  const ava = PREVIEW_ROSTER_AVAILABILITY.players.find((p) => p.id === 'ava')!;
  const luca = PREVIEW_ROSTER_AVAILABILITY.players.find((p) => p.id === 'luca')!;
  const menuLabels = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    return menuLabels();
  };
  const metaOf = (name: string) => screen.getByRole('button', { name: `${name}. Open profile` }).querySelector('.ch-rs-who__m')!;

  it('CH-3009 the row menu offers the two states the player is not in, between the links and Mark inactive', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_ROSTER_AVAILABILITY);
    await toList(user);
    const cases: Array<[string, string[], string]> = [
      [theo.name, ['Mark injured', 'Mark away'], 'Mark available'],
      [ava.name, ['Mark available', 'Mark away'], 'Mark injured'],
      [luca.name, ['Mark available', 'Mark injured'], 'Mark away'],
    ];
    for (const [name, pair, absent] of cases) {
      const labels = await openMenu(user, name);
      const at = labels.indexOf(pair[0]!);
      expect(labels.slice(at, at + 4)).toEqual([...pair, 'Mark inactive', 'Remove from team']);
      expect(labels).not.toContain(absent);
      // A separator on either side of the pair.
      const items = [...screen.getByRole('menu').querySelectorAll('[role="menuitem"], [role="separator"]')].map((el) => el.getAttribute('role') === 'separator' ? '|' : el.textContent);
      const i = items.indexOf(pair[0]!);
      expect([items[i - 1], items[i + 2]]).toEqual(['|', '|']);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  it('CH-3009 CH-3405 Mark injured shows the word at once, puts the player back when the save fails, and Retry finishes it', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    actions.availability.mockImplementationOnce(() => new Promise((r) => (answer = r))).mockResolvedValue({ success: true });
    wrap(roster());
    await toList(user);
    await openMenu(user, 'Jonah Okafor');
    await user.click(screen.getByRole('menuitem', { name: 'Mark injured' }));
    // Optimistic: the row reads Injured before the server answers.
    expect(metaOf('Jonah Okafor').textContent).toBe('Injured · Sophomore · Charlotte, NC');
    expect(actions.availability).toHaveBeenCalledWith({ playerId: 'jonah', availability: 'injured' });
    await act(async () => answer({ success: false }));
    await expectCode('CH-3009', /Couldn’t mark Jonah Okafor injured/);
    expect(code('CH-3009')!.textContent).toMatch(/Nothing changed on the roster/);
    expect(metaOf('Jonah Okafor').textContent).toBe('Sophomore · Charlotte, NC');
    expect(hapticSpy).toHaveBeenCalledWith('error');
    await user.click(within(code('CH-3009') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(metaOf('Jonah Okafor').textContent).toBe('Injured · Sophomore · Charlotte, NC'));
    expect(await screen.findByText('Jonah Okafor marked injured')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(actions.availability).toHaveBeenCalledTimes(2);
  });

  it('CH-3009 the success toast from the row menu has no action: there is no note to add', async () => {
    const user = userEvent.setup();
    actions.availability.mockResolvedValue({ success: true });
    wrap(roster());
    await toList(user);
    await openMenu(user, theo.name);
    await user.click(screen.getByRole('menuitem', { name: 'Mark away' }));
    expect(await screen.findByText('Theo Marchetti marked away')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a note' })).toBeNull();
    expect(actions.availability).toHaveBeenCalledWith({ playerId: 'theo', availability: 'away' });
  });

  it('CH-3405 while a change is in flight the panel says so and refuses another', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    actions.availability.mockImplementation(() => new Promise((r) => (answer = r)));
    wrap(roster());
    await openPeek(user);
    const group = screen.getByRole('radiogroup', { name: `Availability for ${theo.name}` });
    await user.click(within(group).getByRole('radio', { name: 'Injured' }));
    await expectCode('CH-3405');
    expect(code('CH-3405')!.getAttribute('aria-busy')).toBe('true');
    await user.click(within(group).getByRole('radio', { name: 'Away' }));
    expect(actions.availability).toHaveBeenCalledTimes(1);
    await act(async () => answer({ success: true }));
    await waitFor(() => expect(code('CH-3405')).toBeNull());
    expect(within(group).getByRole('radio', { name: 'Injured' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the panel says the word, when it changed and what it never does, and has no note field while the notes table is not there', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_ROSTER_AVAILABILITY);
    // Ava's card opens the panel (the profile route is not rebuilt in this file).
    await user.click(screen.getByRole('button', { name: /^Ava Lindqvist/ }));
    const panel = await screen.findByRole('complementary', { name: ava.name });
    expect(within(panel).getByText('Junior · Class of 2028 · Injured')).toBeTruthy();
    expect(within(panel).getByText('Updated 3 days ago')).toBeTruthy();
    expect(within(panel).getByText('Shows on your roster only. It never changes their team access; Mark inactive does.')).toBeTruthy();
    expect(within(panel).queryByRole('textbox', { name: 'Note' })).toBeNull();
    expect(within(panel).queryByText('Only coaches see this.')).toBeNull();
    expect(code('CH-3010')).toBeNull();
    expect(code('CH-3102')).toBeNull();
  });

  it('CH-3011 with the coach-only notes table, an out player gets a Why field that saves on leaving it; an available player and a missing table get none', async () => {
    const user = userEvent.setup();
    actions.availabilityNote.mockResolvedValue({ success: true });
    wrap({ ...PREVIEW_ROSTER_AVAILABILITY, availabilityCoachNotes: true, players: PREVIEW_ROSTER_AVAILABILITY.players.map((p) => (p.id === 'ava' ? { ...p, availabilityCoachNote: 'wrist, back by Friday' } : p)) });
    await user.click(screen.getByRole('button', { name: /^Ava Lindqvist/ }));
    const panel = await screen.findByRole('complementary', { name: ava.name });
    const why = within(panel).getByRole('textbox', { name: /Why/ }) as HTMLTextAreaElement;
    expect(why.value).toBe('wrist, back by Friday');
    expect(within(panel).getByText('Only coaches on this team see this')).toBeTruthy();
    expect(why.maxLength).toBe(280);
    // Leaving it unchanged writes nothing.
    await user.click(why);
    await user.tab();
    expect(actions.availabilityNote).not.toHaveBeenCalled();
    await user.clear(why);
    await user.type(why, '  hamstring  ');
    await user.tab();
    expect(actions.availabilityNote).toHaveBeenCalledWith({ playerId: 'ava', note: 'hamstring' });
    // Emptying it removes the note (null, not an empty string).
    await user.clear(why);
    await user.tab();
    expect(actions.availabilityNote).toHaveBeenLastCalledWith({ playerId: 'ava', note: null });
  });

  it('CH-3011 a note that does not save says so and keeps the text in the field', async () => {
    const user = userEvent.setup();
    actions.availabilityNote.mockResolvedValue({ success: false, error: 'Failed to save the note' });
    wrap({ ...PREVIEW_ROSTER_AVAILABILITY, availabilityCoachNotes: true });
    await user.click(screen.getByRole('button', { name: /^Ava Lindqvist/ }));
    const panel = await screen.findByRole('complementary', { name: ava.name });
    const why = within(panel).getByRole('textbox', { name: /Why/ }) as HTMLTextAreaElement;
    await user.type(why, 'concussion protocol');
    await user.tab();
    await expectCode('CH-3011');
    expect(why.value).toBe('concussion protocol');
  });

  it('the Why field is not drawn for an available player, even with the notes table', async () => {
    const user = userEvent.setup();
    wrap({ ...roster(), availabilityCoachNotes: true });
    await openPeek(user);
    expect(screen.queryByRole('textbox', { name: /Why/ })).toBeNull();
  });

  it('the loader reads the coach-only notes by team; a missing table reads as notes not available, quietly; another failure is logged and also hides the field', async () => {
    const member = { status: 'active', jersey_number: null, joined_at: null, availability: 'injured', availability_updated_at: null, player: { id: 'p1', first_name: 'Ava', last_name: 'L' } };
    tables.current = { golf_team_members: () => ({ data: [member] }), golf_player_availability_coach_notes: () => ({ data: [{ player_id: 'p1', note: 'wrist' }] }) };
    let data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(data.availabilityCoachNotes).toBe(true);
    expect(data.players[0]!.availabilityCoachNote).toBe('wrist');
    logServer.mockClear();
    tables.current = { golf_team_members: () => ({ data: [member] }), golf_player_availability_coach_notes: () => ({ error: { code: 'PGRST205', message: 'missing' } }) };
    data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(data.availabilityCoachNotes).toBe(false);
    expect(data.players[0]!.availabilityCoachNote).toBeNull();
    expect(logServer).not.toHaveBeenCalledWith('roster', 'availabilityCoachNotes', expect.anything());
    tables.current = { golf_team_members: () => ({ data: [member] }), golf_player_availability_coach_notes: () => ({ error: { code: '57014', message: 'timeout' } }) };
    data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(data.availabilityCoachNotes).toBe(false);
    expect(logServer).toHaveBeenCalledWith('roster', 'availabilityCoachNotes', expect.objectContaining({ code: '57014' }));
  });

  it('CH-3809 the head counts injured and away among the active; the list, faces and labels say it in words, never a colour', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_ROSTER_AVAILABILITY);
    expect(document.querySelector('.ch-rs-head p')!.textContent).toBe('8 players · 7 active · 1 injured · 1 away. Team average 73.6 over the season.');
    // Faces: the note slot holds the line in plain ink, and the card's name says the word.
    const face = screen.getByRole('button', { name: /^Ava Lindqvist, scoring average 72\.4, 3 of 6, injured\. Open profile$/ });
    const slot = face.querySelector('.ch-rs-face__note')!;
    expect(slot.textContent).toBe('Injured');
    expect(slot.className).toBe('ch-rs-face__note is-availability');
    expect(screen.getByRole('button', { name: /^Luca Ferraro.*, away\. Open profile$/ })).toBeTruthy();
    await toList(user);
    const meta = metaOf(ava.name);
    expect(meta.textContent).toBe('Injured · Junior · Gothenburg, SE');
    expect(meta.getAttribute('title')).toBe(meta.textContent);
    expect(meta.querySelector('.ch-rs-who__avail')!.textContent).toBe('Injured');
    // The Status column is team access, untouched.
    const row = screen.getAllByRole('row').find((r) => within(r).queryByRole('button', { name: `${ava.name}. Open profile` }))!;
    expect(row.querySelector('.ch-rs-status')!.textContent).toBe('Active');
    // Teammates who are out are not asked about under Needs a look.
    expect(within(screen.getByRole('region', { name: 'Needs a look' })).queryByRole('button', { name: /Ava|Luca/ })).toBeNull();
  });

  it('the export adds Availability after Status, the word only (no note column)', async () => {
    const user = userEvent.setup();
    let blob: Blob | undefined;
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = (b: Blob) => {
      blob = b;
      return 'blob:x';
    };
    url.revokeObjectURL = () => {};
    wrap(PREVIEW_ROSTER_AVAILABILITY);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    const lines = (await blob!.text()).split('\n');
    expect(lines[0]).toBe('Player,Class,Status,Availability,Rounds,Scoring avg,SG per round,Handicap');
    expect(lines.find((l) => l.startsWith('"Ava Lindqvist"'))).toMatch(/^"Ava Lindqvist","Junior","active","Injured","19"/);
    expect(lines.find((l) => l.startsWith('"Luca Ferraro"'))).toContain('"active","Away","2"');
    expect(lines.find((l) => l.startsWith('"Theo Marchetti"'))).toContain('"active","Available","24"');
    [url.createObjectURL, url.revokeObjectURL] = prev;
  });

  it('Needs a look leaves out a player who is out, and the row note is the availability word', () => {
    const s = { rounds: 10, avg: 74, sgPerRound: null, trend: [], status: 'slipping', formChange: 2.1, recent: [], lastRoundDate: null } as unknown as Parameters<typeof attentionFor>[0];
    const now = new Date('2026-10-21T12:00:00Z');
    expect(attentionFor(s, now, true)).toEqual({ tone: 'warning', text: 'Scoring up 2.1' });
    expect(attentionFor(s, now, true, 'injured')).toBeNull();
    expect(attentionFor(s, now, true, 'away')).toBeNull();
    expect(rowNote(ava, false)).toEqual({ text: 'Injured', tone: null });
    expect(rowNote(luca, true)).toEqual({ text: 'Away', tone: null });
    expect(availabilityLine(theo)).toBeNull();
  });

  it('the loader reads availability with the membership (never the note), and an unknown value reads as available', async () => {
    let membersSelect = '';
    tables.current = {
      golf_team_members: (f) => {
        membersSelect = String(f.find(([k]) => k === 'select')![1][0]);
        return {
          data: [
            { status: 'active', jersey_number: null, joined_at: null, availability: 'injured', availability_note: ' wrist ', availability_updated_at: '2026-10-18T10:00:00Z', player: { id: 'p1', first_name: 'Ava', last_name: 'L' } },
            { status: 'inactive', jersey_number: null, joined_at: null, availability: 'away', availability_note: 'visa', availability_updated_at: null, player: { id: 'p2', first_name: 'Mia', last_name: 'T' } },
            { status: 'active', jersey_number: null, joined_at: null, availability: 'mystery', availability_note: 'kept out', availability_updated_at: null, player: { id: 'p3', first_name: 'Theo', last_name: 'M' } },
          ],
        };
      },
    };
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(membersSelect).toMatch(/^status, jersey_number, joined_at, availability, availability_updated_at, player:golf_players\(/);
    // Teammates can read every column of their team's rows (select_v5), so the note is never selected or carried.
    expect(membersSelect).not.toContain('availability_note');
    const by = Object.fromEntries(data.players.map((p) => [p.id, [p.availability, p.availabilityUpdated]]));
    expect(by).toEqual({ p1: ['injured', '2026-10-18T10:00:00Z'], p2: ['away', null], p3: ['available', null] });
    for (const p of data.players) expect(p).not.toHaveProperty('availabilityNote');
  });

  it('no roster loader or screen names the teammate-readable availability_note column (the reason lives in the coach-only table)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ['../data/roster.ts', '../screens/roster/Roster.tsx', '../screens/roster/RosterPeek.tsx', '../screens/roster/RosterProfile.tsx', '../screens/roster/RosterPhone.tsx', '../screens/roster/format.ts']) {
      const src = readFileSync(resolve(here, file), 'utf8');
      expect(src.replace(/^\s*(\/\/|\*).*$/gm, ''), file).not.toMatch(/availability_note|availabilityNote/);
    }
  });
});

/** P003 behaviour contracts with no catalog row (config/clubhouse/bridge-contracts.json, D-69). */
describe('Roster · behaviour contracts (P003, docs/clubhouse/pages/P003-roster/CONTRACT.md)', () => {
  const region = () => screen.getByRole('region', { name: 'Join requests' });
  const requestNames = () => [...region().querySelectorAll('.ch-rs-req__who b')].map((b) => b.textContent);
  const cardNames = () => [...document.querySelectorAll('.ch-rs-face__name')].map((n) => n.textContent);
  const noteField = () => screen.getByRole('textbox', { name: /Coach’s note/ }) as HTMLTextAreaElement;
  const member = (id: string, name: string) => ({ status: 'active', jersey_number: null, joined_at: null, player: { id, first_name: name, last_name: 'M' } });

  it('30101 Roster opens on the active players by average, with the team line, Needs a look and the join requests', () => {
    wrap(roster());
    expect(screen.getByRole('heading', { level: 1, name: 'Your players' })).toBeTruthy();
    expect(document.querySelector('.ch-rs-team__name')!.textContent).toBe('Varsity · Fall 2026');
    // The card's team strip has its own class: the header's avatar row (.ch-rs-team) never takes the strip's bar styles.
    expect(document.querySelector('.ch-rs-head .ch-rs-strip')).toBeNull();
    const rosterCss = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/roster.css'), 'utf8');
    expect(rosterCss).not.toMatch(/\.ch-rs-team,\s*\.ch-rs-sgbar/);
    expect(rosterCss).toMatch(/\.ch-rs-strip,\s*\.ch-rs-sgbar/);
    expect(document.querySelector('.ch-rs-head p')!.textContent).toBe('8 players · 7 active. Team average 73.6 over the season.');
    expect(cardNames()).toEqual(['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Jonah Okafor', 'Eli Brandt', 'Priya Natarajan', 'Luca Ferraro']);
    expect(screen.getByRole('button', { name: 'Active · 7' }).getAttribute('aria-pressed')).toBe('true');
    const attn = within(screen.getByRole('region', { name: 'Needs a look' }));
    for (const first of ['Jonah', 'Eli', 'Priya']) expect(attn.getByRole('button', { name: new RegExp(first) })).toBeTruthy();
    expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('30102 desktop ignores ?player=: no panel opens and the address is left as it was', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    try {
      wrap(roster());
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(window.location.search).toBe('?player=theo');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('30303 31402 Try again asks the server again, and what comes back replaces the first copy: an approved player appears, and a failed read never turns into "No players yet"', async () => {
    const user = userEvent.setup();
    const view = render(tree(roster({ playersError: true, players: [], requestsError: true, requests: [] })));
    // Two failed reads: the page's one notice carries the Try again (CH-1209).
    await user.click(within(code('CH-1209') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The server's answer arrives as new props.
    view.rerender(tree(roster()));
    expect(code('CH-3201')).toBeNull();
    expect(code('CH-3301')).toBeNull();
    expect(cardNames()).toContain(theo.name);
    expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']);
    // Approve one: the write revalidates the page, and the new player is on the roster.
    actions.accept.mockResolvedValue({ success: true });
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    await waitFor(() => expect(requestNames()).toEqual(['Owen Park']));
    const grace = { ...theo, id: 'grace', name: 'Grace Liu', firstName: 'Grace', classYear: 'Freshman', gradYear: 2030, rounds: 0, avg: null, sgPerRound: null, trend: [], recent: [], form: 'early' as const, attention: null, coachNote: null, jersey: null };
    view.rerender(tree(roster({ players: [...PREVIEW_ROSTER.players, grace], requests: [PREVIEW_ROSTER.requests[1]!] })));
    expect(cardNames()).toContain('Grace Liu');
    expect(requestNames()).toEqual(['Owen Park']);
  });

  it('30701 offline, a removal, an approval, a decline, Approve all and a note send nothing and change nothing on screen; Export still works', async () => {
    const user = userEvent.setup();
    const offline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = () => 'blob:x';
    url.revokeObjectURL = () => {};
    wrap(roster());
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await screen.findByText('Couldn’t approve Grace Liu: you’re offline')).toBeTruthy();
    await user.click(within(region()).getAllByRole('button', { name: 'Decline' })[1]!);
    expect(await screen.findByText('Couldn’t decline Owen Park’s request: you’re offline')).toBeTruthy();
    expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']);
    await openPeek(user);
    await user.type(noteField(), 'x');
    await user.tab();
    expect(await screen.findByText('Couldn’t save your note about Theo: you’re offline')).toBeTruthy();
    expect(noteField().value).toBe('x');
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    expect(await screen.findByText('Couldn’t remove Theo Marchetti: you’re offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Actions for ${theo.name}` })).toBeTruthy();
    expect((code('CH-3501') as HTMLDialogElement).hasAttribute('open')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Keep Theo' }));
    // Approve all is refused the same way.
    const { result } = renderHook(() => useJoinRequests('Varsity', PREVIEW_ROSTER.requests), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    });
    await act(() => result.current.approveAll());
    expect(result.current.reqs).toHaveLength(2);
    for (const write of [actions.accept, actions.reject, actions.remove, actions.intent]) expect(write).not.toHaveBeenCalled();
    // Export is local: it needs no network.
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText(/Roster exported/)).toBeTruthy();
    offline.mockRestore();
    [url.createObjectURL, url.revokeObjectURL] = prev;
  });

  it('31301 while one decision is in flight every other Approve and Decline waits, so no click is refused in silence', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    actions.accept.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    wrap(roster());
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    for (const b of within(region()).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer({ success: true }));
    await waitFor(() => expect(requestNames()).toEqual(['Owen Park']));
    for (const b of within(region()).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  it('30502 the export writes a name that starts with = + - or @ as text, so a spreadsheet never reads it as a formula; numbers stay numbers', async () => {
    const user = userEvent.setup();
    let blob: Blob | undefined;
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = (b: Blob) => {
      blob = b;
      return 'blob:x';
    };
    url.revokeObjectURL = () => {};
    wrap(roster({ players: [{ ...theo, id: 'odd', name: '=HYPERLINK("http://x","Click")', firstName: 'Odd' }, ...PREVIEW_ROSTER.players] }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    const lines = (await blob!.text()).split('\n');
    expect(lines.find((l) => l.includes('HYPERLINK'))!.startsWith('"\'=HYPERLINK(""http://x"",""Click"")"')).toBe(true);
    expect(lines.find((l) => l.startsWith('"Theo Marchetti"'))).toContain('"-0.8"');
    [url.createObjectURL, url.revokeObjectURL] = prev;
  });

  it('CH-3803 Esc inside an open dialog closes that dialog and leaves the player panel alone', async () => {
    const user = userEvent.setup();
    wrap(roster());
    await openPeek(user);
    await openRemove(user);
    await user.keyboard('{Escape}');
    // The panel leaves with a 260ms slide when it closes: give it time to go.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(screen.getByRole('complementary', { name: theo.name })).toBeTruthy();
  });

  it('CH-3703 Share falls back to copying the link when the share sheet fails, and stays quiet when it is dismissed', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValueOnce(new Error('no share sheet')).mockRejectedValueOnce(Object.assign(new Error('dismissed'), { name: 'AbortError' }));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    wrap(roster());
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Invite link copied')).toBeTruthy();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('/golf/join/FINLEY-26'));
    write.mockClear();
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    delete (navigator as { share?: unknown }).share;
  });

  it("30801 the coach's roster is a coach's: no session gets nothing and no read is made; a player is handed their own read-only roster, never the coach's; a coach gets the loader for their own team", async () => {
    const read = vi.fn(() => ({ data: null }));
    tables.current = { golf_teams: read, golf_team_members: read };
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    expect(await ClubhouseRosterRoute()).toBeNull();
    expect(resolveClubhouseTeam).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    // A player gets the player roster (30804), not the coach's screen: the coach's loader and its notes are never asked.
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'p1' } } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'p1' });
    tables.current = { golf_teams: { data: { name: 'Varsity', season: null } }, golf_team_members: { data: [] } };
    const mine = (await ClubhouseRosterRoute()) as React.ReactElement;
    expect(mine.type).not.toBe(Roster);
    expect(actions.requests).not.toHaveBeenCalled();
    vi.mocked(resolveClubhouseTeam).mockReset();
    // A coach: the loader gets their active team and their own id.
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
    tables.current = { golf_teams: { data: { name: 'Varsity', join_code: 'X', season: null } }, golf_team_members: { data: [] } };
    const el = (await ClubhouseRosterRoute()) as React.ReactElement<{ data: ChRoster }>;
    expect(el.type).toBe(Roster);
    expect(el.props.data.teamName).toBe('Varsity');
  });

  it("30802 the loader reads this team's members and this coach's notes only, and never asks for pending or removed members", async () => {
    const seen: Record<string, Array<[string, unknown[]]>> = {};
    const answer = (table: string, data: unknown) => (filters: Array<[string, unknown[]]>) => {
      seen[table] = filters;
      return { data };
    };
    tables.current = {
      golf_teams: { data: { name: 'Varsity', join_code: 'X', season: null } },
      golf_team_members: answer('members', [member('p1', 'Theo')]),
      golf_coach_player_intent: answer('notes', [{ player_id: 'p1', notes: 'Mine' }]),
    };
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(seen.members).toContainEqual(['eq', ['team_id', 't1']]);
    expect(seen.members).toContainEqual(['in', ['status', ['active', 'inactive']]]);
    expect(seen.notes).toContainEqual(['eq', ['coach_id', 'c1']]);
    expect(data.players[0]!.coachNote).toBe('Mine');
  });

  it('30803 the server refuses a change and says why: its words are shown and nothing on the screen moves', async () => {
    const user = userEvent.setup();
    actions.accept.mockResolvedValue({ success: false, error: 'This request has already been processed' });
    actions.intent.mockResolvedValue({ ok: false, error: 'Not authorized for this player' });
    actions.remove.mockResolvedValue({ success: false, error: 'This player has a saved in-progress round. Have them finish or discard it before removing them from the team.' });
    wrap(roster());
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    await expectCode('CH-3002', /This request has already been processed\./);
    expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']);
    await openPeek(user);
    await user.type(noteField(), 'x');
    await user.tab();
    await expectCode('CH-3004', /Not authorized for this player\./);
    expect(noteField().value).toBe('x');
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3001', /saved in-progress round/);
    expect(screen.getByRole('button', { name: `Actions for ${theo.name}` })).toBeTruthy();
    expect((code('CH-3501') as HTMLDialogElement).hasAttribute('open')).toBe(true);
  });

  it('30901 a change that lands says what happened in a toast and taps success once: added, declined, note saved, removed', async () => {
    const user = userEvent.setup();
    actions.accept.mockResolvedValue({ success: true });
    actions.reject.mockResolvedValue({ success: true });
    actions.intent.mockResolvedValue({ ok: true });
    actions.remove.mockResolvedValue({ success: true });
    wrap(roster());
    const taps = () => hapticSpy.mock.calls.filter(([kind]) => kind === 'success').length;
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await screen.findByText('Grace Liu added to Varsity')).toBeTruthy();
    expect(taps()).toBe(1);
    await user.click(within(region()).getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Request from Owen Park declined')).toBeTruthy();
    expect(taps()).toBe(2);
    await openPeek(user);
    await user.type(noteField(), 'Lag putting drills');
    await user.tab();
    expect(await screen.findByText('Note saved for Theo')).toBeTruthy();
    expect(taps()).toBe(3);
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    expect(await screen.findByText('Theo Marchetti removed from Varsity')).toBeTruthy();
    expect(taps()).toBe(4);
    expect(screen.queryByRole('button', { name: `Actions for ${theo.name}` })).toBeNull();
    expect((code('CH-3501') as HTMLDialogElement).hasAttribute('open')).toBe(false);
    await waitFor(() => expect(screen.queryByRole('complementary', { name: theo.name })).toBeNull());
  });

  it('31202 the cards or list choice is remembered on this device, and a device that refuses storage still switches', async () => {
    const user = userEvent.setup();
    const first = wrap(roster());
    await toList(user);
    expect(localStorage.getItem('ch-roster-view')).toBe('list');
    first.unmount();
    wrap(roster());
    expect(await screen.findByRole('table', { name: 'Roster' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Team view' }));
    expect(localStorage.getItem('ch-roster-view')).toBe('faces');
    const errors: unknown[] = [];
    const caught = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', caught);
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await toList(user);
    expect(screen.getByRole('table', { name: 'Roster' })).toBeTruthy();
    denied.mockRestore();
    window.removeEventListener('error', caught);
    // The refusal is handled inside Roster, not left to surface as an uncaught error.
    expect(errors).toEqual([]);
  });

  it('CH-3603 the kept layout comes back in place; only the coach’s own toggle swaps it, the old layout leaving the accessibility tree at once', async () => {
    const user = userEvent.setup();
    const leaving = () => document.querySelector('.ch-rs-body .ch-swap__body[aria-hidden]');
    localStorage.setItem('ch-roster-view', 'list');
    wrap(roster());
    expect(await screen.findByRole('table', { name: 'Roster' })).toBeTruthy();
    // Restoring the kept layout draws it in place: nothing is left fading behind it.
    expect(leaving()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Team view' }));
    // The table fades out behind the cards (jsdom never finishes the fade), hidden from assistive tech while it does.
    expect(leaving()?.querySelector('[role="table"]')).not.toBeNull();
    expect(screen.queryByRole('table', { name: 'Roster' })).toBeNull();
    expect(screen.getAllByRole('button', { name: new RegExp(theo.name) }).length).toBeGreaterThan(0);
  });

  it('31203 a saved note reads back: close the player and open them again, and the new text is there', async () => {
    const user = userEvent.setup();
    actions.intent.mockResolvedValue({ ok: true });
    wrap(roster());
    await openPeek(user);
    await user.type(noteField(), 'Lag putting drills');
    await user.tab();
    expect(await screen.findByText('Note saved for Theo')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: theo.name })).toBeNull());
    await openPeek(user);
    expect(noteField().value).toBe('Lag putting drills');
    // Emptying it saves no note, and that reads back too.
    await user.clear(noteField());
    await user.tab();
    await waitFor(() => expect(actions.intent).toHaveBeenLastCalledWith({ player_id: 'theo', notes: null }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: theo.name })).toBeNull());
    await openPeek(user);
    expect(noteField().value).toBe('');
  });

  it('31301 a decision takes the request off the list at once and puts it back in its place when the server refuses; Remove waits for the server', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    actions.accept.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    wrap(roster());
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[1]!);
    expect(requestNames()).toEqual(['Grace Liu']);
    await act(async () => answer({ success: false, error: 'nope' }));
    await waitFor(() => expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']));
    actions.remove.mockImplementation(() => new Promise(() => {}));
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3402');
    expect(screen.getByRole('button', { name: `Actions for ${theo.name}` })).toBeTruthy();
  });

  it('31403 the Retry on a failed removal completes it: the player leaves the list and the dialog closes', async () => {
    const user = userEvent.setup();
    actions.remove.mockImplementationOnce(fail).mockResolvedValue({ success: true });
    wrap(roster());
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3001');
    await user.click(within(code('CH-3001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: `Actions for ${theo.name}` })).toBeNull());
    expect(actions.remove).toHaveBeenCalledTimes(2);
    expect((code('CH-3501') as HTMLDialogElement).hasAttribute('open')).toBe(false);
  });

  it('31403 the Retry on a failed approval or decline puts the decision through: the request stays off the list', async () => {
    const user = userEvent.setup();
    actions.accept.mockImplementationOnce(fail).mockResolvedValue({ success: true });
    actions.reject.mockImplementationOnce(fail).mockResolvedValue({ success: true });
    wrap(roster());
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    await expectCode('CH-3002');
    await waitFor(() => expect(requestNames()).toEqual(['Grace Liu', 'Owen Park']));
    await user.click(within(code('CH-3002') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(requestNames()).toEqual(['Owen Park']));
    await user.click(within(region()).getByRole('button', { name: 'Decline' }));
    await expectCode('CH-3003');
    await waitFor(() => expect(requestNames()).toEqual(['Owen Park']));
    await user.click(within(code('CH-3003') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Join requests' })).toBeNull());
    expect(actions.accept).toHaveBeenCalledTimes(2);
    expect(actions.reject).toHaveBeenCalledTimes(2);
  });

  it('31403 the Retry on a failed note save marks the note saved, so leaving the field again writes nothing more', async () => {
    const user = userEvent.setup();
    actions.intent.mockImplementationOnce(() => Promise.resolve({ ok: false, error: 'nope' })).mockResolvedValue({ ok: true });
    wrap(roster());
    await openPeek(user);
    await user.type(noteField(), 'Lag putting drills');
    await user.tab();
    await expectCode('CH-3004');
    await user.click(within(code('CH-3004') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Note saved for Theo')).toBeTruthy();
    expect(actions.intent).toHaveBeenCalledTimes(2);
    await user.click(noteField());
    await user.tab();
    expect(actions.intent).toHaveBeenCalledTimes(2);
  });

  it('31704 Remove player taps the warning haptic as it is pressed, then the success pattern when the removal lands', async () => {
    const user = userEvent.setup();
    actions.remove.mockResolvedValue({ success: true });
    wrap(roster());
    await openRemove(user);
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('success'));
    expect(hapticSpy.mock.calls.map(([kind]) => kind)).toEqual(['warning', 'success']);
  });

  it('32001 the coach note saves when the field is left, only if it changed, with the outer spaces trimmed; an emptied note saves as none', async () => {
    const user = userEvent.setup();
    actions.intent.mockResolvedValue({ ok: true });
    wrap(roster());
    await openPeek(user);
    await user.click(noteField());
    await user.tab();
    expect(actions.intent).not.toHaveBeenCalled();
    await user.type(noteField(), '  Lag putting  ');
    await user.tab();
    await waitFor(() => expect(actions.intent).toHaveBeenCalledTimes(1));
    expect(actions.intent).toHaveBeenCalledWith({ player_id: 'theo', notes: 'Lag putting' });
    await user.click(noteField());
    await user.tab();
    expect(actions.intent).toHaveBeenCalledTimes(1);
    await user.clear(noteField());
    await user.tab();
    await waitFor(() => expect(actions.intent).toHaveBeenCalledTimes(2));
    expect(actions.intent).toHaveBeenLastCalledWith({ player_id: 'theo', notes: null });
  });

  it('32101 the loader reads in two parallel rounds and answers when reads fail: each failure is logged and flagged, nothing throws', async () => {
    const boom = { error: { message: 'boom' } };
    const reads = () => logServer.mock.calls.map(([, read]) => read);
    actions.requests.mockRejectedValue(new Error('down'));
    tables.current = { golf_teams: boom, golf_team_members: boom };
    const none = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(none).toMatchObject({ teamError: true, playersError: true, requestsError: true, players: [], requests: [], teamName: 'Your team', joinCode: null });
    expect(reads()).toEqual(expect.arrayContaining(['team', 'members', 'joinRequests']));
    logServer.mockClear();
    // The second round needs the members' ids; each of its reads can fail alone.
    actions.requests.mockResolvedValue({ success: true, data: [] });
    tables.current = {
      golf_teams: { data: { name: 'Varsity', join_code: 'X', season: null } },
      golf_team_members: { data: [member('p1', 'Theo')] },
      golf_rounds: boom,
      golf_player_focus_areas: boom,
      golf_goals: boom,
      golf_coach_player_intent: boom,
    };
    const part = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(part).toMatchObject({ playersError: false, teamError: false, statsError: true, notesError: true });
    expect(part.players[0]).toMatchObject({ rounds: 0, avg: null, focusAreas: null, goals: null, attention: null });
    expect(reads()).toEqual(expect.arrayContaining(['rounds', 'golf_player_focus_areas', 'golf_goals', 'coachNotes']));
  });

  it('32301 a failed change is reported with its roster action, a crash with its section, and each intent leaves a breadcrumb', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    actions.accept.mockRejectedValue(new Error('boom'));
    actions.remove.mockImplementation(fail);
    const view = wrap(roster());
    await openPeek(user);
    expect(chTrail).toHaveBeenCalledWith('roster open player');
    await user.click(within(region()).getAllByRole('button', { name: 'Approve' })[0]!);
    await expectCode('CH-3002');
    expect(chTrail).toHaveBeenCalledWith('action roster.approveRequest');
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'roster', action: 'roster.approveRequest' }));
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3001');
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'roster', action: 'roster.removePlayer', severity: 'low' }));
    view.unmount();
    wrap(roster({ requests: null as never }));
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'roster.requests', severity: 'high' }));
    quiet.mockRestore();
  });

  it("32401 this file and the player roster's file name every Roster catalog code they force, in a test title", () => {
    const self = fileURLToPath(import.meta.url);
    const catalog = readFileSync(resolve(dirname(self), '../../../docs/clubhouse/catalog/roster.md'), 'utf8');
    // The player's roster (CH-3210, CH-3211, CH-3307, CH-3308) is tested in its own file.
    const titles = [self, resolve(dirname(self), 'roster-player.test.tsx')]
      .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
      .filter((line) => /^\s*(it|describe)\(/.test(line))
      .join('\n');
    const forced = catalog
      .split('\n')
      .filter((line) => /^\| CH-3[0-5]\d\d \|/.test(line) && !/retired/i.test(line) && !/\|\s*preview\s*\|\s*$/.test(line.trim()))
      .map((line) => /^\| (CH-\d{4}) \|/.exec(line)![1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(forced.length).toBeGreaterThanOrEqual(27);
    expect(forced.filter((c) => !titles.includes(c))).toEqual([]);
  });
});
