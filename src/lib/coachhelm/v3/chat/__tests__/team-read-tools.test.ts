import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';
import { getQualifiers, getTeamRounds, getTournaments } from '../read-tools';

type Result = { data?: unknown; error?: unknown };

/** A PostgREST double: one queued answer per `from(table)` call, every builder method chains. */
function sbWith(script: Record<string, Result[]>) {
  const queues = new Map(Object.entries(script).map(([t, rs]) => [t, [...rs]]));
  return {
    from: vi.fn((table: string) => {
      const r = queues.get(table)?.shift() ?? { data: [] };
      const result = { data: r.data ?? null, error: r.error ?? null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'gte', 'limit']) chain[m] = vi.fn(() => chain);
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return chain;
    }),
  } as never;
}

const person = (id: string, name: string) => ({ id, name, first_name: name, last_name: null, graduation_year: null });
const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 't1',
  team_name: 'Guilford',
  timezone: 'America/New_York',
  roster: [person('p1', 'Avery'), person('p2', 'Blake')],
};

describe('team-wide CoachHelm read tools', () => {
  it('get_team_rounds averages each player, ranks by to par and drops players off the roster', async () => {
    const round = (player_id: string, to: number, score: number) => ({ id: `${player_id}${score}`, player_id, round_date: '2026-10-10', course_name: 'Oak', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, total_score: score, score_to_par: to, total_putts: 30 });
    const env = await getTeamRounds(
      sbWith({ golf_rounds: [{ data: [round('p1', 4, 76), round('p1', 2, 74), round('p2', 1, 73), round('gone', -5, 67)] }] }),
      ctx,
      { round_type: 'qualifier', since_days: 30 },
    );
    const d = env.detail as { players: Array<{ name: string; rounds: number; avg_score: number; avg_to_par: number }>; round_count: number };
    expect(d.round_count).toBe(3);
    expect(d.players.map((p) => p.name)).toEqual(['Blake', 'Avery']);
    expect(d.players[1]).toMatchObject({ rounds: 2, avg_score: 75, avg_to_par: 3 });
    expect(env.coverage).toBe('complete');
  });

  it('get_team_rounds says unavailable, not empty, when the read fails', async () => {
    const env = await getTeamRounds(sbWith({ golf_rounds: [{ error: { message: 'boom' } }] }), ctx, { since_days: 30 });
    expect(env.coverage).toBe('unavailable');
  });

  it('get_tournaments reports status, where the team finished and each player’s round totals', async () => {
    const env = await getTournaments(
      sbWith({
        golf_tournaments: [{ data: [{ id: 'T1', name: 'Fall Invitational', start_date: '2026-10-05', end_date: '2026-10-07', event_kind: 'regular', format: '5c4', field_size: 14, lineup_locked_at: 'x', lineup_published_at: 'x', official_at: 'x' }] }],
        golf_tournament_field_teams: [{ data: [{ tournament_id: 'T1', final_place: 3, final_total: 871 }] }],
        golf_tournament_rounds: [{ data: [{ tournament_id: 'T1', round_number: 1, round_event_id: 'R1', status: 'final' }] }],
        golf_tournament_player_rounds: [{ data: [{ round_event_id: 'R1', player_id: 'p1', entered_total: 72, status: 'ok' }] }],
      }),
      ctx,
      { limit: 6 },
    );
    const t = (env.detail as { tournaments: Array<Record<string, unknown>> }).tournaments[0]!;
    expect(t).toMatchObject({ name: 'Fall Invitational', status: 'official', lineup: 'published', team_place: 3, team_total: 871 });
    expect(t.player_rounds).toEqual([{ player: 'Avery', round: 1, total: 72, status: 'ok' }]);
  });

  it('get_qualifiers ranks players by average to par', async () => {
    const env = await getQualifiers(
      sbWith({
        golf_qualifiers: [{ data: [{ id: 'q1', name: 'Fall Qualifier', status: 'completed', start_date: '2026-09-20', end_date: '2026-09-21', num_rounds: 2, course_name: 'Oak', spots_available: 5, selection_state: 'set' }] }],
        golf_rounds: [{ data: [
          { qualifier_id: 'q1', player_id: 'p1', total_score: 78, score_to_par: 6, qualifier_round_number: 1 },
          { qualifier_id: 'q1', player_id: 'p2', total_score: 72, score_to_par: 0, qualifier_round_number: 1 },
        ] }],
      }),
      ctx,
      { limit: 5 },
    );
    const q = (env.detail as { qualifiers: Array<{ standings: Array<{ player: string; avg_to_par: number }> }> }).qualifiers[0]!;
    expect(q.standings.map((s) => s.player)).toEqual(['Blake', 'Avery']);
  });
});
