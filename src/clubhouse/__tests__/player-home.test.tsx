import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Player Home: the player's numbered states in docs/clubhouse/catalog/home.md, found by their number,
 * and the page's own contracts (docs/clubhouse/pages/P002-home/CONTRACT.md), found by their five-digit Bridge ID.
 * Coach Home's are in home.test.tsx, which also tests the route that hands each role its Home.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { briefFor, legRows, loadPlayerHome, type ChPlayerHome } from '../data/player-home';
import type { ChRound } from '../data/season';
import { PlayerHome, PlayerHomeNoTeam, isPlayerFirstRun } from '../screens/home/PlayerHome';
import { PlayerGame } from '../screens/home/PlayerGame';
import { scoringNote } from '../screens/home/PlayerGame';
import { chReport, chTrail } from '../lib/track';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME, PREVIEW_PLAYER_HOME_EMPTY, PREVIEW_PLAYER_HOME_FAILED } from '../preview/fixtures-player-home';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            {node}
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
const home = (over: Partial<ChPlayerHome> = {}): ChPlayerHome => ({ ...PREVIEW_PLAYER_HOME, ...over });
const show = (data: ChPlayerHome = home()) => wrap(<PlayerHome data={data} now={PREVIEW_HOME_NOW} />);

function round(i: number, over: Partial<ChRound> = {}): ChRound {
  const day = String(28 - i).padStart(2, '0');
  return {
    id: `r${i}`,
    player_id: 'p1',
    course_name: 'Finley GC',
    tees_played: null,
    round_date: `2026-09-${day}`,
    round_type: 'practice',
    total_score: 72 - (i % 3),
    score_to_par: -(i % 3),
    // The nines add up to the total: the season read takes the total from them (C-15).
    front_nine: 36 - (i % 3),
    back_nine: 36,
    holes_played: 18,
    total_putts: 30,
    total_gir: 11,
    total_gir_possible: 18,
    total_fairways_hit: 9,
    total_fairways: 14,
    strokes_gained_total: 0.5,
    strokes_gained_tee: 0.8,
    strokes_gained_approach: -0.4,
    strokes_gained_around_green: 0.1,
    strokes_gained_putting: 0,
    ...over,
  };
}

beforeEach(() => {
  hapticSpy.mockClear();
  logServer.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
  vi.mocked(chReport).mockClear();
  vi.mocked(chTrail).mockClear();
  tables.current = {};
});

/** Links are followed by the browser; a test only reads where they point. */
const stopNavigation = (e: Event) => e.preventDefault();

