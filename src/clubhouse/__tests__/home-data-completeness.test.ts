import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { loadHomeWeek } from '../data/home';
import { briefFor, legRows } from '../data/player-home';
import type { ChRound } from '../data/season';

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
    expect(week.week.days.find((d) => d.date === '2026-10-02')).toMatchObject({ eventCount: 1, hasCompetition: true });
    expect(week.week.days.find((d) => d.date === '2026-10-01')?.eventCount).toBe(0);
    // In Kiritimati it is already Friday, so the summary correctly says today.
    expect(week.nextCompetition?.when).toBe(tz === 'Pacific/Kiritimati' ? 'today' : 'Friday');
    if (tz !== 'Pacific/Kiritimati') expect(week.weekNote).toEqual({ weekday: 'Friday', title: 'Fall Invitational' });
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
});
