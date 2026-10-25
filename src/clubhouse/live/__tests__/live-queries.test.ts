import { describe, expect, it } from 'vitest';
import { fakeServer, type ChFakeTables } from '../../__tests__/supabase-fake';
import { dayInZone, fetchLiveSnapshot, type LiveClient } from '../live-queries';

const NOW = new Date('2026-10-14T18:40:00Z');

async function client(tables: ChFakeTables): Promise<LiveClient> {
  return (await fakeServer({ current: tables }).createClient()) as unknown as LiveClient;
}

const pollRound = {
  id: 'r1', player_id: 'p1', team_id: 't1', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, round_date: '2026-10-14', course_id: null, course_name: 'Pine', holes_played: 18, current_hole: 2,
  status: 'in_progress', created_at: '2026-10-14T17:00:00Z', updated_at: '2026-10-14T18:38:00Z', plan: null, start_hole: null, golf_holes: [{ hole_number: 1, par: 4, score: 4, yardage: 380 }],
};
const absent = { error: { code: '42P01', message: 'relation does not exist' } };
const profiles = { 'rpc:golf_player_profiles': { data: [{ id: 'p1', first_name: 'Sofia', last_name: 'Reyes' }] } };

describe('dayInZone', () => {
  it('is the team’s day, not the server’s: 01:30 UTC on the 15th is still the 14th in New York', () => {
    expect(dayInZone(new Date('2026-10-15T01:30:00Z'), 'America/New_York')).toBe('2026-10-14');
    expect(dayInZone(new Date('2026-10-15T01:30:00Z'), 'America/New_York', 1)).toBe('2026-10-13');
  });
  it('falls back to the UTC day for a zone it does not know', () => {
    expect(dayInZone(new Date('2026-10-15T01:30:00Z'), 'Not/AZone')).toBe('2026-10-15');
  });
});

describe('fetchLiveSnapshot', () => {
  const args = { teamId: 't1', role: 'coach' as const, playerId: null, now: NOW, zone: 'America/New_York' };

  it('reads the v0 poll while the live table is absent, and names the player through the profiles function', async () => {
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: absent, golf_rounds: { data: [pollRound] }, golf_tournament_player_rounds: absent, golf_tournament_rounds: absent, ...profiles }), args);
    expect(snap).toMatchObject({ source: 'poll', error: false, zone: 'America/New_York' });
    expect(snap.lanes).toHaveLength(1);
    expect(snap.lanes[0]).toMatchObject({ name: 'Sofia Reyes', roundType: 'qualifier', thru: 1 });
  });

  it('reads the live table when it exists', async () => {
    const row = { round_id: 'r1', team_id: 't1', player_id: 'p1', round_type: 'practice', qualifier_id: null, qualifier_round: null, round_date: '2026-10-14', course_id: null, course_name: null, holes_planned: 18, start_position: 1, current_hole: 3, share: 'coaches', phase: 'on_course', thru: 2, to_par: 0, strokes: 8, holes: [], last_hole_at: null, heard_at: '2026-10-14T18:39:00Z', started_at: null, ended_at: null, seq: 5 };
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: { data: [row] }, golf_tournament_rounds: absent, ...profiles }), args);
    expect(snap.source).toBe('live');
    expect(snap.lanes[0]).toMatchObject({ roundType: 'practice', share: 'coaches', seq: 5, source: 'live' });
  });

  it('leaves out a tournament round that a tournament tracks (open call b) and lists the live tournament instead', async () => {
    const tour = { ...pollRound, id: 'r2', round_type: 'tournament' };
    const snap = await fetchLiveSnapshot(
      await client({
        golf_round_live: absent,
        golf_rounds: { data: [pollRound, tour] },
        golf_tournament_player_rounds: { data: [{ round_id: 'r2' }] },
        golf_tournament_rounds: { data: [{ tournament_id: 'tour-1' }] },
        golf_tournaments: { data: [{ id: 'tour-1', name: 'Fall Invitational' }] },
        ...profiles,
      }),
      args,
    );
    expect(snap.lanes.map((l) => l.roundId)).toEqual(['r1']);
    expect(snap.events).toEqual([{ tournamentId: 'tour-1', name: 'Fall Invitational' }]);
  });

  it('keeps an untracked tournament round as a lane when the link table is absent', async () => {
    const tour = { ...pollRound, id: 'r2', round_type: 'tournament' };
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: absent, golf_rounds: { data: [tour] }, golf_tournament_player_rounds: absent, golf_tournament_rounds: absent, ...profiles }), args);
    expect(snap.lanes.map((l) => l.roundId)).toEqual(['r2']);
    expect(snap.events).toEqual([]);
  });

  it('flags a failed read instead of reporting nobody is out', async () => {
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: { error: { code: '57014', message: 'timeout' } } }), args);
    expect(snap.error).toBe(true);
    expect(snap.lanes).toEqual([]);
    const poll = await fetchLiveSnapshot(await client({ golf_round_live: absent, golf_rounds: { error: { code: 'XX', message: 'boom' } } }), args);
    expect(poll.error).toBe(true);
  });

  it('a player sees only their own round before the live table exists, and is withheld from teammates while it is on', async () => {
    const own = { ...pollRound, player_id: 'p1' };
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: absent, golf_rounds: { data: [own] }, golf_tournament_player_rounds: absent, ...profiles }), { ...args, role: 'player', playerId: 'p1' });
    expect(snap.lanes).toHaveLength(1);
    expect(snap.viewerOnCourse).toBe(true);
    expect(snap.events).toEqual([]);
  });

  it('a name the roster already holds costs no read', async () => {
    const snap = await fetchLiveSnapshot(await client({ golf_round_live: absent, golf_rounds: { data: [pollRound] }, golf_tournament_player_rounds: absent, golf_tournament_rounds: absent }), { ...args, roster: { p1: 'Sofia Reyes' } });
    expect(snap.lanes[0]!.name).toBe('Sofia Reyes');
    expect(snap.error).toBe(false);
  });
});
