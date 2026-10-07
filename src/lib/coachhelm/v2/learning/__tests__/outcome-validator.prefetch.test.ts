import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import {
  prefetchCandidateRounds,
  validatePredictionAgainstOutcome,
  PREFETCH_ROW_CAP,
  type RipePrediction,
} from '../outcome-validator';

// ---------------------------------------------------------------------------
// Sentry N+1 JAVASCRIPT-NEXTJS-SV (`GET /api/cron/coachhelm-validation`): the
// hourly cron read golf_rounds once PER ripe prediction — 115 reads every hour
// in production (2026-09-26), all for windows that closed empty. The batch
// prefetch makes that one read, and must not change any grading outcome.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Thenable query-builder stub. Every `from(table)` call is recorded; a
 * golf_rounds read resolves to the rows the test supplies, filtered by the
 * `player_id` eq/in filter the caller applied (so a batch read and a
 * per-prediction read see the same world).
 */
function fakeSupabase(rounds: Row[], opts: { truncate?: boolean } = {}) {
  const reads: Array<{ table: string; players: string[] }> = [];
  const from = vi.fn((table: string) => {
    const state: { players: string[] } = { players: [] };
    reads.push({ table, players: state.players });
    const result = () => {
      if (table !== 'golf_rounds') return { data: null, error: null };
      if (opts.truncate) {
        return { data: Array.from({ length: PREFETCH_ROW_CAP }, () => rounds[0]), error: null };
      }
      return { data: rounds.filter((r) => state.players.includes(r.player_id as string)), error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, v: string) => {
        if (col === 'player_id') state.players.push(v);
        return builder;
      },
      in: (col: string, v: string[]) => {
        if (col === 'player_id') state.players.push(...v);
        return builder;
      },
      gt: () => builder,
      lte: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: () => builder,
      update: () => builder,
      single: () => builder,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(res, rej),
    };
    return builder;
  });
  return { client: { from } as never, reads };
}

function prediction(id: string, player: string): RipePrediction {
  return {
    id,
    player_id: player,
    metric: 'score_to_par',
    predicted_value: 3,
    predicted_low: 1,
    predicted_high: 5,
    confidence_interval_low: null,
    confidence_interval_high: null,
    created_at: '2026-08-01T12:00:00Z',
    due_date: '2026-08-15',
    related_round_id: null,
  };
}

describe('prefetchCandidateRounds — one golf_rounds read per batch', () => {
  const lone = prediction('p3', 'B');
  const batch = [prediction('p1', 'A'), prediction('p2', 'A'), lone];

  it('grades a 3-prediction batch with exactly one golf_rounds read', async () => {
    const { client, reads } = fakeSupabase([]);
    const prefetched = await prefetchCandidateRounds(client, batch);
    for (const p of batch) {
      await expect(validatePredictionAgainstOutcome(client, p, prefetched)).resolves.toEqual({
        skipped: 'no_round_in_closed_window',
      });
    }
    expect(reads.filter((r) => r.table === 'golf_rounds')).toHaveLength(1);
    expect(reads[0]?.players.sort()).toEqual(['A', 'B']);
  });

  it('keeps each prediction on its own window (a round outside it does not grade)', async () => {
    // Played inside the batch's union window but after p-late's due date.
    const rounds = [
      { id: 'r1', player_id: 'A', round_date: '2026-08-20', created_at: '2026-08-20T10:00:00Z', score_to_par: 4 },
    ];
    const early = prediction('p-early', 'A');
    const late = { ...prediction('p-late', 'A'), due_date: '2026-08-30' };
    const { client } = fakeSupabase(rounds);
    const prefetched = await prefetchCandidateRounds(client, [early, late]);
    await expect(validatePredictionAgainstOutcome(client, early, prefetched)).resolves.toEqual({
      skipped: 'no_round_in_closed_window',
    });
    // p-late's window contains r1, so it grades: the insert stub returns no
    // row, so persisting throws, which proves it got past "pending".
    await expect(validatePredictionAgainstOutcome(client, late, prefetched)).rejects.toThrow(
      /golf_prediction_validations/,
    );
  });

  it('a truncated batch read is discarded and every player falls back to its own read', async () => {
    const { client, reads } = fakeSupabase([{ id: 'r', player_id: 'A', round_date: '2026-08-02' }], {
      truncate: true,
    });
    const prefetched = await prefetchCandidateRounds(client, batch);
    expect(prefetched.size).toBe(0);
    await validatePredictionAgainstOutcome(client, lone, prefetched);
    expect(reads.filter((r) => r.table === 'golf_rounds')).toHaveLength(2);
  });

  it('skips invalid-horizon predictions and reads nothing for an all-invalid batch', async () => {
    const { client, reads } = fakeSupabase([]);
    const sameDay = { ...prediction('p', 'A'), due_date: '2026-08-01' };
    const prefetched = await prefetchCandidateRounds(client, [sameDay]);
    expect(prefetched.size).toBe(0);
    expect(reads).toHaveLength(0);
  });
});
