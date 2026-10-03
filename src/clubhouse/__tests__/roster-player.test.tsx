import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The player's Roster (docs/clubhouse/catalog/roster.md: CH-3210, CH-3211, CH-3307, CH-3308, CH-3807; contracts 30804
 * to 30806): the coach's screen, read-only, over a loader that reads nothing a teammate could not show.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const teamActions = vi.hoisted(() => ({ requests: vi.fn(), accept: vi.fn(), reject: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: teamActions.requests, acceptJoinRequest: teamActions.accept, rejectJoinRequest: teamActions.reject }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadPlayerRoster, type ChPlayerRoster, type ChTeammate } from '../data/roster-player';
import { ClubhouseRosterRoute } from '../routes/roster';
import { resolveClubhouseTeam } from '../routes/team';
import { RosterNoTeam } from '../screens/roster/RosterNoTeam';
import { TeamRoster } from '../screens/roster/TeamRoster';
import { sortTeammates } from '../screens/roster/team';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import { activeNavItem, isRebuilt, phoneTabsFor } from '../shell/nav';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

const mate = (id: string, name: string, classYear: string | null, gradYear: number | null, handicap: number | null, isYou = false): ChTeammate => ({ id, name, classYear, gradYear, handicap, isYou });
const TEAM: ChPlayerRoster = {
  teamName: 'Varsity',
  season: 'Fall 2026',
  teamError: false,
  playersError: false,
  players: [
    mate('theo', 'Theo Marchetti', 'Senior', 2027, -0.8, true),
    mate('ava', 'Ava Lindqvist', 'Junior', 2028, 2.4),
    mate('jonah', 'Jonah Okafor', 'Sophomore', 2029, 3.9),
    mate('luca', 'Luca Ferraro', 'Freshman', 2030, null),
  ],
};

function wrap(data: ChPlayerRoster) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamRoster data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const faces = () => screen.getByRole('list', { name: 'Players' });
/** Anything a person could focus or press. */
const CONTROLS = 'a, button, [role="button"], [role="link"], [tabindex], input, select, textarea, summary';

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  teamActions.requests.mockClear();
  localStorage.clear();
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
});

