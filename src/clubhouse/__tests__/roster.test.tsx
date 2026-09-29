import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Roster: every numbered state in docs/clubhouse/catalog/roster.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
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
}));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: actions.remove }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: actions.accept, rejectJoinRequest: actions.reject, getTeamJoinRequests: actions.requests }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: actions.intent }));

import { loadRoster, type ChRoster } from '../data/roster';
import { Roster } from '../screens/roster/Roster';
import { RosterSkeleton } from '../screens/roster/RosterSkeleton';
import { NOTE_MAX } from '../screens/roster/RosterPeek';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_ROSTER, PREVIEW_ROSTER_PARTIAL } from '../preview/fixtures-roster';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(data: ChRoster) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Roster data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const roster = (over: Partial<ChRoster> = {}): ChRoster => ({ ...PREVIEW_ROSTER, ...over });
const fail = () => Promise.resolve({ success: false, error: 'nope' });
const theo = PREVIEW_ROSTER.players[0]!;

async function toList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'List view' }));
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
  tables.current = {};
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
    await expectCode('CH-3001', /Couldn't remove Theo Marchetti/);
    expect(code('CH-3501')).not.toBeNull();
    expect(screen.getAllByText(theo.name).length).toBeGreaterThan(0);
  });

  it('CH-3002 approving fails: the request comes back', async () => {
    const user = userEvent.setup();
    actions.accept.mockImplementation(fail);
    wrap(roster());
    const req = PREVIEW_ROSTER.requests[0]!;
    await user.click(within(screen.getByRole('region', { name: 'Join requests' })).getAllByRole('button', { name: 'Approve' })[0]!);
    await expectCode('CH-3002', new RegExp(`Couldn't approve ${req.name}`));
    expect(screen.getByText(req.name)).toBeTruthy();
  });

  it('CH-3003 declining fails: the request comes back', async () => {
    const user = userEvent.setup();
    actions.reject.mockImplementation(fail);
    wrap(roster());
    const req = PREVIEW_ROSTER.requests[0]!;
    await user.click(within(screen.getByRole('region', { name: 'Join requests' })).getAllByRole('button', { name: 'Decline' })[0]!);
    await expectCode('CH-3003', new RegExp(`Couldn't decline ${req.name}`));
    expect(screen.getByText(req.name)).toBeTruthy();
  });

  it('CH-3004 the coach note does not save: the text stays in the field', async () => {
    const user = userEvent.setup();
    actions.intent.mockImplementation(fail);
    wrap(roster());
    await openPeek(user);
    const note = screen.getByRole('textbox', { name: /Coach’s note/ });
    await user.clear(note);
    await user.type(note, 'Work on lag putting');
    await user.tab();
    await expectCode('CH-3004', /Couldn't save your note about Theo/);
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
    await expectCode('CH-3005', /Couldn't export the roster/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    url.createObjectURL = prev;
  });

  it('CH-3006 copying the join code fails: copy it by hand', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    wrap(roster());
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await user.click((await screen.findAllByRole('button', { name: 'Copy' }))[0]!);
    await expectCode('CH-3006', /Couldn't copy the join code/);
  });
});

describe('Roster · validation', () => {
  it('CH-3101 a note near the 2,000 limit counts down, politely', async () => {
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
    await expectCode('CH-3201', /The roster didn't load/);
    expect(code('CH-3301')).toBeNull();
    await user.click(within(code('CH-3201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-3202 season stats do not load: the roster stays, figures read as missing', async () => {
    wrap(PREVIEW_ROSTER_PARTIAL);
    await expectCode('CH-3202', /Season stats didn't load/);
    expect(screen.getAllByText(theo.name).length).toBeGreaterThan(0);
  });

  it('CH-3203 join requests do not load: Try again re-reads', async () => {
    const user = userEvent.setup();
    wrap(roster({ requestsError: true, requests: [] }));
    await expectCode('CH-3203', /Join requests didn't load/);
    await user.click(within(code('CH-3203') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
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
    expect(screen.getByRole('heading', { name: 'Your players.' })).toBeTruthy();
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
    await expectCode('CH-3207', /The join code didn't load/);
    expect(code('CH-3304')).toBeNull();
  });

  it('CH-3208 development counts that do not load read as a dash, never 0', async () => {
    const user = userEvent.setup();
    wrap(roster({ players: [{ ...theo, focusAreas: null, goals: null }, ...PREVIEW_ROSTER.players.slice(1)] }));
    await openPeek(user);
    await expectCode('CH-3208');
    expect(code('CH-3208')!.textContent).not.toMatch(/\b0\b/);
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
  it('CH-3301 no players yet: invite is the next step', () => {
    wrap(roster({ players: [], requests: [] }));
    expect(code('CH-3301')!.textContent).toMatch(/No players on the roster yet/);
    expect(within(code('CH-3301') as HTMLElement).getByRole('button', { name: 'Invite players' })).toBeTruthy();
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

  it('CH-3304 no join code yet: a way to make one', async () => {
    const user = userEvent.setup();
    wrap(roster({ joinCode: null }));
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await expectCode('CH-3304', /no join code yet/);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
  });

  it('CH-3305 a player with no rounds: form says what will appear', async () => {
    const user = userEvent.setup();
    wrap(roster({ players: [{ ...theo, trend: [], recent: [], rounds: 0 }, ...PREVIEW_ROSTER.players.slice(1)] }));
    await openPeek(user);
    await expectCode('CH-3305', /Form appears once rounds are posted/);
  });
});

describe('Roster · loading, haptics, accessibility', () => {
  it('CH-3401 the route skeleton is busy', () => {
    render(<RosterSkeleton />);
    expect(code('CH-3401')!.getAttribute('aria-busy')).toBe('true');
  });

  it('CH-3402 removing shows its progress and cannot be pressed twice', async () => {
    const user = userEvent.setup();
    actions.remove.mockImplementation(() => new Promise(() => {}));
    wrap(roster());
    await openRemove(user);
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await expectCode('CH-3402', /Removing/);
    expect((code('CH-3402')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('CH-3701 CH-3702 opening a player ticks; an export lands with a commit tap', async () => {
    const user = userEvent.setup();
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = () => 'blob:x';
    url.revokeObjectURL = () => {};
    wrap(roster());
    await openPeek(user);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(hapticSpy).toHaveBeenCalledWith('commit');
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

  it('CH-3802 a player card reads its status as a word', () => {
    wrap(roster());
    const card = screen.getAllByRole('button', { name: new RegExp(theo.name) })[0]!;
    expect(card.textContent).toMatch(/Active/);
    expect(card.querySelector('.ch-rs-face__dot')!.getAttribute('aria-hidden')).toBe('true');
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
