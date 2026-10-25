import { afterEach, describe, expect, it, vi } from 'vitest';

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const announcements = vi.hoisted(() => ({ current: async (): Promise<unknown> => ({ success: true, data: [] }) }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: () => announcements.current() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { loadHomeWeek, teamLegs } from '../data/home';
import { loadCoachQueue } from '../data/home-queue';
import { briefFor, legRows } from '../data/player-home';
import type { ChRound } from '../data/season';
import type { ChRoundCache } from '../data/stats-common';

const now = new Date('2026-10-01T16:00:00Z');
const event = (id: string, start: string, end: string | null = null, allDay = true) => ({
  id, title: id, event_type: 'tournament', start_time: start, end_time: end, all_day: allDay, location: 'Pines',
});
const load = async (events: ReturnType<typeof event>[], tz = 'America/New_York', at = now) => {
  tables.current = { golf_events: { data: events }, golf_event_attendance: { data: [] } };
  return loadHomeWeek(await createClient(), { teamId: 't1', tz, now: at, names: new Map() });
};

afterEach(() => { tables.current = {}; });

describe('Home calendar completeness', () => {
  it.each(['America/New_York', 'America/Los_Angeles', 'Pacific/Kiritimati'])('keeps an all-day Friday on Friday in %s', async (tz) => {
    const week = await load([event('Fall Invitational', '2026-10-02T00:00:00Z')], tz);
    expect(week.next).toMatchObject({ id: 'Fall Invitational', date: '2026-10-02', allDay: true });
    expect(week.week.days.find((d) => d.date === '2026-10-02')).toMatchObject({ eventCount: 1, hasCompetition: true, competitionType: 'tournament' });
    expect(week.week.days.find((d) => d.date === '2026-10-01')?.eventCount).toBe(0);
    // In Kiritimati it is already Friday, so the summary correctly says today.
    expect(week.nextCompetition?.when).toBe(tz === 'Pacific/Kiritimati' ? 'today' : 'Friday');
    if (tz !== 'Pacific/Kiritimati') expect(week.weekNote).toEqual({ weekday: 'Friday', title: 'Fall Invitational' });
  });

  it('marks a competition day with its type, a tournament over a qualifier on the same day', async () => {
    const week = await load([
      { ...event('Qualifier', '2026-10-02T00:00:00Z'), event_type: 'qualifier' },
      event('Invitational', '2026-10-02T00:00:00Z'),
      { ...event('Q2', '2026-10-03T00:00:00Z'), event_type: 'qualifier' },
      { ...event('Range', '2026-10-01T00:00:00Z'), event_type: 'practice' },
    ]);
    const day = (date: string) => week.week.days.find((d) => d.date === date)?.competitionType;
    expect([day('2026-10-02'), day('2026-10-03'), day('2026-10-01')]).toEqual(['tournament', 'qualifier', null]);
  });

  it('keeps a single-day event up next for the whole team-local day, including after its stored UTC midnight', async () => {
    const week = await load([event('Tournament today', '2026-10-01T00:00:00Z')]);
    expect(week.todayEvents.map((e) => e.id)).toEqual(['Tournament today']);
    expect(week.next?.id).toBe('Tournament today');
    expect(week.week.agenda[0]?.isNext).toBe(true);
    expect(week.nextCompetition?.when).toBe('today');
  });

  it('loads a multi-day tournament that started before the week and includes its final day', async () => {
    const tournament = event('Long Invitational', '2026-09-15T00:00:00Z', '2026-10-01T00:00:00Z');
    const week = await load([tournament]);
    expect(week.todayEvents.map((e) => e.id)).toEqual(['Long Invitational']);
    expect(week.next?.id).toBe('Long Invitational');
    expect(week.week.days.filter((d) => d.eventCount > 0).map((d) => d.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
    expect(week.week.agenda).toHaveLength(1);

    // Enforce the database contract too: a shaping-only fix cannot recover a row
    // that an old start_time lower bound prevented the database from returning.
    tables.current.golf_events = (filters) => {
      expect(filters.some(([op]) => op === 'gte')).toBe(false);
      expect(filters.find(([op]) => op === 'or')?.[1][0]).toMatch(/start_time\.gte\..*,end_time\.gte\./);
      return { data: [tournament] };
    };
    const client = await createClient();
    expect((await loadHomeWeek(client, { teamId: 't1', tz: 'America/New_York', now, names: new Map() })).next?.id).toBe(tournament.id);

    const tomorrow = await load([tournament], 'America/New_York', new Date('2026-10-02T16:00:00Z'));
    expect(tomorrow.todayEvents).toEqual([]);
    expect(tomorrow.next).toBeNull();
  });

  it('still converts a timed UTC instant to the team date and excludes it from Up next after it ends', async () => {
    const timed = event('Late practice', '2026-10-02T01:00:00Z', '2026-10-02T02:00:00Z', false);
    const week = await load([timed]);
    expect(week.next).toMatchObject({ date: '2026-10-01', startLabel: '9:00 PM' });
    expect(week.week.days.find((d) => d.date === '2026-10-01')?.eventCount).toBe(1);
    const after = await load([timed], 'America/New_York', new Date('2026-10-02T03:00:00Z'));
    expect(after.todayEvents).toHaveLength(1);
    expect(after.next).toBeNull();
  });

  it('does not quietly truncate a loaded week at the old 500-event limit or the server page cap', async () => {
    const events = Array.from({ length: 1001 }, (_, i) => event(`e${i}`, '2026-10-01T00:00:00Z'));
    const ranges: unknown[][] = [];
    tables.current = {
      golf_events: (filters) => {
        const range = filters.find(([op]) => op === 'range')![1];
        ranges.push(range);
        return { data: events.slice(Number(range[0]), Number(range[1]) + 1) };
      },
      golf_event_attendance: { data: [] },
    };
    const week = await loadHomeWeek(await createClient(), { teamId: 't1', tz: 'America/New_York', now, names: new Map() });
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(week.todayEvents).toHaveLength(1001);
    expect(week.week.days.find((d) => d.isToday)?.eventCount).toBe(1001);
  });

  it('does not expose a partial first page as a complete week if a later page fails', async () => {
    const events = Array.from({ length: 1000 }, (_, i) => event(`e${i}`, '2026-10-01T00:00:00Z'));
    tables.current = {
      golf_events: (filters) => Number(filters.find(([op]) => op === 'range')![1][0]) === 0
        ? { data: events }
        : { error: { message: 'Second page unavailable' } },
      golf_event_attendance: { data: [] },
    };
    const week = await loadHomeWeek(await createClient(), { teamId: 't1', tz: 'America/New_York', now, names: new Map() });
    expect(week.week.error).toBe(true);
    expect(week.next).toBeNull();
    expect(week.todayEvents).toEqual([]);
    expect(week.nextCompetition).toBeNull();
    expect(week.weekNote).toBeNull();
  });

  it('does not pair three accepted replies with only two resolved identities out of four invitees', async () => {
    tables.current = {
      golf_events: { data: [event('Practice', '2026-10-01T00:00:00Z')] },
      golf_event_attendance: { data: ['p1', 'p2', 'p3', 'p4'].map((player_id, i) => ({
        id: `a${i}`, event_id: 'Practice', player_id, status: i < 3 ? 'accepted' : 'pending',
      })) },
    };
    const week = await loadHomeWeek(await createClient(), {
      teamId: 't1', tz: 'America/New_York', now, names: new Map([['p1', 'Ada Lin'], ['p2', 'Bo Fox']]),
    });
    expect(week.next?.invitees).toEqual(['Ada Lin', 'Bo Fox']);
    expect(week.next?.going).toBeNull();
    // The attendance rows still reliably establish the agenda's raw count.
    expect(week.week.agenda[0]?.detail).toBe('Pines · 4 players');
  });
});

describe('Player Home truthful brief', () => {
  const rounds = [{ total_score: 72 }] as ChRound[];
  it.each([0, 0.03, -0.03])('does not call an effectively neutral leg a strokes-gained loss (%s)', (sg) => {
    const legs = legRows([], new Map(), null, { tee: sg, approach: sg, around: sg, putting: sg });
    expect(briefFor(rounds, legs)).toBe('Your last round was 72.');
  });

  it('still names a measured loss when another leg is neutral', () => {
    const legs = legRows([], new Map(), null, { tee: 0, approach: -0.9, around: null, putting: null });
    expect(briefFor(rounds, legs)).toBe('Your last round was 72. Approach is costing the most, 0.9 strokes a round.');
  });

  it.each([null, 0])('distinguishes unknown sand saves from a measured zero (%s)', (saves) => {
    const window = [{ id: 'r1' }] as ChRound[];
    const cache = new Map([['r1', {
      round_id: 'r1', scrambles_converted: 1, scramble_attempts: 2, sand_attempts: 3, sand_saves: saves,
    } as ChRoundCache]]);
    const short = legRows(window, cache, null, { tee: null, approach: null, around: null, putting: null }).find((l) => l.key === 'short');
    expect(short?.note).toBe(saves === null ? 'Up and down 1 of 2' : 'Up and down 1 of 2 · sand saves 0 of 3');
  });
});

describe('Player Home legs hold to the rate floors (A7)', () => {
  const none = { tee: null, approach: null, around: null, putting: null };
  it('one bunker-free round of scrambling is not "100%": under ten chances it says what it needs; one round of greens needs two', () => {
    const window = [{ id: 'r1', total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14 }] as ChRound[];
    const cache = new Map([['r1', { round_id: 'r1', scrambles_converted: 1, scramble_attempts: 1 } as ChRoundCache]]);
    const by = Object.fromEntries(legRows(window, cache, null, none).map((l) => [l.key, l]));
    expect(by.short).toMatchObject({ value: null, needs: 'Needs 10 chances' });
    expect(by.approach).toMatchObject({ value: null, needs: 'Needs 2 rounds' });
    expect(by.tee).toMatchObject({ value: null, needs: 'Needs 2 rounds' });
    // The counts stay: "1 of 1" is a fact, not a rate.
    expect(by.short!.note).toBe('Up and down 1 of 1');
  });

  it('between the floors a rate is an early read', () => {
    const window = ['a', 'b', 'c'].map((id) => ({ id, total_gir: 9, total_gir_possible: 18 })) as ChRound[];
    const approach = legRows(window, new Map(), null, none).find((l) => l.key === 'approach')!;
    expect(approach).toMatchObject({ value: 50, early: 'Early read · 3 rounds' });
  });
});

describe('Coach Home · 20105 the team’s four parts (spec B §1)', () => {
  let seq = 0;
  const round = (o: { player?: string; back?: number; tee?: number | null; totalOnly?: boolean; fairways?: number } = {}): ChRound => {
    const d = new Date('2026-09-30T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - (o.back ?? seq));
    return {
      id: `r${String(++seq).padStart(4, '0')}`, player_id: o.player ?? 'p1', course_name: 'Home', tees_played: null,
      round_date: d.toISOString().slice(0, 10), round_type: 'practice', total_score: 72, score_to_par: 0, front_nine: null, back_nine: null,
      holes_played: 18, total_putts: 30, total_gir: 10, total_gir_possible: 18, total_fairways_hit: o.fairways ?? 8, total_fairways: 14,
      strokes_gained_total: o.tee ?? null, strokes_gained_tee: o.tee ?? null, strokes_gained_approach: null, strokes_gained_around_green: null,
      strokes_gained_putting: null, ...(o.totalOnly ? { total_only: true } : {}),
    } as ChRound;
  };
  const players = [{ id: 'p1', first_name: 'Ada', last_name: 'Lin' }, { id: 'p2', first_name: 'Bo', last_name: 'Fox' }];
  const cache = { byRound: new Map<string, ChRoundCache>(), error: false };
  const legs = (full: ChRound[], over: Partial<Parameters<typeof teamLegs>[0]> = {}) => teamLegs({ full, players, cache, bench: { bench: new Map(), error: false }, tour: 'pga', ...over });
  const tee = (l: ReturnType<typeof legs>) => l!.rows.find((r) => r.key === 'tee')!;

  it('strokes gained in a part is null under 3 rounds with hole scores, however many totals sit beside them', () => {
    const two = [round({ tee: 0.5, back: 1 }), round({ tee: 0.3, back: 2 }), ...[3, 4, 5].map((back) => round({ tee: 0.9, back, totalOnly: true }))];
    expect(legs(two)!.holeRounds).toBe(2);
    expect(tee(legs(two)).sg).toBeNull();
    expect(tee(legs(two)).delta).toBeNull();
    const three = [...two, round({ tee: 0.4, back: 6 })];
    expect(tee(legs(three)).sg).toBeCloseTo(0.4, 5);
  });

  it('flags up-and-down that didn’t load (cacheError) and Tour marks that didn’t load (tourError), each on its own', () => {
    const full = [1, 2, 3].map((back) => round({ tee: 0.2, back }));
    expect(legs(full)).toMatchObject({ cacheError: false, tourError: false });
    expect(legs(full, { cache: { byRound: new Map(), error: true } })).toMatchObject({ cacheError: true, tourError: false });
    const noTour = legs(full, { bench: { bench: new Map(), error: true } })!;
    expect(noTour).toMatchObject({ cacheError: false, tourError: true });
    expect(noTour.rows.every((r) => r.stat.tour == null)).toBe(true);
    // An unknown tour (the team row didn't load) has no marks and says nothing.
    expect(legs(full, { bench: null })).toMatchObject({ tourError: false });
  });

  it('reads only the roster’s rounds: a former player’s round never reaches the figures or the grid', () => {
    const mine = [1, 2, 3].map((back) => round({ tee: 0.2, back }));
    const gone = [1, 2, 3].map((back) => round({ player: 'gone', tee: 3, back }));
    const l = legs([...mine, ...gone])!;
    expect(l.holeRounds).toBe(3);
    expect(tee(l).sg).toBeCloseTo(0.2, 5);
    expect(tee(l).gains?.ids).toEqual(['p1']);
  });

  it('is null with no round in the window', () => {
    expect(legs([])).toBeNull();
  });
});

describe('Coach Home · 20104 what’s waiting on the coach (spec B §2)', () => {
  const at = new Date('2026-10-01T16:00:00Z');
  const queue = async () => loadCoachQueue(await createClient(), { teamId: 't1', userId: 'u1', now: at, tz: Promise.resolve('America/New_York'), names: Promise.resolve(new Map([['p1', 'Ada Lin'], ['p2', 'Bo Fox']])) });
  const replyEvent = { id: 'e1', start_time: '2026-10-02T18:00:00Z', end_time: null, all_day: false, status: null, cancelled_at: null, rsvp_deadline: null, requires_rsvp: true };
  const answered = () => ({
    golf_team_join_requests: { count: 2 },
    golf_events: { data: [replyEvent] },
    golf_event_attendance: { data: [{ event_id: 'e1', player_id: 'p1', status: 'pending' }, { event_id: 'e1', player_id: 'p2', status: 'accepted' }] },
    golf_tasks: { data: [{ id: 't1', due_date: '2026-09-20' }, { id: 't2', due_date: '2026-12-01' }] },
    golf_task_assignments: { data: [{ task_id: 't1', status: 'pending' }, { task_id: 't2', status: 'pending' }] },
    golf_announcement_recipients: { data: [] },
    golf_announcement_acknowledgements: { data: [{ announcement_id: 'n1', player_id: 'p1' }] },
  });
  afterEach(() => {
    announcements.current = async () => ({ success: true, data: [] });
    logServer.mockClear();
  });

  it('counts each part with the read and rule of the screen that holds it', async () => {
    tables.current = answered();
    announcements.current = async () => ({ success: true, data: [{ id: 'n1', requires_acknowledgement: true }, { id: 'n2', requires_acknowledgement: false }] });
    expect(await queue()).toEqual({ joinRequests: 2, replies: { missing: 1, events: [{ id: 'e1', date: '2026-10-02', missing: 1 }] }, overdueTasks: 1, unackedPosts: 1 });
  });

  it('a part that fails is null and logged, never 0, and the others still count', async () => {
    tables.current = { ...answered(), golf_tasks: { error: { message: 'boom' } } };
    const q = await queue();
    expect(q.overdueTasks).toBeNull();
    expect(q.joinRequests).toBe(2);
    expect(q.replies?.missing).toBe(1);
    expect(logServer).toHaveBeenCalledWith('home', 'queue tasks', expect.anything());
  });

  it('every part failing is four nulls, never four zeros', async () => {
    const boom = { error: { message: 'boom' } };
    tables.current = { golf_team_join_requests: boom, golf_events: boom, golf_tasks: boom };
    announcements.current = async () => ({ success: false, error: 'boom' });
    expect(await queue()).toEqual({ joinRequests: null, replies: null, overdueTasks: null, unackedPosts: null });
  });

  it('replies that didn’t load, or acknowledgements that didn’t load, are unknown rather than short', async () => {
    tables.current = { ...answered(), golf_event_attendance: { error: { message: 'boom' } }, golf_announcement_acknowledgements: { error: { message: 'boom' } } };
    announcements.current = async () => ({ success: true, data: [{ id: 'n1', requires_acknowledgement: true }] });
    const q = await queue();
    expect(q.replies).toBeNull();
    expect(q.unackedPosts).toBeNull();
    expect(q.joinRequests).toBe(2);
  });

  it('an event past its reply deadline asks nothing more', async () => {
    tables.current = { ...answered(), golf_events: { data: [{ ...replyEvent, rsvp_deadline: '2026-09-30T12:00:00Z' }] } };
    expect((await queue()).replies).toEqual({ missing: 0, events: [] });
  });
});
