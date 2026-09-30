import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Roster: every numbered state in docs/clubhouse/catalog/roster.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
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
import { nameList, useJoinRequests } from '../screens/roster/useJoinRequests';
import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
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

  it('CH-3007 approve all: every failure is named, the count added is said, and Retry re-tries only those', async () => {
    const user = userEvent.setup();
    const three = [...PREVIEW_ROSTER.requests, { id: 'r3', name: 'Sam Reyes', meta: 'Freshman', classYear: 'Freshman', gradYear: 2030, requested: 'today', handicap: null }];
    actions.accept.mockImplementation((id: string) => Promise.resolve(id === 'r1' ? { success: true } : { success: false, error: 'nope' }));
    const { result } = renderHook(() => useJoinRequests('Varsity', three), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    });
    await act(() => result.current.approveAll());
    await expectCode('CH-3007', /Couldn't approve Owen Park and Sam Reyes/);
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
    expect(hapticSpy).toHaveBeenCalledWith('commit');
  });

  it('approve all that lands says how many were added, one commit tap', async () => {
    actions.accept.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useJoinRequests('Varsity', PREVIEW_ROSTER.requests), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    });
    await act(() => result.current.approveAll());
    expect(screen.getByText('2 players added to Varsity')).toBeTruthy();
    expect(result.current.reqs).toEqual([]);
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'commit')).toHaveLength(1);
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
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

describe('Roster · phone (docs/clubhouse/phone/roster.md)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
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

  it('the top bar reads "‹ More", Roster, and Invite players, which opens the invite sheet', async () => {
    const user = userEvent.setup();
    phone(roster());
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'Roster' })).toBeTruthy();
    await user.click(within(top).getByRole('button', { name: 'Back to More' }));
    expect(router.back.mock.calls.length + router.push.mock.calls.length).toBeGreaterThan(0);
    await user.click(within(top).getByRole('button', { name: 'Invite players' }));
    expect(await screen.findByText('FINLEY-26')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('press');
  });

  it('CH-3701 active players by average, then Inactive; SG and Name (by last name, D-59) re-sort with a tick', async () => {
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

  it('CH-1906 a player is a pushed screen: a history entry, "‹ Roster" and the back gesture both pop it', async () => {
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

  it('a link with ?player= opens the profile once; an inactive player is labelled (D-58)', () => {
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
    await expectCode('CH-3403', /Approving/);
    expect((code('CH-3403')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    act(() => finish());
    await waitFor(() => expect(actions.accept).toHaveBeenCalledTimes(2));
    act(() => finish());
    await waitFor(() => expect(screen.getByText('2 players added to Varsity')).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('button', { name: /join request/ })).toBeNull());
  });

  it('CH-3203 join requests that did not load say so in the banner slot', () => {
    phone(roster({ requestsError: true, requests: [] }));
    expect(code('CH-3203')!.textContent).toMatch(/Join requests didn't load/);
  });

  it('CH-3202 season stats that did not load: the profile says so instead of "no rounds"', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster({ statsError: true, players: PREVIEW_ROSTER.players.map((p) => ({ ...p, avg: null, sgPerRound: null, trend: [], recent: [], rounds: 0, form: 'early', attention: null })) }));
    expect(screen.getAllByText(/Season stats didn't load/).length).toBeGreaterThan(0);
    expect(code('CH-3305')).toBeNull();
  });
});
