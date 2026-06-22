/**
 * P2-21 — genome orchestrator persistence guards.
 *
 * The orchestrator must NOT:
 *   (a) write an all-null vector (e.g. a zero-round player), and
 *   (b) overwrite the last good vector when a source load fails.
 *
 * It MUST persist a vector when at least one dimension is valid, and label the
 * unavailable slots explicitly. These are deterministic unit tests over a mocked
 * Supabase admin client + mocked row loaders (no real DB).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock the row loaders the orchestrator imports --------------------------
const fetchAllRowsResultMock = vi.fn();
vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: (...args: unknown[]) => fetchAllRowsResultMock(...args),
}));
vi.mock('@/lib/supabase/untyped', () => ({
  // fromUntyped is only used to BUILD a query passed into fetchAllRowsResult,
  // which we stub above — so it never actually executes. Return a chainable noop.
  fromUntyped: () => {
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'in', 'order', 'range', 'eq', 'gte', 'not']) {
      chain[k] = () => chain;
    }
    return chain;
  },
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
}));

// --- Mock the admin client -------------------------------------------------
// We control golf_rounds (data/error) and capture golf_player_genome upserts.
const upsertMock = vi.fn(() => ({ error: null }));
let roundsResponse: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeRoundsBuilder() {
  // .from('golf_rounds').select().eq().eq().gte() resolves to roundsResponse.
  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  builder.select = ret;
  builder.eq = ret;
  builder.gte = ret;
  // make it thenable so `await builder` yields roundsResponse
  builder.then = (resolve: (v: typeof roundsResponse) => void) => resolve(roundsResponse);
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_rounds') return makeRoundsBuilder();
      if (table === 'golf_player_genome') return { upsert: upsertMock };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { computeGenomeForPlayer } from '@/lib/coachhelm/v3/genome/orchestrator';

// A round row shaped like golf_rounds select output.
function round(id: string) {
  return { id, round_date: '2026-05-01', round_type: 'tournament', total_score: 72, score_to_par: 0 };
}

beforeEach(() => {
  upsertMock.mockClear();
  fetchAllRowsResultMock.mockReset();
  roundsResponse = { data: [], error: null };
});

describe('genome orchestrator — persistence guards (P2-21)', () => {
  it('does NOT upsert an all-null vector for a zero-round player', async () => {
    roundsResponse = { data: [], error: null }; // no rounds → every dim null

    const result = await computeGenomeForPlayer('player-zero');

    expect(result.dimensions_computed).toBe(0);
    expect(result.persisted).toBe(false);
    expect(result.skipped_reason).toBe('no_valid_dimensions');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does NOT overwrite the last good vector when the rounds load fails', async () => {
    roundsResponse = { data: null, error: { message: 'connection reset' } };

    const result = await computeGenomeForPlayer('player-src-fail');

    expect(result.skipped_reason).toBe('source_failure');
    expect(result.persisted).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does NOT overwrite the last good vector when the hole/shot load fails', async () => {
    // Enough rounds to clear min_rounds gating, so we reach the detail load.
    roundsResponse = {
      data: Array.from({ length: 12 }, (_, i) => round(`r${i}`)),
      error: null,
    };
    // holes load OK, shots load fails.
    fetchAllRowsResultMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'shot query timeout' } });

    const result = await computeGenomeForPlayer('player-detail-fail');

    expect(result.skipped_reason).toBe('source_failure');
    expect(result.persisted).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('persists and labels null slots when ≥1 dimension is valid', async () => {
    roundsResponse = {
      data: Array.from({ length: 12 }, (_, i) => round(`r${i}`)),
      error: null,
    };
    // Build hole_scores that yield a real scoring-trend / back-nine signal:
    // 12 rounds × 18 holes of par-4 bogeys is enough for the rounds-gated dims to
    // produce at least one non-null value.
    const holes = [];
    for (let r = 0; r < 12; r++) {
      for (let h = 1; h <= 18; h++) {
        holes.push({ round_id: `r${r}`, hole_number: h, par: 4, score: h <= 9 ? 4 : 5 });
      }
    }
    fetchAllRowsResultMock
      .mockResolvedValueOnce({ data: holes, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await computeGenomeForPlayer('player-valid');

    // At least one dimension computed → we persist exactly one upsert.
    expect(result.dimensions_computed).toBeGreaterThan(0);
    expect(result.persisted).toBe(true);
    expect(result.skipped_reason).toBe('none');
    expect(upsertMock).toHaveBeenCalledTimes(1);

    // The persisted vector labels every null slot explicitly (no bare nulls).
    const calls = upsertMock.mock.calls as unknown as Array<
      Array<{ vector: Record<string, { value: unknown; label?: string }> }>
    >;
    const payload = calls[0]![0]!;
    for (const [, slot] of Object.entries(payload.vector)) {
      if (slot.value === null) {
        expect(typeof slot.label).toBe('string');
        expect(slot.label!.length).toBeGreaterThan(0);
      }
    }
  });
});