describe('Player Home · desktop (Player - Home.html)', () => {
  it('20102 20103 the day, no brief line, Message coach to the coach’s thread; New round opens round entry', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Theo' })).toBeTruthy();
    // Owner, 2026-10-06: the CoachHelm brief no longer sits under the greeting.
    expect(screen.queryByText(/Off the tee is gaining you 0\.8 strokes a round/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
    // Round entry is rebuilt for players (P011), so the button leads there.
    expect(screen.getByRole('link', { name: 'New round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
  });

  it('an all-day event shows its date without inventing a midnight tee time', () => {
    show(home({ next: { ...PREVIEW_PLAYER_HOME.next!, allDay: true, startLabel: 'All day', rangeLabel: 'All day' } }));
    expect(screen.getByRole('link', { name: /Up next · Qualifier/ })).toHaveTextContent('all day');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('20103 Your latest round opens its review (Open recap) once the round has a real id', () => {
    const [first, ...others] = PREVIEW_PLAYER_HOME.latest.rounds;
    show(home({ latest: { ...PREVIEW_PLAYER_HOME.latest, rounds: [{ ...first!, id: '5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c' }, ...others] } }));
    expect(screen.getByRole('link', { name: 'Open recap' }).getAttribute('href')).toBe('/golf/dashboard/rounds/5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c');
    expect(screen.queryByRole('link', { name: 'My stats' })).toBeNull();
  });

  it('20103 Your latest round: the course, a flag not an avatar, and My stats', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByRole('heading', { level: 2, name: 'Your latest round' })).toBeTruthy();
    expect(document.querySelector('.ch-h-round__name')!.textContent).toBe('Oakmont CC');
    expect(document.querySelector('.ch-h-round .ch-h-flag')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'My stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    // The outgoing card leaves over the swap animation; the new one is there at once.
    expect(await screen.findByText('Pine Needles')).toBeTruthy();
  });

  it('CH-1209 one part failing keeps its own Try again, with no page notice', () => {
    show(home({ legs: { ...PREVIEW_PLAYER_HOME.legs!, cacheError: true } }));
    expect(code('CH-1209')).toBeNull();
    expect(within(code('CH-2216') as HTMLElement).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('CH-2216 CH-2311 the figures did not load and none of the four has a value: the notice alone, never "Nothing to break down yet"', () => {
    const none = PREVIEW_PLAYER_HOME_EMPTY.legs!;
    show(home({ legs: { ...none, cacheError: true } }));
    expect(code('CH-2216')).not.toBeNull();
    expect(code('CH-2311')).toBeNull();
    cleanup();
    // A read that worked and found nothing is the other answer.
    show(home({ legs: { ...none, cacheError: false } }));
    expect(code('CH-2216')).toBeNull();
    expect(code('CH-2311')).not.toBeNull();
  });

  it('CH-2312 a new player gets the first-run page; a failed read is never taken for new', () => {
    expect(isPlayerFirstRun(PREVIEW_PLAYER_HOME_EMPTY)).toBe(true);
    expect(isPlayerFirstRun(PREVIEW_PLAYER_HOME_FAILED)).toBe(false);
    show(PREVIEW_PLAYER_HOME_EMPTY);
    expect(code('CH-2312')!.textContent).toMatch(/Welcome to the team/);
  });

  it('CH-2313 a player on no team', () => {
    wrap(<PlayerHomeNoTeam />);
    expect(code('CH-2313')!.textContent).toMatch(/aren’t on a team yet/);
    // A player joins a team from Golf profile (CH-8302).
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=golf');
  });
});

describe('Player Home · phone (Player - Home - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('CH-1209 CH-2201 on the phone the reads that fail are told once under the greeting, with one Try again', () => {
    show(PREVIEW_PLAYER_HOME_FAILED);
    expect(code('CH-1209')!.textContent).toMatch(/This week’s schedule, your latest round and your scoring didn’t load/);
    expect(code('CH-1209')!.closest('.ch-hm-body')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    expect(code('CH-2201')!.closest('.ch-hm-next')).toBeNull();
  });

  it('20103 on the phone Your latest round opens its review once the round has a real id', () => {
    const [first, ...others] = PREVIEW_PLAYER_HOME.latest.rounds;
    show(home({ latest: { ...PREVIEW_PLAYER_HOME.latest, rounds: [{ ...first!, id: '5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c' }, ...others] } }));
    expect(screen.getByRole('link', { name: /Open recap/ }).getAttribute('href')).toBe('/golf/dashboard/rounds/5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c');
  });

  it('CH-2309 nothing ahead: the empty card, with no Add event (a player can’t add team events)', () => {
    show(home({ next: null, today: [] }));
    expect(code('CH-2309')!.textContent).toMatch(/Your coach’s practices and events will show here/);
    expect(screen.queryByRole('link', { name: /Add event/ })).toBeNull();
  });

  it('CH-2301 an empty day with something next draws no second empty card, and no Plan button for a player', () => {
    // One schedule answer, never two (owner, 7 Nov): the greeting's line says what is next, so an empty Today adds nothing.
    show(home({ today: [] }));
    expect(code('CH-2301')).toBeNull();
    expect(code('CH-2309')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Plan' })).toBeNull();
  });

  it('21703 Your latest round pages inline, with a selection tick', async () => {
    const user = userEvent.setup();
    show();
    const sec = screen.getByRole('heading', { level: 2, name: 'Your latest round' }).closest('section')!;
    expect(within(sec).getByText('Oakmont CC')).toBeTruthy();
    expect(within(sec).getAllByRole('table')).toHaveLength(2);
    await user.click(within(sec).getByRole('button', { name: 'Next round' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(within(sec).getByText('Pine Needles')).toBeTruthy();
    await user.click(within(sec).getByRole('button', { name: 'Next round' }));
    expect(code('CH-2303')).not.toBeNull();
  });
});

describe('Player Home · the loader', () => {

  it('20804 a player’s week names no one: today’s event reads a count, never teammates’ names', async () => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [{ id: 'e1', title: 'Putting ladder', event_type: 'practice', start_time: `${d}T21:30:00Z`, end_time: `${d}T22:30:00Z`, all_day: false, location: 'Green 2' }] },
      golf_event_attendance: { data: [{ id: 'x1', event_id: 'e1', player_id: 'p-priya', status: 'accepted' }, { id: 'x2', event_id: 'e1', player_id: 'p-ava', status: 'pending' }] },
      golf_rounds: { data: [] },
      golf_team_members: { data: [{ player: { id: 'p-priya', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 } }] },
    };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    const row = data.week.agenda.find((r) => r.id === 'e1')!;
    expect(row.detail).toBe('Green 2 · 2 players');
    expect(data.today[0]!.invitees).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/Priya|undefined/);
  });

  it('CH-2215 rounds that fail: no brief, no legs, the scoring notice', async () => {
    tables.current = { golf_rounds: { error: { message: 'boom' } }, golf_events: { data: [] } };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    expect(data.scoring.error).toBe(true);
    expect(data.latest.error).toBe(true);
    expect(data.brief).toBeNull();
    expect(data.legs).toBeNull();
  });

  it('legRows weights by attempts (never a mean of percentages) and trends oldest first', () => {
    const rows = legRows([round(0, { total_gir: 18, total_gir_possible: 18 }), round(1, { total_gir: 0, total_gir_possible: 2 })], new Map(), null, {
      tee: null,
      approach: null,
      around: null,
      putting: null,
    });
    const approach = rows.find((r) => r.key === 'approach')!;
    expect(approach.value).toBe(90);
    expect(approach.trend).toEqual([0, 100]);
    expect(approach.note).toBe('18 of 20 greens in the last 2 rounds');
  });

  it('briefFor names the best leg gaining, or the leg costing most', () => {
    const legs = legRows([], new Map(), null, { tee: 0.8, approach: -0.4, around: 0.1, putting: 0 });
    expect(briefFor([round(0), round(1), round(2)], legs)).toBe('Your last three rounds average 71.0. Off the tee is gaining you 0.8 strokes a round.');
    const losing = legRows([], new Map(), null, { tee: -0.2, approach: -0.9, around: null, putting: null });
    expect(briefFor([round(0)], losing)).toBe('Your last round was 72. Approach is costing the most, 0.9 strokes a round.');
    expect(briefFor([], legs)).toBeNull();
  });

  it('scoringNote: the score four in five rounds meet', () => {
    const pts = [70, 71, 72, 69, 75].map((score, i) => ({ id: `${i}`, label: '', score, par: 72 }));
    expect(scoringNote(pts)).toBe('Four of your last five are 72 or better.');
  });

  it('scoringNote: a clean sweep says so, never "Ten of your last ten"', () => {
    const pts = [70, 71, 69, 70, 71, 70, 69, 71, 70, 71].map((score, i) => ({ id: `${i}`, label: '', score, par: 72 }));
    expect(scoringNote(pts)).toBe('Your last ten rounds were all 71 or better.');
  });
});

type Filters = Array<[string, unknown[]]>;
const player = { teamId: 't1', playerId: 'p1', firstName: 'Theo' };

describe('Player Home · what the loader reads and whom it names', () => {
  afterEach(() => vi.useRealTimers());

  it('20804 a player’s payload holds no teammate’s name or id, and a competition later in the week reads a count', async () => {
    // Monday 12 October, noon in New York.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T16:00:00Z'));
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: {
        data: [
          { id: 'e1', title: 'Putting ladder', event_type: 'practice', start_time: '2026-10-12T21:30:00Z', end_time: '2026-10-12T22:30:00Z', all_day: false, location: 'Green 2' },
          { id: 'e2', title: 'Pinehurst qualifier', event_type: 'qualifier', start_time: '2026-10-15T12:42:00Z', end_time: null, all_day: false, location: null, requires_rsvp: true },
        ],
      },
      golf_event_attendance: {
        data: [
          { id: 'x1', event_id: 'e1', player_id: 'p-priya', status: 'accepted' },
          { id: 'x2', event_id: 'e1', player_id: 'p-ava', status: 'pending' },
          { id: 'x3', event_id: 'e2', player_id: 'p-priya', status: 'accepted' },
          { id: 'x4', event_id: 'e2', player_id: 'p-ava', status: 'pending' },
        ],
      },
      golf_team_members: { data: [{ player: { id: 'p-priya', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 } }] },
      golf_rounds: { data: [] },
    };
    const data = await loadPlayerHome(player);
    expect(data.week.agenda.map((r) => r.detail)).toEqual(['Green 2 · 2 players', 'First tee 8:42 · 1 of 2 going']);
    expect(data.today[0]!.invitees).toEqual([]);
    expect(data.next!.invitees).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/p-priya|p-ava|priya|natarajan/i);
    // The same qualifier without RSVP reads no confirmed count (owner, 2026-10-08).
    const events = tables.current.golf_events as { data: Array<Record<string, unknown>> };
    events.data[1]!.requires_rsvp = false;
    const off = await loadPlayerHome(player);
    expect(off.week.agenda.map((r) => r.detail)).toEqual(['Green 2 · 2 players', 'First tee 8:42']);
  });

  it('20805 Message coach goes to the coach who created the team, else a coach with an account, else plain Messages', async () => {
    const coachesRead: Filters[] = [];
    const run = async (team: object, coaches: { data?: unknown; error?: unknown }) => {
      tables.current = {
        golf_team_settings: { data: { timezone: 'America/New_York' } },
        golf_events: { data: [] },
        golf_rounds: { data: [] },
        golf_teams: { data: team },
        golf_coaches: (filters) => {
          coachesRead.push(filters);
          return coaches;
        },
      };
      return loadPlayerHome(player);
    };
    const two = { data: [{ id: 'c-a', user_id: 'u-a' }, { id: 'c-b', user_id: 'u-b' }] };
    const team = { gender: 'men', created_by: 'c-b', organization_id: 'o1' };
    expect((await run(team, two)).coachUserId).toBe('u-b');
    // Only the team's own organisation's coaches, and only ones with an account.
    expect(coachesRead[0]).toContainEqual(['eq', ['organization_id', 'o1']]);
    expect(coachesRead[0]).toContainEqual(['not', ['user_id', 'is', null]]);
    // The creating coach has no account (or has left): the organisation's first.
    expect((await run({ ...team, created_by: 'c-gone' }, two)).coachUserId).toBe('u-a');
    // No organisation, no coach with an account, or coaches that don't load: nobody is named.
    expect((await run({ ...team, organization_id: null }, two)).coachUserId).toBeNull();
    expect((await run(team, { data: [] })).coachUserId).toBeNull();
    logServer.mockClear();
    expect((await run(team, { error: { message: 'boom' } })).coachUserId).toBeNull();
    expect(logServer).toHaveBeenCalledWith('home', 'coaches', expect.anything());
  });

  it('20805 Message coach opens the coach’s thread (?user=), or Messages itself when no coach is known', () => {
    const view = show();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
    view.unmount();
    show(home({ coachUserId: null }));
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages');
  });
});

describe('Player Home · the page’s own contracts (desktop)', () => {
  beforeEach(() => {
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    document.removeEventListener('click', stopNavigation, true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('20806 Player Home draws none of the coach’s controls or figures, and N does nothing', async () => {
    const user = userEvent.setup();
    show();
    for (const name of [/Message team/, /New event/, 'Plan', 'Add event', 'Full roster', 'Player stats']) expect(screen.queryByRole('link', { name })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Leaderboard' })).toBeNull();
    // No link to another player's stats or thread.
    expect(document.querySelector('a[href*="player="]')).toBeNull();
    await user.keyboard('n');
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('Player Home · the phone, the page’s own contracts', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    window.matchMedia = real;
    document.removeEventListener('click', stopNavigation, true);
    vi.restoreAllMocks();
  });

  it('20806 the phone draws none of the coach’s controls either: no Plan, no Add event, no quick event types', () => {
    show(home({ next: null, today: [] }));
    for (const name of ['Plan', 'Add event', 'Practice', 'Qualifier', 'Tournament', 'Meeting']) expect(screen.queryByRole('link', { name })).toBeNull();
    expect(code('CH-2309')).not.toBeNull();
  });

  it('21703 on the phone, Message coach gives the light tap', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('link', { name: 'Message coach' }));
    expect(hapticSpy.mock.calls).toEqual([['press']]);
  });
});

void waitFor;

describe('Player Home · what the coach is waiting on, and the player’s own reply (wave 7)', () => {
  it('item 1: one quiet row under the head, From your coach and the counts, opening Team Hub; none when nothing waits or it didn’t load', () => {
    const view = show();
    const row = screen.getByRole('link', { name: /^From your coach/ });
    expect(row.textContent).toMatch(/From your coach2 replies · 1 to acknowledge · 2 tasks due/);
    expect(row.getAttribute('href')).toBe('/golf/dashboard/team-hub');
    view.unmount();
    for (const asks of [null, { rsvps: 0, acks: 0, tasksDue: 0 }]) {
      const again = show(home({ asks }));
      expect(screen.queryByRole('link', { name: /^From your coach/ })).toBeNull();
      again.unmount();
    }
    show(home({ asks: { rsvps: 1, acks: 0, tasksDue: 1 } }));
    expect(screen.getByRole('link', { name: /^From your coach/ }).textContent).toMatch(/1 reply · 1 task due$/);
  });

  it('item 8: Up next says You’re going, or Reply needed, from the player’s own reply; nothing when unknown', () => {
    const view = show();
    expect(within(screen.getByRole('link', { name: /Up next · Qualifier/ })).getByText('You’re going')).toBeTruthy();
    view.unmount();
    const needed = show(home({ next: { ...PREVIEW_PLAYER_HOME.next!, mine: 'needed' } }));
    expect(within(screen.getByRole('link', { name: /Up next · Qualifier/ })).getByText('Reply needed')).toBeTruthy();
    needed.unmount();
    show(home({ next: { ...PREVIEW_PLAYER_HOME.next!, mine: null } }));
    const next = screen.getByRole('link', { name: /Up next · Qualifier/ });
    expect(within(next).queryByText('You’re going')).toBeNull();
    expect(within(next).queryByText('Reply needed')).toBeNull();
  });

  it('item 22a: the preview week’s weekdays are their dates’ own (14 October 2026 is a Wednesday)', () => {
    const long = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
    expect(PREVIEW_PLAYER_HOME.todayLabel).toBe(long.format(new Date('2026-10-14T12:00:00Z')));
    const short = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
    for (const d of PREVIEW_PLAYER_HOME.week.days) expect(d.weekday, d.date).toBe(short.format(new Date(`${d.date}T12:00:00Z`)));
    expect(short.format(new Date(`${PREVIEW_PLAYER_HOME.next!.date}T12:00:00Z`))).toBe(PREVIEW_PLAYER_HOME.week.agenda.find((r) => r.when === 'later')!.timeLabel);
  });
});

describe('Player Home · the game card on the redesign', () => {
  it('CH-2310 fewer than two 18-hole rounds: the scoring card says how many there are and when the line starts', () => {
    wrap(<PlayerGame data={home({ scoring: { points: PREVIEW_PLAYER_HOME.scoring.points.slice(0, 1), error: false } })} part="scoring" />);
    expect(document.querySelector('[data-ch-code="CH-2310"]')!.textContent).toMatch(/One round so far.*second 18-hole round/);
    cleanup();
    wrap(<PlayerGame data={home({ scoring: { points: [], error: false } })} part="scoring" />);
    expect(document.querySelector('[data-ch-code="CH-2310"]')!.textContent).toMatch(/No rounds posted yet this season/);
  });

  it('CH-2217 22301 the game card that crashes is contained, reported high as home.game; the rest of Home stays', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    show(home({ legs: { ...PREVIEW_PLAYER_HOME.legs!, rows: PREVIEW_PLAYER_HOME.legs!.rows.map((l) => ({ ...l, trend: null as never })) } }));
    expect(document.querySelector('[data-ch-code="CH-2217"]')!.textContent).toMatch(/Your game couldn’t be shown/);
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'home.game', severity: 'high' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    quiet.mockRestore();
  });
});

describe('Player Home · what the loader reads, on the redesign', () => {
  it('20803 20805 reads only the player’s own rounds, names no other invitee, and finds the coach', async () => {
    const roundsQueries: Filters[] = [];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: (f) => {
        roundsQueries.push(f);
        return { data: [round(0), round(1), round(2), round(3)] };
      },
      golf_players: { data: { handicap_index: 2.1, handicap: null } },
      // created_by is a golf_coaches.id (not a user id), as on every live team.
      golf_teams: { data: { gender: 'men', created_by: 'c-head', organization_id: 'o1' } },
      golf_coaches: { data: [{ id: 'c-asst', user_id: 'u-asst' }, { id: 'c-head', user_id: 'u-head' }] },
      golf_holes: { data: [] },
      golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 60 }] },
    };
    const data = await loadPlayerHome(player);
    expect(roundsQueries[0]).toContainEqual(['in', ['player_id', ['p1']]]);
    expect(data.coachUserId).toBe('u-head');
    expect(data.handicap).toBe(2.1);
    expect(data.greeting).toMatch(/, Theo$/);
  });

  it('20803 the tables read are exactly the player’s own and the team’s calendar: no roster, and every round id is theirs', async () => {
    const seen: Array<{ table: string; filters: Filters }> = [];
    const answers: Record<string, object> = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: { data: [round(0), round(1)] },
      golf_players: { data: { handicap_index: 2.1, handicap: null } },
      golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
      golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
    };
    // Any table not listed still answers (empty) and is written down, so a new read cannot slip by.
    tables.current = new Proxy({} as import('./supabase-fake').ChFakeTables, {
      get: (_t, table: string) => (filters: Filters) => {
        seen.push({ table, filters: [...filters] });
        return answers[table] ?? { data: [] };
      },
    });
    await loadPlayerHome(player);
    const read = [...new Set(seen.map((s) => s.table))].sort();
    expect(read).toEqual(['golf_coaches', 'golf_event_attendance', 'golf_events', 'golf_holes', 'golf_pga_standards', 'golf_players', 'golf_rounds', 'golf_task_assignments', 'golf_team_settings', 'golf_teams', 'rpc:get_player_hub_events'].sort());
    expect(read).not.toContain('golf_team_members');
    const filtersOf = (table: string) => seen.filter((s) => s.table === table).flatMap((s) => s.filters);
    // Their own replies and their own tasks: never a teammate's.
    for (const table of ['golf_event_attendance', 'golf_task_assignments']) {
      for (const r of seen.filter((s) => s.table === table)) expect(r.filters).toContainEqual(['eq', ['player_id', 'p1']]);
    }
    expect(filtersOf('golf_rounds')).toContainEqual(['in', ['player_id', ['p1']]]);
    expect(filtersOf('golf_players')).toContainEqual(['eq', ['id', 'p1']]);
  });

  it('22101 a failed read never throws: the page loads, each section says it failed, and every read is logged', async () => {
    const boom = { error: { message: 'boom' } };
    tables.current = { golf_team_settings: boom, golf_events: boom, golf_rounds: boom, golf_players: boom, golf_teams: boom };
    const gone = await loadPlayerHome(player);
    expect(gone.week.error).toBe(true);
    expect(gone.latest.error).toBe(true);
    expect(gone.scoring.error).toBe(true);
    expect(gone.legs).toBeNull();
    expect(gone.brief).toBeNull();
    expect(gone.coachUserId).toBeNull();
    expect(gone.handicap).toBeNull();
    for (const r of ['timezone', 'events', 'rounds', 'player', 'team']) expect(logServer).toHaveBeenCalledWith('home', r, expect.anything());

    // The rounds load; the hole-by-hole scores, the Tour benchmarks and the coaches do not.
    logServer.mockClear();
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: { data: [round(0), round(1), round(2)] },
      golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
      golf_holes: boom,
      golf_pga_standards: boom,
      golf_coaches: boom,
    };
    const part = await loadPlayerHome(player);
    expect(part.latest).toMatchObject({ error: false, holesError: true });
    expect(part.legs).toMatchObject({ benchError: true });
    expect(part.coachUserId).toBeNull();
    for (const r of ['holes', 'tourBenchmarks', 'coaches']) expect(logServer).toHaveBeenCalledWith('home', r, expect.anything());
  });
});

describe('Player Home · the phone, on the redesign', () => {
  const real = window.matchMedia;
  afterEach(() => {
    window.matchMedia = real;
  });
  it('21901 at 820px and below Player Home is the phone Home, never the desktop page shrunk', () => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
    show();
    expect(document.querySelector('.ch-h-main--desk')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Your game', 'Today', 'Your latest round']);
  });
});
