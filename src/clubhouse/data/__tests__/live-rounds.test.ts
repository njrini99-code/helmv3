import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { chLogServer } from '../../lib/track-server';
import { loadEventScope, loadLiveRounds, loadOwnLiveRound } from '../live-rounds';

const absent = { error: { code: '42P01', message: 'relation does not exist' } };
const NOW = new Date('2026-10-14T18:40:00Z');
const poll = (id: string, over: Record<string, unknown> = {}) => ({
  id, player_id: `p-${id}`, team_id: 't1', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, round_date: '2026-10-14', course_id: 'c1', course_name: 'Pine', holes_played: 18, current_hole: 2,
  status: 'in_progress', created_at: '2026-10-14T17:00:00Z', updated_at: '2026-10-14T18:38:00Z', plan: null, start_hole: null, golf_holes: [{ hole_number: 1, par: 4, score: 4, yardage: 380 }], ...over,
});
const profiles = { 'rpc:golf_player_profiles': { data: [{ id: 'p-a', first_name: 'Ada', last_name: 'Lin' }, { id: 'p-b', first_name: 'Ben', last_name: 'Fox' }] } };

afterEach(() => {
  tables.current = {};
  vi.mocked(chLogServer).mockClear();
});

const base = (rows: unknown[]) => ({ golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_round_live: absent, golf_rounds: { data: rows }, golf_tournament_player_rounds: absent, golf_tournament_rounds: absent, ...profiles });

describe('loadLiveRounds', () => {
  it('reads the team’s live lanes through the viewer’s own session', async () => {
    tables.current = base([poll('a'), poll('b')]);
    const snap = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, now: NOW });
    expect(snap.lanes.map((l) => l.name).sort()).toEqual(['Ada Lin', 'Ben Fox']);
    expect(snap).toMatchObject({ teamId: 't1', zone: 'America/New_York', source: 'poll', error: false });
  });

  it('narrows to a qualifier, a player and a round type from the page’s query', async () => {
    tables.current = base([poll('a'), poll('b', { qualifier_id: 'q2', round_type: 'tournament' })]);
    const q = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, scope: { qualifierId: 'q1' }, now: NOW });
    expect(q.lanes.map((l) => l.playerId)).toEqual(['p-a']);
    const t = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, scope: { type: 'tournament' }, now: NOW });
    expect(t.lanes.map((l) => l.playerId)).toEqual(['p-b']);
    const p = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, scope: { playerId: 'p-b' }, now: NOW });
    expect(p.lanes).toHaveLength(1);
  });

  it('narrows to a calendar event by its day and course: another course that day is left out', async () => {
    tables.current = base([poll('a'), poll('b', { course_id: 'c2' }), poll('c', { round_date: '2026-10-13' })]);
    const snap = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, scope: { eventId: 'e1', date: '2026-10-14', courseId: 'c1' }, now: NOW });
    expect(snap.lanes.map((l) => l.playerId)).toEqual(['p-a']);
  });

  it('flags a failed read and logs it, and never throws into Home', async () => {
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_round_live: { error: { code: '57014', message: 'timeout' } } };
    const snap = await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, now: NOW });
    expect(snap.error).toBe(true);
    expect(snap.lanes).toEqual([]);
    expect(chLogServer).toHaveBeenCalled();
  });

  it('a zone that is not a real zone falls back to the product default', async () => {
    tables.current = { ...base([poll('a')]), golf_team_settings: { data: { timezone: 'Mars/Olympus' } } };
    expect((await loadLiveRounds({ teamId: 't1', viewer: { role: 'coach', playerId: null }, now: NOW })).zone).toBe('America/New_York');
  });
});

describe('loadEventScope', () => {
  it('resolves a calendar event to its day in the team’s zone and its course', async () => {
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_events: { data: { start_time: '2026-10-15T01:30:00Z', course_id: 'c1' } } };
    expect(await loadEventScope({ teamId: 't1', eventId: 'e1' })).toEqual({ eventId: 'e1', date: '2026-10-14', courseId: 'c1' });
  });
  it('is null for an event that is not the team’s', async () => {
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_events: { data: null } };
    expect(await loadEventScope({ teamId: 't1', eventId: 'nope' })).toBeNull();
  });
});

describe('loadOwnLiveRound', () => {
  it('finds the player’s own round in progress, whatever its type', async () => {
    tables.current = base([poll('a', { player_id: 'p-a', round_type: 'practice' })]);
    const lane = await loadOwnLiveRound({ teamId: 't1', playerId: 'p-a', now: NOW });
    expect(lane).toMatchObject({ playerId: 'p-a', roundType: 'practice' });
  });
  it('is null when the round is posted', async () => {
    tables.current = base([poll('a', { player_id: 'p-a', status: 'completed' })]);
    expect(await loadOwnLiveRound({ teamId: 't1', playerId: 'p-a', now: NOW })).toBeNull();
  });
});
