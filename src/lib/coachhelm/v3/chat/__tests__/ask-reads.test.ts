import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { attendanceByEvent, classConflicts, getDocuments, getPractice, getTeamPatterns } from '../ask-reads';
import { getCalendar } from '../engine-reads';

const person = (id: string, name: string) => ({ id, name, first_name: name, last_name: null, graduation_year: null });
const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Varsity',
  timezone: 'America/New_York',
  roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett')],
};

type Rows = Record<string, { data?: unknown[]; error?: { code?: string; message: string } | null }>;

/** A PostgREST double: every table answers with its rows (or its error), whatever the chain; `rpc` answers the class day. */
function sbWith(tables: Rows, rpc: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: null, error: { message: 'no rpc' } })) {
  const seen: Array<{ table: string; method: string; args: unknown[] }> = [];
  const sb = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'not', 'order', 'gte', 'lte', 'limit', 'range', 'is', 'or']) {
        chain[m] = vi.fn((...args: unknown[]) => {
          seen.push({ table, method: m, args });
          return chain;
        });
      }
      const t = tables[table] ?? { data: [] };
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: t.error ? null : (t.data ?? []), error: t.error ?? null }).then(resolve);
      return chain;
    }),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => rpc(fn, args)),
  };
  return { sb: sb as never, seen };
}

describe('get_documents', () => {
  it('lists titles, folders and who can see each, and never selects a file', async () => {
    const { sb, seen } = sbWith({ golf_documents: { data: [{ id: 'd1', title: 'Hargrove plan', folder: 'November', category: 'other', is_public: false, updated_at: '2026-11-03T12:00:00Z' }] } });
    const env = await getDocuments(sb, ctx, { limit: 30 });
    expect(env.coverage).toBe('complete');
    expect(env.detail).toMatchObject({ documents: [{ title: 'Hargrove plan', folder: 'November', players_can_see: false }], folders: ['November'] });
    expect(JSON.stringify(seen)).not.toContain('file_url');
  });

  it('says "could not read" for a failed read, never an empty folder', async () => {
    const { sb } = sbWith({ golf_documents: { error: { message: 'boom' } } });
    const env = await getDocuments(sb, ctx, { limit: 30 });
    expect(env.coverage).toBe('unavailable');
  });

  it('marks a full page partial so a long folder is not read as short', async () => {
    const { sb } = sbWith({ golf_documents: { data: [{ id: 'a', title: 'A', folder: null, category: null, is_public: true, updated_at: null }, { id: 'b', title: 'B', folder: null, category: null, is_public: true, updated_at: null }] } });
    const env = await getDocuments(sb, ctx, { limit: 2 });
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toMatch(/most recently changed/);
  });
});

describe('get_practice', () => {
  const events = [{ id: 'e1', title: 'Tuesday range', start_time: '2026-11-03T20:00:00Z', status: 'scheduled' }, { id: 'e2', title: 'Cancelled', start_time: '2026-11-04T20:00:00Z', status: 'cancelled' }];

  it('reads plans, practices held and logged sessions by player, with no shot data', async () => {
    const { sb, seen } = sbWith({
      golf_events: { data: events },
      golf_practice_sessions: { data: [{ player_id: 'p1', session_date: '2026-11-01' }, { player_id: 'p1', session_date: '2026-11-02' }, { player_id: 'p2', session_date: '2026-11-02' }] },
      golf_practice_plans: { data: [{ id: 'pl1', event_id: 'e1', title: 'Range day', step: 'ready', status: 'draft', version: 1, published_version: null, updated_at: '2026-11-02T10:00:00Z' }] },
    });
    const env = await getPractice(sb, ctx, { since_days: 30 });
    expect(env.coverage).toBe('complete');
    const d = env.detail as { practices: Array<{ title: string; plan: unknown }>; sessions_logged: { total: number; by_player: Array<{ player: string; sessions: number }> } };
    expect(d.practices.map((p) => p.title)).toEqual(['Tuesday range']);
    expect(d.practices[0]!.plan).toMatchObject({ title: 'Range day', published: false });
    expect(d.sessions_logged.by_player[0]).toEqual({ player: 'Owen Carter', sessions: 2 });
    expect(JSON.stringify(seen)).not.toContain('shots_data');
  });

  it('is partial, with a note, while the plans table is not there yet', async () => {
    const { sb } = sbWith({ golf_events: { data: events }, golf_practice_plans: { error: { code: '42P01', message: 'relation does not exist' } } });
    const env = await getPractice(sb, ctx, { since_days: 30 });
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toMatch(/not set up/);
  });

  it('is unavailable when the events read fails, which is not "no practice"', async () => {
    const { sb } = sbWith({ golf_events: { error: { message: 'down' } } });
    expect((await getPractice(sb, ctx, { since_days: 30 })).coverage).toBe('unavailable');
  });

  it('does not treat another failure on plans as a missing table', async () => {
    const { sb } = sbWith({ golf_events: { data: events }, golf_practice_plans: { error: { code: '42501', message: 'denied' } } });
    expect((await getPractice(sb, ctx, { since_days: 30 })).coverage).toBe('unavailable');
  });
});