describe('Player roster · what the loader reads (30805)', () => {
  const MEMBER_ROWS = [
    // The database hands back whatever it is asked for; the extra fields prove nothing here depends on them.
    { status: 'active', player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti', graduation_year: 2027, handicap: 1.2, handicap_index: -0.8, email: 'theo@school.edu', phone: '555-0100' } },
    { status: 'active', player: { id: 'p2', first_name: 'Ava', last_name: 'Lindqvist', graduation_year: 2028, handicap: 2.4, handicap_index: null, email: 'ava@school.edu' } },
    { status: 'active', player: null },
  ];

  it('asks only for the team row and the team\'s active members, with no coach read, join code, request, note or round', async () => {
    const asked: string[] = [];
    const filters: Record<string, Array<[string, unknown[]]>> = {};
    const answer = (table: string, data: unknown) => (f: Array<[string, unknown[]]>) => {
      asked.push(table);
      filters[table] = f;
      return { data };
    };
    tables.current = {
      golf_teams: answer('golf_teams', { name: 'Varsity', season: 'Fall 2026', join_code: 'JOINME', head_coach_notes: 'private' }),
      golf_team_members: answer('golf_team_members', MEMBER_ROWS),
    };
    const data = await loadPlayerRoster({ teamId: 't1', playerId: 'p1' });
    expect([...new Set(asked)].sort()).toEqual(['golf_team_members', 'golf_teams']);
    expect(teamActions.requests).not.toHaveBeenCalled();
    // The selects name the columns shown and no others: no email, phone, avatar, hometown, join code or notes.
    const selected = (t: string) => String(filters[t]!.find(([k]) => k === 'select')![1][0]);
    expect(selected('golf_teams')).toBe('name, season');
    expect(selected('golf_team_members')).not.toMatch(/email|phone|avatar|hometown|join_code|notes|jersey/);
    // Active members of this team only (a pending invite or a removed player is no teammate).
    expect(filters['golf_team_members']).toContainEqual(['eq', ['team_id', 't1']]);
    expect(filters['golf_team_members']).toContainEqual(['eq', ['status', 'active']]);
    // And nothing outside the projection reaches the screen, whatever the rows carried.
    const json = JSON.stringify(data);
    for (const leaked of ['theo@school.edu', 'ava@school.edu', '555-0100', 'JOINME', 'private']) expect(json).not.toContain(leaked);
    expect(data.players).toEqual([
      { id: 'p1', name: 'Theo Marchetti', classYear: expect.any(String), gradYear: 2027, handicap: -0.8, isYou: true },
      { id: 'p2', name: 'Ava Lindqvist', classYear: expect.any(String), gradYear: 2028, handicap: 2.4, isYou: false },
    ]);
    expect(Object.keys(data.players[0]!).sort()).toEqual(['classYear', 'gradYear', 'handicap', 'id', 'isYou', 'name']);
    expect(data.teamName).toBe('Varsity');
    expect(data.season).toBe('Fall 2026');
  });

  it('CH-3210 a members read that fails is a failed roster, never an empty team, and is logged', async () => {
    tables.current = { golf_teams: { data: { name: 'Varsity', season: null } }, golf_team_members: { error: { message: 'boom' } } };
    const data = await loadPlayerRoster({ teamId: 't1', playerId: 'p1' });
    expect(data.playersError).toBe(true);
    expect(data.players).toEqual([]);
    expect(logServer).toHaveBeenCalledWith('roster', 'playerMembers', expect.anything(), 'teams');
  });

  it('a team row that does not load leaves the name as "Your team", and the list stands', async () => {
    tables.current = { golf_teams: { error: { message: 'boom' } }, golf_team_members: { data: MEMBER_ROWS } };
    const data = await loadPlayerRoster({ teamId: 't1', playerId: 'p1' });
    expect(data.teamError).toBe(true);
    expect(data.teamName).toBe('Your team');
    expect(data.players).toHaveLength(2);
    expect(logServer).toHaveBeenCalledWith('roster', 'playerTeam', expect.anything(), 'teams');
  });
});

describe('Player roster · who gets it (30804)', () => {
  it('a player is handed their own team\'s roster; with no team, the player\'s no-team page; no session, nothing', async () => {
    tables.current = { golf_teams: { data: { name: 'Varsity', season: null } }, golf_team_members: { data: [] } };
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'p1' } } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'p1' });
    const el = (await ClubhouseRosterRoute()) as React.ReactElement<{ data: ChPlayerRoster }>;
    expect(el.type).toBe(TeamRoster);
    expect(el.props.data.teamName).toBe('Varsity');
    expect(teamActions.requests).not.toHaveBeenCalled();

    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    const none = (await ClubhouseRosterRoute()) as React.ReactElement<{ viewer?: string }>;
    expect(none.type).toBe(RosterNoTeam);
    expect(none.props.viewer).toBe('player');

    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    expect(await ClubhouseRosterRoute()).toBeNull();
  });

  it('CH-3308 a player with no team gets the page that says so, in their words', () => {
    render(
      <div className="ch-root" data-ui="clubhouse">
        <RosterNoTeam viewer="player" />
      </div>,
    );
    expect(code('CH-3308')!.textContent).toMatch(/You aren't on a team yet/);
    expect(code('CH-3308')!.textContent).toMatch(/Your teammates appear here once your coach approves your request to join\./);
  });

  it('the Roster is rebuilt for players: a sidebar entry under Team and a row in the phone More sheet, not a tab', () => {
    expect(isRebuilt('/golf/dashboard/roster', 'player')).toBe(true);
    expect(activeNavItem('/golf/dashboard/roster', 'player')).toMatchObject({ id: 'roster', section: 'Team', href: '/golf/dashboard/roster' });
    const { tabs, more } = phoneTabsFor('player');
    expect(tabs.map((t) => t.id)).not.toContain('roster');
    expect(more.map((t) => t.id)).toContain('roster');
  });
});

