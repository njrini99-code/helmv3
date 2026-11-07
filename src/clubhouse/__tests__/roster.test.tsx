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
const theo = PREVIEW_ROSTER.players[0]!;
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
    await user.click(within(code('CH-3007') as HTMLElement).getByRole('button', { name: 'Try again' }));
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

  it('CH-3304 no team code yet: a way to make one', async () => {
    const user = userEvent.setup();
    wrap(roster({ joinCode: null }));
    await user.click(screen.getAllByRole('button', { name: 'Invite players' })[0]!);
    await expectCode('CH-3304', /no team code yet/);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
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

  it('CH-3401 the route skeleton is busy', () => {
    render(<RosterSkeleton />);
    expect(code('CH-3401')!.getAttribute('aria-busy')).toBe('true');
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

  it("Schedule 1:1 in the player panel opens Calendar's editor with only that player invited (D-52)", async () => {
    const user = userEvent.setup();
    wrap(roster());
    await openPeek(user);
    const panel = screen.getByRole('complementary', { name: theo.name });
    expect(within(panel).getByRole('link', { name: 'Schedule 1:1' }).getAttribute('href')).toBe(`/golf/dashboard/calendar?new=1&with=${theo.id}`);
  });
});

describe('Roster · phone (docs/clubhouse/phone/roster.md)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    // The phone's profile links are the production ones (the stats page is rebuilt).
    profile.rebuilt = true;
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)',
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

  it('wave 10 (C) the phone top bar keeps its invite icon when the roster failed to load', () => {
    phone(roster({ players: [], playersError: true }));
    expect(screen.getByRole('button', { name: 'Invite players' })).toBeTruthy();
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

  it('CH-3202 season stats that did not load: the profile says so instead of "no rounds"', () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    phone(roster({ statsError: true, players: PREVIEW_ROSTER.players.map((p) => ({ ...p, avg: null, sgPerRound: null, trend: [], recent: [], rounds: 0, form: 'early', attention: null })) }));
    expect(screen.getAllByText(/Season stats didn’t load/).length).toBeGreaterThan(0);
    expect(code('CH-3305')).toBeNull();
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
});

/** Availability (P003): can they play. Display only, never team access; coaches only. */
describe('Roster · availability (injured, away)', () => {
  const ava = PREVIEW_ROSTER_AVAILABILITY.players.find((p) => p.id === 'ava')!;
  const luca = PREVIEW_ROSTER_AVAILABILITY.players.find((p) => p.id === 'luca')!;

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
    expect(attentionFor(s, now, true)).toEqual({ tone: 'loss', text: 'Scoring up 2.1' });
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
});

/** P003 behaviour contracts with no catalog row (config/clubhouse/bridge-contracts.json, D-69). */
describe('Roster · behaviour contracts (P003, docs/clubhouse/pages/P003-roster/CONTRACT.md)', () => {
  const member = (id: string, name: string) => ({ status: 'active', jersey_number: null, joined_at: null, player: { id, first_name: name, last_name: 'M' } });

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

  it("32401 this file and the player roster's file name every Roster catalog code they force, in a test title", () => {
    const self = fileURLToPath(import.meta.url);
    const catalog = readFileSync(resolve(dirname(self), '../../../docs/clubhouse/catalog/roster.md'), 'utf8');
    // The player's roster (CH-3210, CH-3211, CH-3307, CH-3308) is tested in its own file, and so is inviting by email (CH-3080, CH-3180).
    const titles = [self, resolve(dirname(self), 'roster-player.test.tsx'), resolve(dirname(self), 'roster-invite-email.test.tsx')]
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

/** Audit A6, A9, A10, A12 (Home, Roster, Hub data truth): one quiet rule, no dropped edit, an honest chip, one handicap. */
describe('Roster · data truth', () => {
  const NY = 'America/New_York';
  const summary = (over: Record<string, unknown> = {}) =>
    ({ rounds: 10, avg: 74, sgPerRound: null, trend: [], status: 'steady', formChange: null, recent: [], lastRoundDate: null, ...over }) as unknown as Parameters<typeof attentionFor>[0];

  it('A6 Roster flags quiet at Home’s 7 days, counted in the team’s zone, not 9 days in UTC', () => {
    // 21:00 Eastern on 14 Oct is 01:00 UTC on the 15th: the last round was on the 7th, so 7 team-local days.
    const now = new Date('2026-10-15T01:00:00Z');
    const quiet = summary({ lastRoundDate: '2026-10-07' });
    expect(attentionFor(quiet, now, true, 'available', NY)).toEqual({ tone: 'warning', text: 'No rounds in 7 days' });
    // Six days is not quiet.
    expect(attentionFor(summary({ lastRoundDate: '2026-10-08' }), now, true, 'available', NY)).toBeNull();
    // A day earlier it is 6 team-local days.
    expect(attentionFor(quiet, new Date('2026-10-14T01:00:00Z'), true, 'available', NY)).toBeNull();
  });

  it('A6 "slipping" is Home’s form status: a raw 1.5-stroke swing that does not clear its standard error is not flagged', () => {
    const now = new Date('2026-10-14T16:00:00Z');
    expect(attentionFor(summary({ status: 'steady', formChange: 2.4 }), now, true, 'available', NY)).toBeNull();
    expect(attentionFor(summary({ status: 'slipping', formChange: 2.4 }), now, true, 'available', NY)).toEqual({ tone: 'loss', text: 'Scoring up 2.4' });
  });

  it('A12 a join request shows the handicap index when the player has one, as the roster will after approval', async () => {
    const now = Date.now();
    tables.current = {
      golf_team_members: { data: [] },
      golf_players: { data: [{ id: 'q1', handicap_index: 4.2 }] },
    };
    actions.requests.mockResolvedValue({
      success: true,
      data: [
        { id: 'r1', team_id: 't1', player_id: 'q1', status: 'pending', message: null, created_at: new Date(now - 3_600_000).toISOString(), player: { id: 'q1', first_name: 'Quinn', last_name: 'Ng', graduation_year: 2029, handicap: 9.9, hometown: null, state: null } },
        { id: 'r2', team_id: 't1', player_id: 'q2', status: 'pending', message: null, created_at: new Date(now - 3_600_000).toISOString(), player: { id: 'q2', first_name: 'Rey', last_name: 'Ox', graduation_year: 2029, handicap: 12, hometown: null, state: null } },
      ],
    });
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    // Quinn has an index (4.2) and a typed 9.9; Rey has no index row, so the typed value stands.
    expect(data.requests.map((r) => [r.name, r.handicap])).toEqual([['Quinn Ng', 4.2], ['Rey Ox', 12]]);
  });
});