describe('get_calendar replies and class conflicts', () => {
  const event = { id: 'e1', title: 'Team meeting', event_type: 'meeting', start_time: '2026-11-04T21:00:00Z', end_time: '2026-11-04T22:00:00Z', all_day: false, location: 'Film room', status: 'scheduled', requires_rsvp: true };
  const classDay = (blockStart: string, blockEnd: string, tracked = true) => ({
    on: '2026-11-04',
    team_time_zone: 'America/New_York',
    players: [
      { player_id: 'p1', tracked, holds: true, blocks: [{ starts_at: blockStart, ends_at: blockEnd, label: 'STAT 201', kind: 'class', source: 'pattern' }] },
      { player_id: 'p2', tracked: true, holds: true, blocks: [] },
    ],
  });

  it('counts replies per event and names who is in class during it', async () => {
    const { sb } = sbWith(
      { golf_events: { data: [event] }, golf_event_attendance: { data: [{ event_id: 'e1', status: 'accepted', checked_in: true }, { event_id: 'e1', status: 'declined', checked_in: false }, { event_id: 'e1', status: null, checked_in: false }] } },
      () => ({ data: classDay('2026-11-04T21:30:00Z', '2026-11-04T22:30:00Z'), error: null }),
    );
    const env = await getCalendar(sb, ctx, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' });
    const e = (env.detail as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(e.replies).toEqual({ accepted: 1, maybe: 0, declined: 1, pending: 1, checked_in: 1 });
    expect(e.in_class).toEqual(['Owen Carter']);
    expect(env.coverage).toBe('complete');
  });

  it('does not call a class that ends as the event starts a conflict, or name an untracked player', async () => {
    const { sb } = sbWith({ golf_events: { data: [event] }, golf_event_attendance: { data: [] } }, () => ({ data: classDay('2026-11-04T20:00:00Z', '2026-11-04T21:00:00Z'), error: null }));
    const touching = await getCalendar(sb, ctx, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' });
    expect((touching.detail as { events: Array<Record<string, unknown>> }).events[0]!.in_class).toEqual([]);
    const { sb: sb2 } = sbWith({ golf_events: { data: [event] }, golf_event_attendance: { data: [] } }, () => ({ data: classDay('2026-11-04T21:00:00Z', '2026-11-04T22:00:00Z', false), error: null }));
    const untracked = await getCalendar(sb2, ctx, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' });
    expect((untracked.detail as { events: Array<Record<string, unknown>> }).events[0]!.in_class).toEqual([]);
  });

  it('says so when the class read failed, instead of showing a free week', async () => {
    const { sb } = sbWith({ golf_events: { data: [event] }, golf_event_attendance: { data: [] } });
    const env = await getCalendar(sb, ctx, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' });
    const e = (env.detail as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(e).not.toHaveProperty('in_class');
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toMatch(/class conflicts are missing/);
  });

  it('shows no replies for an event that does not ask for any', async () => {
    const { sb } = sbWith({ golf_events: { data: [{ ...event, requires_rsvp: false }] }, golf_event_attendance: { data: [] } }, () => ({ data: classDay('2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z'), error: null }));
    const env = await getCalendar(sb, ctx, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' });
    expect((env.detail as { events: Array<Record<string, unknown>> }).events[0]).not.toHaveProperty('replies');
  });

  it('reads class days for at most 14 dates and says it stopped', async () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ ...event, id: `e${i}`, start_time: `2026-11-${String(i + 1).padStart(2, '0')}T21:00:00Z`, end_time: `2026-11-${String(i + 1).padStart(2, '0')}T22:00:00Z` }));
    const { sb } = sbWith({ golf_events: { data: many }, golf_event_attendance: { data: [] } }, () => ({ data: classDay('2026-11-01T01:00:00Z', '2026-11-01T02:00:00Z'), error: null }));
    const out = await classConflicts(sb, ctx, many);
    expect(out.capped).toBe(true);
    expect((sb as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledTimes(14);
  });

  it('attendance is zero-filled per event so an event nobody replied to reads as zero, not missing', async () => {
    const { sb } = sbWith({ golf_event_attendance: { data: [] } });
    const out = await attendanceByEvent(sb, ['e1']);
    expect(out.counts.get('e1')).toEqual({ accepted: 0, maybe: 0, declined: 0, pending: 0, checked_in: 0 });
  });
});

describe('get_team_patterns', () => {
  it('reads nothing for an empty roster', async () => {
    const { sb } = sbWith({});
    const env = await getTeamPatterns(sb, { ...ctx, roster: [] });
    expect(env.coverage).toBe('empty');
  });

  it('says "could not read" when the reads fail, not "nothing is shared"', async () => {
    const { sb } = sbWith({ golf_coach_insights: { error: { message: 'down' } } });
    expect((await getTeamPatterns(sb, ctx)).coverage).toBe('unavailable');
  });

  it('is empty, with the rounds rule in its note, when no cause is shared', async () => {
    const { sb } = sbWith({ golf_coach_insights: { data: [] }, golf_rounds: { data: [] } });
    const env = await getTeamPatterns(sb, ctx);
    expect(env.coverage).toBe('empty');
    expect(env.coverage_note).toMatch(/counted rounds/);
  });
});