describe('Player roster · desktop', () => {
  it('is the coach\'s page header with the player\'s words: Your team, the count, no invite, export or requests', () => {
    wrap(TEAM);
    expect(screen.getByRole('heading', { level: 1, name: 'Your team.' })).toBeTruthy();
    expect(screen.getByText('Varsity · Fall 2026')).toBeTruthy();
    expect(document.querySelector('.ch-rs-head p')!.textContent).toBe('4 players on the roster.');
    for (const gone of [/Invite players/, /Export/, /Approve/, /Decline/, /join request/i, /Needs a look/, /Actions for/, /Remove/])
      expect(screen.queryByText(gone) ?? screen.queryByRole('button', { name: gone })).toBeNull();
  });

  it('CH-3807 30804 a teammate is text, not a control: no card is a link or a button, and nothing leads to a profile, stats or an action', async () => {
    const user = userEvent.setup();
    wrap(TEAM);
    expect(within(faces()).getAllByRole('listitem')).toHaveLength(4);
    expect(faces().querySelectorAll(CONTROLS)).toHaveLength(0);
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
    // Clicking a card does nothing: no panel, no navigation.
    await user.click(screen.getByText('Ava Lindqvist'));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(faces().querySelectorAll('[aria-pressed]')).toHaveLength(0);
    // The list view is the same: a table whose rows hold plain text.
    await user.click(screen.getByRole('button', { name: 'List view' }));
    const table = screen.getByRole('table', { name: 'Roster' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Player', 'Class', 'HCP']);
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(table.querySelectorAll(CONTROLS)).toHaveLength(0);
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('a card shows name, who it is to you, class and handicap (a plus handicap with its plus); no average, strokes gained, form or hometown', () => {
    wrap(TEAM);
    const cards = within(faces()).getAllByRole('listitem');
    // Sorted by surname: Ferraro, Lindqvist, Marchetti, Okafor.
    expect(cards.map((c) => c.querySelector('.ch-rs-face__name')!.textContent)).toEqual(['Luca Ferraro', 'Ava Lindqvist', 'Theo Marchetti', 'Jonah Okafor']);
    const theo = cards[2]!;
    expect(theo.querySelector('.ch-rs-face__meta')!.textContent).toBe('You · Senior');
    expect(theo.querySelector('.ch-rs-face__figs')!.textContent).toBe('+0.8HCP');
    expect(cards[0]!.querySelector('.ch-rs-face__figs')!.textContent).toBe('—HCP');
    const text = faces().textContent ?? '';
    expect(text).not.toMatch(/Avg|SG|Rounds|form|Scoring/i);
    expect(faces().querySelector('svg.ch-form, .ch-rs-face__form')).toBeNull();
  });

  it('search narrows the list, and a search with no match says so and clears (CH-3302)', async () => {
    const user = userEvent.setup();
    wrap(TEAM);
    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'okaf');
    expect(within(faces()).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByRole('searchbox', { name: 'Search players' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'zzz');
    expect(code('CH-3302')!.textContent).toMatch(/No players match “zzz”/);
    await user.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(within(faces()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('sorts by name, class (seniors first) and handicap (lowest first, none last); changing it is a selection tick', async () => {
    const user = userEvent.setup();
    wrap(TEAM);
    const names = () => within(faces()).getAllByRole('listitem').map((c) => c.querySelector('.ch-rs-face__name')!.textContent);
    await user.click(screen.getByRole('radio', { name: 'Class' }));
    expect(names()).toEqual(['Theo Marchetti', 'Ava Lindqvist', 'Jonah Okafor', 'Luca Ferraro']);
    await user.click(screen.getByRole('radio', { name: 'Handicap' }));
    expect(names()).toEqual(['Theo Marchetti', 'Ava Lindqvist', 'Jonah Okafor', 'Luca Ferraro']);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(sortTeammates(TEAM.players, 'hcp').map((p) => p.handicap)).toEqual([-0.8, 2.4, 3.9, null]);
  });

  it('CH-3210 a roster that did not load says so with Try again, never "no players"', async () => {
    const user = userEvent.setup();
    wrap({ ...TEAM, players: [], playersError: true });
    expect(code('CH-3210')!.textContent).toMatch(/The roster didn't load\./);
    expect(screen.queryByText(/No one on the roster/)).toBeNull();
    expect(screen.queryByText(/players on the roster/)).toBeNull();
    await user.click(within(code('CH-3210') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-3307 a team with nobody on it says so, with no action to take', () => {
    wrap({ ...TEAM, players: [] });
    expect(code('CH-3307')!.textContent).toMatch(/No one on the roster yet/);
    expect(code('CH-3307')!.textContent).toMatch(/Your teammates appear here once your coach adds them\./);
    expect(code('CH-3307')!.querySelectorAll(CONTROLS)).toHaveLength(0);
  });

  it('CH-3211 a crash in the list stays in the list: the header and the controls remain', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    wrap({ ...TEAM, players: [mate('x', 'Broken Player', 'Senior', 2027, 'x' as never)] });
    expect(code('CH-3211')!.textContent).toMatch(/The roster couldn’t be shown/);
    expect(screen.getByRole('heading', { name: 'Your team.' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search players' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('the layout is remembered on this device, as the coach\'s is', async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(TEAM);
    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(localStorage.getItem('ch-roster-view')).toBe('list');
    unmount();
    wrap(TEAM);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Roster' })).toBeTruthy());
  });
});

describe('Player roster · phone', () => {
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
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const phone = (data: ChPlayerRoster) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <TeamRoster data={data} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );

  it('the top bar reads "‹ More" and Roster with no action, and the page names the team and the count', () => {
    phone(TEAM);
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('button', { name: /More/ })).toBeTruthy();
    expect(within(top).getByText('Roster')).toBeTruthy();
    // One control in the bar: the back link. No invite, no action.
    expect(top.querySelectorAll('button, a')).toHaveLength(1);
    expect(screen.getByRole('main', { name: 'Roster' }).querySelector('.ch-rsm-kicker')!.textContent).toBe('Varsity · 4 players');
  });

  it('CH-3807 30804 a row is not a button: name, class and handicap as text, nothing to open', async () => {
    const user = userEvent.setup();
    phone(TEAM);
    const list = screen.getByRole('list', { name: 'Players' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(list.querySelectorAll(CONTROLS)).toHaveLength(0);
    expect(rows.map((r) => r.querySelector('.ch-rsm-row__b b')!.textContent)).toEqual(['Luca Ferraro', 'Ava Lindqvist', 'Theo Marchetti', 'Jonah Okafor']);
    const theo = rows[2]!;
    expect(theo.querySelector('.ch-rsm-row__b > span')!.textContent).toBe('You · Senior');
    expect(theo.querySelector('.ch-rsm-row__v')!.textContent).toBe('+0.8hcp');
    expect(list.textContent).not.toMatch(/Avg|SG|form|Improving|Steady|Slipping|Early read/i);
    await user.click(screen.getByText('Ava Lindqvist'));
    expect(screen.queryByRole('region')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('sorts by class and by handicap from the one control the screen has', async () => {
    const user = userEvent.setup();
    phone(TEAM);
    await user.click(screen.getByRole('radio', { name: 'Class' }));
    expect(within(screen.getByRole('list', { name: 'Players' })).getAllByRole('listitem').map((r) => r.querySelector('.ch-rsm-row__b b')!.textContent)).toEqual([
      'Theo Marchetti',
      'Ava Lindqvist',
      'Jonah Okafor',
      'Luca Ferraro',
    ]);
    await user.click(screen.getByRole('radio', { name: 'HCP, handicap' }));
    expect(within(screen.getByRole('list', { name: 'Players' })).getAllByRole('listitem')[3]!.textContent).toMatch(/Luca Ferraro/);
  });

  it('CH-3210 CH-3307 a failed read and an empty team are told apart on the phone too', async () => {
    const user = userEvent.setup();
    const { unmount } = phone({ ...TEAM, players: [], playersError: true });
    expect(code('CH-3210')).not.toBeNull();
    await user.click(within(code('CH-3210') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
    unmount();
    phone({ ...TEAM, players: [] });
    expect(code('CH-3307')).not.toBeNull();
    expect(code('CH-3210')).toBeNull();
  });
});
