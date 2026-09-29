import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Home: every numbered state in docs/clubhouse/catalog/home.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadCoachHome, type ChCoachHome } from '../data/home';
import { CoachHome, CoachHomeNoTeam } from '../screens/home/CoachHome';
import { HomeActions } from '../screens/home/HomeActions';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { LatestRound } from '../screens/home/LatestRound';
import { Leaderboard } from '../screens/home/Leaderboard';
import { Week, dayLabel } from '../screens/home/Week';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_HOME } from '../preview/fixtures';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const home = (over: Partial<ChCoachHome> = {}): ChCoachHome => ({ ...PREVIEW_HOME, ...over });
const load = () => loadCoachHome({ teamId: 't1', coachName: 'Maya Reyes' });
const logged = (read: string) => expect(logServer).toHaveBeenCalledWith('home', read, expect.anything());

/** An event today at 3pm Eastern, inside the loader's week window. */
function todayEvent() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { id: 'e1', title: 'Short-game block', event_type: 'practice', start_time: `${d}T19:00:00Z`, end_time: `${d}T21:00:00Z`, all_day: false, location: 'Practice green' };
}

beforeEach(() => {
  hapticSpy.mockClear();
  logServer.mockClear();
  router.push.mockClear();
  tables.current = {};
});

describe('Home · reads that fail', () => {
  it('CH-2201 the week does not load: a notice with Try again, never an empty week', async () => {
    tables.current = { golf_events: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.week.error).toBe(true);
    logged('events');
    wrap(<Week week={data.week} />);
    await expectCode('CH-2201', /schedule didn't load/);
    expect(code('CH-2301')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-2202 CH-2204 the roster does not load: rounds and the leaderboard both say so', async () => {
    tables.current = { golf_team_members: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.latestRounds.error).toBe(true);
    expect(data.leaderboard.error).toBe(true);
    logged('roster');
    wrap(
      <>
        <LatestRound data={data.latestRounds} />
        <Leaderboard data={data.leaderboard} />
      </>,
    );
    await expectCode('CH-2202', /Recent rounds didn't load/);
    await expectCode('CH-2204', /leaderboard didn't load/);
  });

  it('CH-2203 hole-by-hole does not load: the total stays, and the card says why', () => {
    const r = { ...PREVIEW_HOME.latestRounds.rounds[0]!, holes: null };
    wrap(<LatestRound data={{ rounds: [r], error: false, holesError: true }} />);
    expect(code('CH-2203')!.textContent).toMatch(/didn’t load for this round\. The total above is correct/);
  });

  it('CH-2205 CH-2206 CH-2207 a section that crashes is contained; the rest of Home stays', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = home({
      week: { ...PREVIEW_HOME.week, days: null as never },
      latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: null as never },
      leaderboard: { ...PREVIEW_HOME.leaderboard, rows: null as never },
    });
    wrap(<CoachHome data={broken} />);
    expect(code('CH-2205')!.textContent).toMatch(/This week couldn’t be shown/);
    expect(code('CH-2206')!.textContent).toMatch(/The latest round couldn’t be shown/);
    expect(code('CH-2207')!.textContent).toMatch(/The leaderboard couldn’t be shown/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(PREVIEW_HOME.greeting);
    quiet.mockRestore();
  });

  it('CH-2208 the team chat does not load: Message team opens Messages instead', async () => {
    tables.current = { golf_conversations: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.teamChatId).toBeNull();
    logged('team chat');
    wrap(<HomeActions teamChatId={data.teamChatId} />);
    expect(screen.getByRole('link', { name: /Message team/ }).getAttribute('href')).toBe('/golf/dashboard/messages');
  });

  it('CH-2209 replies do not load: the agenda drops who is invited instead of saying 0 players', async () => {
    tables.current = { golf_events: { data: [todayEvent()] }, golf_event_attendance: { error: { message: 'boom' } } };
    const data = await load();
    logged('attendance');
    const row = data.week.agenda.find((r) => r.id === 'e1')!;
    expect(row.detail).toBe('Practice green');
  });

  it('CH-2210 the timezone does not load: Home reads the week in Eastern time', async () => {
    tables.current = { golf_team_settings: { error: { message: 'boom' } } };
    const data = await load();
    logged('timezone');
    const et = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    expect(data.todayLabel).toBe(et);
  });
});

describe('Home · empty', () => {
  it('CH-2301 nothing today', () => {
    wrap(<Week week={{ ...PREVIEW_HOME.week, agenda: [] }} />);
    expect(code('CH-2301')!.textContent).toMatch(/Nothing on the calendar today/);
  });

  it('CH-2302 no rounds posted yet', () => {
    wrap(<LatestRound data={{ rounds: [], error: false, holesError: false }} />);
    expect(code('CH-2302')!.textContent).toMatch(/No rounds posted yet this season/);
  });

  it('CH-2303 a round posted as a total', () => {
    const r = { ...PREVIEW_HOME.latestRounds.rounds[0]!, holes: null };
    wrap(<LatestRound data={{ rounds: [r], error: false, holesError: false }} />);
    expect(code('CH-2303')!.textContent).toMatch(/Posted as a total/);
  });

  it('CH-2304 no players on the roster', () => {
    wrap(<Leaderboard data={{ rows: [], scorecards: 0, rosterSize: 0, error: false }} />);
    expect(code('CH-2304')!.textContent).toMatch(/No players on the roster yet/);
  });

  it('CH-2305 players but no 18-hole rounds', () => {
    wrap(<Leaderboard data={{ rows: [], scorecards: 0, rosterSize: 6, error: false }} />);
    expect(code('CH-2305')!.textContent).toMatch(/6 players are on the roster/);
  });

  it('CH-2306 strokes gained is an early read until three rounds', () => {
    wrap(<Leaderboard data={PREVIEW_HOME.leaderboard} />);
    expect(code('CH-2306')!.textContent).toBe('Early read');
    expect(code('CH-2306')!.getAttribute('title')).toMatch(/after three rounds/);
  });

  it('CH-2307 a coach with no team', () => {
    wrap(<CoachHomeNoTeam />);
    expect(code('CH-2307')!.textContent).toMatch(/You aren't on a team yet/);
  });
});

describe('Home · loading, motion, haptics, accessibility', () => {
  afterEach(() => vi.restoreAllMocks());

  it('CH-2401 the route skeleton is busy and shaped like the page', () => {
    wrap(<HomeSkeleton />);
    expect(code('CH-2401')!.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-2401')!.querySelectorAll('.ch-h-lb__row')).toHaveLength(5);
  });

  it('CH-2701 paging the latest round ticks and announces the position', async () => {
    const user = userEvent.setup();
    wrap(<LatestRound data={PREVIEW_HOME.latestRounds} />);
    expect(screen.getByText('1 of 3').getAttribute('aria-live')).toBe('polite');
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('CH-2702 CH-2801 N opens a new event, but not while typing', async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <input aria-label="Somewhere to type" />
        <HomeActions teamChatId="c1" />
      </>,
    );
    await user.click(screen.getByRole('textbox', { name: 'Somewhere to type' }));
    await user.keyboard('n');
    expect(router.push).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('n');
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/calendar?new=1');
    expect(hapticSpy).toHaveBeenCalledWith('press');
  });

  it('CH-2802 each day says how many events it has, in words', () => {
    expect(dayLabel(0, false)).toBe('no events');
    expect(dayLabel(1, false)).toBe('1 event');
    expect(dayLabel(2, true)).toBe('competition, 2 events');
    wrap(<Week week={PREVIEW_HOME.week} />);
    expect(screen.getByRole('list', { name: 'Days this week' }).querySelector('[aria-current="date"]')!.textContent).toMatch(/4 events/);
  });

  it('CH-2803 the leaderboard and scorecard are tables: every cell sits in a row with headers', () => {
    wrap(
      <>
        <LatestRound data={PREVIEW_HOME.latestRounds} />
        <Leaderboard data={PREVIEW_HOME.leaderboard} />
      </>,
    );
    const rows = document.querySelectorAll('[role="row"]');
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) for (const child of row.children) expect(['cell', 'columnheader', 'rowheader']).toContain(child.getAttribute('role'));
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
  });
});
