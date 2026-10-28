import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';
import { getQualifiers, getTeamRounds, getTournaments } from '../read-tools';
import { collectScopedNumbers } from '../provenance';
import { computeTurnVerdict } from '../verdict';

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
  it('get_team_rounds averages each player and ranks by to par', async () => {
    const round = (player_id: string, to: number, score: number) => ({ id: `${player_id}${score}`, player_id, round_date: '2026-10-10', course_name: 'Oak', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, total_score: score, score_to_par: to, total_putts: 30 });
    const env = await getTeamRounds(
      sbWith({ golf_rounds: [{ data: [round('p1', 4, 76), round('p1', 2, 74), round('p2', 1, 73)] }] }),
      ctx,
      { round_type: 'qualifier', since_days: 30 },
    );
    const d = env.detail as { players: Array<{ name: string; rounds: number; avg_score: number; avg_to_par: number }>; round_count: number };
    expect(d.round_count).toBe(3);
    expect(d.players.map((p) => p.name)).toEqual(['Blake', 'Avery']);
    expect(d.players[1]).toMatchObject({ rounds: 2, avg_score: 75, avg_to_par: 3 });
    expect(env.coverage).toBe('complete');
  });

  it('get_team_rounds asks for qualifier rounds under both spellings, so older “qualifying” rounds count', async () => {
    const sb = sbWith({ golf_rounds: [{ data: [] }] }) as unknown as { from: ReturnType<typeof vi.fn> };
    await getTeamRounds(sb as never, ctx, { round_type: 'qualifier', since_days: 30 });
    const chain = sb.from.mock.results[0]!.value as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.in).toHaveBeenCalledWith('round_type', ['qualifier', 'qualifying']);
    expect(chain.eq).not.toHaveBeenCalledWith('round_type', expect.anything());
  });

  it('get_team_rounds counts an older “qualifying” round as a qualifier round and reports it as one', async () => {
    const row = (id: string, round_type: string) => ({ id, player_id: 'p1', round_date: '2026-10-10', course_name: 'Oak', round_type, qualifier_id: 'q1', qualifier_round_number: 1, total_score: 74, score_to_par: 2, total_putts: 30 });
    const env = await getTeamRounds(
      sbWith({ golf_rounds: [{ data: [row('r1', 'qualifying'), row('r2', 'qualifier')] }] }),
      ctx,
      { round_type: 'qualifier', since_days: 30 },
    );
    const d = env.detail as { round_count: number; players: Array<{ rounds: number }>; recent_rounds: Array<{ round_type: string }> };
    expect(d.round_count).toBe(2);
    expect(d.players[0]).toMatchObject({ rounds: 2 });
    expect(d.recent_rounds.map((r) => r.round_type)).toEqual(['qualifier', 'qualifier']);
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

  it('get_qualifiers ranks players by total to par in the board’s order, with positions', async () => {
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
    const q = (env.detail as { qualifiers: Array<{ standings: Array<{ player: string; position: string; rank: number }> }> }).qualifiers[0]!;
    expect(q.standings.map((s) => [s.player, s.rank, s.position])).toEqual([
      ['Blake', 1, '1'],
      ['Avery', 2, '2'],
    ]);
  });

  it('get_qualifiers uses the board’s order: a card a round short below a full card with a worse average, ties shared', async () => {
    const roster = [person('p1', 'Avery'), person('p2', 'Blake'), person('p3', 'Casey'), person('p4', 'Drew')];
    const r = (player_id: string, n: number | null, total: number | null, toPar: number | null) => ({ qualifier_id: 'q1', player_id, total_score: total, score_to_par: toPar, qualifier_round_number: n });
    const env = await getQualifiers(
      sbWith({
        golf_qualifiers: [{ data: [{ id: 'q1', name: 'Fall Qualifier', status: 'completed', start_date: '2026-09-20', end_date: '2026-09-21', num_rounds: 2, course_name: 'Oak', spots_available: 2, selection_state: 'closed' }] }],
        golf_rounds: [{ data: [
          // Avery: one round of two, the best to par: short, so below every full card.
          r('p1', 1, 70, -2),
          // Blake and Casey: both rounds, level on to par and strokes: tied.
          r('p2', 1, 73, 1), r('p2', 2, 73, 1),
          r('p3', 1, 74, 2), r('p3', 2, 72, 0),
          // Drew: both rounds, plus a second card in round 2 that counts once, and a round with no total.
          r('p4', 1, 72, 0), r('p4', 2, 72, 0), r('p4', 2, 60, -12), r('p4', null, null, null),
        ] }],
      }),
      { ...ctx, roster },
      { limit: 5 },
    );
    const q = (env.detail as { qualifiers: Array<{ standings: Array<{ player: string; position: string; rounds: number; total_to_par: number; short_card: boolean }> }> }).qualifiers[0]!;
    expect(q.standings.map((s) => [s.player, s.position, s.rounds, s.total_to_par, s.short_card])).toEqual([
      ['Drew', '1', 2, 0, false],
      ['Blake', 'T2', 2, 2, false],
      ['Casey', 'T2', 2, 2, false],
      ['Avery', '4', 1, -2, true],
    ]);
  });

  it('an answer written from these envelopes passes the numeric audit', async () => {
    const round = (player_id: string, to: number, score: number) => ({ id: `${player_id}${score}`, player_id, round_date: '2026-10-10', course_name: 'Oak', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, total_score: score, score_to_par: to, total_putts: 30 });
    const env = await getTeamRounds(sbWith({ golf_rounds: [{ data: [round('p1', 4, 76), round('p1', 2, 74), round('p2', 1, 73)] }] }), ctx, { round_type: 'qualifier', since_days: 30 });
    const verdict = computeTurnVerdict({
      streamComplete: true,
      text: 'Blake averaged 73 over 1 qualifier round, 1 over par. Avery averaged 75 over 2 rounds, 3 over par.',
      measurements: env.measurements,
      series: env.series,
      detailNumbers: collectScopedNumbers(env.detail),
      players: ctx.roster,
      timezone: ctx.timezone,
    });
    expect(verdict).toEqual({ outcome: 'accepted' });
  });

  it('a made-up figure about the same players is still rejected', async () => {
    const round = (player_id: string, to: number, score: number) => ({ id: `${player_id}${score}`, player_id, round_date: '2026-10-10', course_name: 'Oak', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, total_score: score, score_to_par: to, total_putts: 30 });
    const env = await getTeamRounds(sbWith({ golf_rounds: [{ data: [round('p2', 1, 73)] }] }), ctx, { since_days: 30 });
    const verdict = computeTurnVerdict({
      streamComplete: true,
      text: 'Blake averaged 68 in the qualifier.',
      measurements: env.measurements,
      series: env.series,
      detailNumbers: collectScopedNumbers(env.detail),
      players: ctx.roster,
      timezone: ctx.timezone,
    });
    expect(verdict.outcome).toBe('rejected');
  });
});

describe('a capped team read is never called complete (2026-10-28)', () => {
  const qualifier = { id: 'q1', name: 'Fall Qualifier', status: 'completed', start_date: '2026-09-20', end_date: '2026-09-21', num_rounds: 2, course_name: 'Oak', spots_available: 5, selection_state: 'set' };
  const qRound = (i: number) => ({ qualifier_id: 'q1', player_id: i % 2 ? 'p1' : 'p2', total_score: 72 + (i % 5), score_to_par: i % 5, qualifier_round_number: 1 });
  const teamRound = (i: number) => ({ id: `r${i}`, player_id: i % 2 ? 'p1' : 'p2', round_date: '2026-10-10', course_name: 'Oak', round_type: 'practice', qualifier_id: null, qualifier_round_number: null, total_score: 72 + (i % 5), score_to_par: i % 5, total_putts: 30 });

  it('get_qualifiers at its 900-round cap is partial and says why', async () => {
    const env = await getQualifiers(
      sbWith({ golf_qualifiers: [{ data: [qualifier] }], golf_rounds: [{ data: Array.from({ length: 900 }, (_, i) => qRound(i)) }] }),
      ctx,
      { limit: 5 },
    );
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toMatch(/900/);
  });

  it('get_qualifiers under the cap stays complete', async () => {
    const env = await getQualifiers(
      sbWith({ golf_qualifiers: [{ data: [qualifier] }], golf_rounds: [{ data: Array.from({ length: 12 }, (_, i) => qRound(i)) }] }),
      ctx,
      { limit: 5 },
    );
    expect(env.coverage).toBe('complete');
    expect(env.coverage_note).toBeNull();
  });

  it('get_team_rounds at its 600-round cap marks every per-player figure and the weekly line partial, not only the envelope', async () => {
    const env = await getTeamRounds(sbWith({ golf_rounds: [{ data: Array.from({ length: 600 }, (_, i) => teamRound(i)) }] }), ctx, { since_days: 60 });
    expect(env.coverage).toBe('partial');
    expect(env.measurements.length).toBe(2);
    for (const m of env.measurements) {
      expect(m.coverage).toBe('partial');
      expect(m.coverage_note).toMatch(/600/);
    }
    for (const s of env.series) expect(s.coverage).toBe('partial');
  });

  it('get_team_rounds under the cap keeps its per-player figures complete', async () => {
    const env = await getTeamRounds(sbWith({ golf_rounds: [{ data: Array.from({ length: 20 }, (_, i) => teamRound(i)) }] }), ctx, { since_days: 60 });
    expect(env.coverage).toBe('complete');
    expect(env.measurements.every((m) => m.coverage === 'complete' && m.coverage_note === null)).toBe(true);
  });
});
