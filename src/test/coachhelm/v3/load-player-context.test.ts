/**
 * Tests for `load-player-context.ts` (addendum §13, A1 slice 2 — the two
 * boxes A1 originally left deferred: source scoping and the historical
 * cutoff). Runs entirely against a FAKE Supabase client — never a live
 * database — which is the whole point of injecting `deps.supabase` instead
 * of calling `createAdminClient()` inside the loader.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { loadPlayerContext } from '@/lib/coachhelm/v3/context/load-player-context';
import { holeIdentityKey } from '@/lib/coachhelm/v3/context/types';

// ---------------------------------------------------------------------------
// A minimal fake Supabase client — supports exactly the chain
// `load-player-context.ts` calls: select/eq/gte/lte/in/order/range, plus
// per-table error injection. Each table's rows are plain objects keyed by
// column name; filters apply lazily at `.range()`.
// ---------------------------------------------------------------------------
type FakeRow = Record<string, unknown>;
type FakeTables = Record<string, FakeRow[]>;

function makeFakeSupabase(tables: FakeTables, opts: { errorTable?: string } = {}) {
  const tablesQueried: string[] = [];

  function from(table: string) {
    tablesQueried.push(table);
    const rows = tables[table] ?? [];
    const filters: Array<(r: FakeRow) => boolean> = [];
    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) >= (val as string));
        return builder;
      },
      lte(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) <= (val as string));
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      order() {
        return builder;
      },
      range(from_: number, to: number) {
        if (opts.errorTable === table) {
          return Promise.resolve({ data: null, error: { message: `simulated error on ${table}` } });
        }
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: filtered.slice(from_, to + 1), error: null });
      },
    };
    return builder;
  }

  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, tablesQueried };
}

const CUTOFF = '2026-07-01T00:00:00.000Z';

function scope(playerId: string, overrides: Partial<Parameters<typeof loadPlayerContext>[0]> = {}) {
  return {
    player_id: playerId,
    window_start: null,
    window_end: null,
    analysis_cutoff: CUTOFF,
    ...overrides,
  };
}

describe('loadPlayerContext — source scoping (player/team/sport)', () => {
  it('scopes rounds to the given player_id, never leaking another player on the same team', () => {
    const tables: FakeTables = {
      golf_rounds: [
        { id: 'round-a1', player_id: 'player-a', status: 'completed', team_id: 'team-x', course_id: 'course-1', round_date: '2026-06-01' },
        { id: 'round-b1', player_id: 'player-b', status: 'completed', team_id: 'team-x', course_id: 'course-1', round_date: '2026-06-01' },
      ],
      golf_holes: [
        { round_id: 'round-a1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
        { round_id: 'round-b1', hole_number: 1, par: 4, score: 5, penalty_strokes: 0, putts: 2, gir: false, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);

    return loadPlayerContext(scope('player-a'), { supabase }).then((result) => {
      expect(result.holes).toHaveLength(1);
      expect(result.holes[0]!.round_id).toBe('round-a1');
    });
  });

  it('only ever queries golf_* tables', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: null, round_date: '2026-06-01' }],
      golf_holes: [],
      golf_shots: [],
    };
    const { supabase, tablesQueried } = makeFakeSupabase(tables);
    await loadPlayerContext(scope('player-a'), { supabase });
    expect(tablesQueried.every((t) => t.startsWith('golf_'))).toBe(true);
  });
});

describe('loadPlayerContext — window scoping', () => {
  it('bounds rounds by window_start/window_end on round_date', async () => {
    const tables: FakeTables = {
      golf_rounds: [
        { id: 'in-window', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-15' },
        { id: 'before-window', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-05-01' },
        { id: 'after-window', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-07-15' },
      ],
      golf_holes: [
        { round_id: 'in-window', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-15T10:00:00.000Z' },
        { round_id: 'before-window', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-05-01T10:00:00.000Z' },
        { round_id: 'after-window', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-07-15T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(
      scope('player-a', { window_start: '2026-06-01', window_end: '2026-06-30', analysis_cutoff: '2026-12-31T00:00:00.000Z' }),
      { supabase },
    );
    expect(result.holes.map((h) => h.round_id)).toEqual(['in-window']);
  });
});

describe('loadPlayerContext — historical cutoff', () => {
  it('excludes a hole recorded after analysis_cutoff, counted under holesExcludedByReason.after_cutoff', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
        { round_id: 'r1', hole_number: 2, par: 4, score: 5, penalty_strokes: 0, putts: 2, gir: false, created_at: '2026-09-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.holes.map((h) => h.hole_number)).toEqual([1]);
    expect(result.coverage.holesExcludedByReason.after_cutoff).toBe(1);
  });

  it('treats a null created_at (legacy row) as available rather than excluded', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: null },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.holes).toHaveLength(1);
    expect(result.coverage.holesExcludedByReason.after_cutoff).toBeUndefined();
  });

  it('excludes a shot recorded after cutoff even when its hole is otherwise included, surfacing as a partial sequence', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [
        shotRow({ round_id: 'r1', hole_number: 1, shot_number: 1, result: 'fairway', created_at: '2026-06-01T10:01:00.000Z' }),
        shotRow({ round_id: 'r1', hole_number: 1, shot_number: 2, result: 'green', created_at: '2026-06-01T10:02:00.000Z' }),
        shotRow({ round_id: 'r1', hole_number: 1, shot_number: 3, result: 'hole', putt_made: true, created_at: '2026-09-01T10:00:00.000Z' }), // after cutoff
        shotRow({ round_id: 'r1', hole_number: 1, shot_number: 4, result: 'hole', putt_made: true, created_at: '2026-06-01T10:03:00.000Z' }),
      ],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    // Only 3 of the 4 shots survive the cutoff (total_strokes says 4) —
    // the hole is included, but its sequence is now short one shot.
    expect(result.shots).toHaveLength(3);
    expect(result.coverage.partialSequenceCount).toBe(1);
  });
});

describe('loadPlayerContext — rounds scoped to completed status (review item A)', () => {
  it('excludes an in-progress round, matching every sibling reader', async () => {
    const tables: FakeTables = {
      golf_rounds: [
        { id: 'completed-round', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' },
        { id: 'in-progress-round', player_id: 'player-a', status: 'in_progress', team_id: null, course_id: 'c1', round_date: '2026-06-01' },
      ],
      golf_holes: [
        { round_id: 'completed-round', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
        { round_id: 'in-progress-round', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.holes.map((h) => h.round_id)).toEqual(['completed-round']);
  });
});

describe('loadPlayerContext — shot exclusion beyond its own created_at (review items B, C, D)', () => {
  it('excludes a shot edited after the cutoff, counted under shotsExcludedByReason.edited_after_cutoff', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [
        shotRow({ shot_number: 1, result: 'fairway', created_at: '2026-06-01T10:01:00.000Z', updated_at: '2026-06-01T10:01:00.000Z' }),
        // Created before the cutoff, but edited after it — the CURRENT row no
        // longer reflects what was known as of the cutoff.
        shotRow({ shot_number: 2, result: 'green', created_at: '2026-06-01T10:02:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }),
      ],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0]!.shot_number).toBe(1);
    expect(result.coverage.shotsExcludedByReason.edited_after_cutoff).toBe(1);
  });

  it('never treats a null updated_at as edited after the cutoff', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [shotRow({ shot_number: 1, result: 'fairway', updated_at: null })],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.shots).toHaveLength(1);
    expect(result.coverage.shotsExcludedByReason.edited_after_cutoff).toBeUndefined();
  });

  it('excludes a shot whose owning hole was excluded (null_score), counted under shotsExcludedByReason.hole_excluded', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: null, penalty_strokes: 0, putts: null, gir: null, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [shotRow({ shot_number: 1, result: 'fairway' })],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.shots).toHaveLength(0);
    expect(result.coverage.shotsExcludedByReason.hole_excluded).toBe(1);
  });

  it('compares cutoff and timestamps as instants, not raw ISO strings (differing offsets, same instant)', async () => {
    // '+00:00' vs 'Z' — identical instant, different string representation.
    // A naive string comparison could disagree with Date.parse ordering.
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [
        shotRow({ shot_number: 1, result: 'fairway', created_at: '2026-07-01T00:00:00.000+00:00' }),
      ],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a', { analysis_cutoff: '2026-07-01T00:00:00.000Z' }), { supabase });
    // The shot's created_at IS the cutoff instant (just written with a
    // different offset) — "at or before" must still include it.
    expect(result.shots).toHaveLength(1);
    expect(result.coverage.shotsExcludedByReason.after_cutoff).toBeUndefined();
  });
});

describe('loadPlayerContext — player scoping rests solely on .eq(player_id) (review item E)', () => {
  it('filters golf_rounds by scope.player_id, with no other authorization check inside the loader', async () => {
    const tables: FakeTables = {
      golf_rounds: [
        { id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' },
        { id: 'r2', player_id: 'player-b', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' },
      ],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
        { round_id: 'r2', hole_number: 1, par: 4, score: 5, penalty_strokes: 0, putts: 2, gir: false, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-b'), { supabase });
    // Only player-b's round is ever visible — the `.eq('player_id', ...)`
    // filter is the ONLY thing standing between this call and player-a's
    // data, which is why the caller (never this module) must be trusted to
    // pass an authorized scope.player_id.
    expect(result.holes.map((h) => h.round_id)).toEqual(['r2']);
  });
});

describe('loadPlayerContext — hole exclusion and course identity', () => {
  it('excludes a hole with a null score, counted under holesExcludedByReason.null_score', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 1, par: 4, score: null, penalty_strokes: 0, putts: null, gir: null, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.holes).toHaveLength(0);
    expect(result.coverage.holesExcludedByReason.null_score).toBe(1);
  });

  it('resolves course_id from the owning round, and a null course_id makes holeIdentityKey return null', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: null, round_date: '2026-06-01' }],
      golf_holes: [
        { round_id: 'r1', hole_number: 7, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' },
      ],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables);
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.holes[0]!.course_id).toBeNull();
    expect(holeIdentityKey(result.holes[0]!)).toBeNull();
  });
});

describe('loadPlayerContext — pagination and chunking', () => {
  it('returns every hole across a round-id list larger than the 200-id chunk size', async () => {
    const ROUND_COUNT = 250;
    const rounds: FakeRow[] = [];
    const holes: FakeRow[] = [];
    for (let i = 0; i < ROUND_COUNT; i += 1) {
      const id = `round-${i}`;
      rounds.push({ id, player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' });
      holes.push({ round_id: id, hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' });
    }
    const { supabase } = makeFakeSupabase({ golf_rounds: rounds, golf_holes: holes, golf_shots: [] });
    const result = await loadPlayerContext(scope('player-a'), { supabase });
    expect(result.coverage.holesIncluded).toBe(ROUND_COUNT);
  });
});

describe('loadPlayerContext — errors are surfaced, never treated as empty', () => {
  it('throws when the golf_holes query errors, rather than returning an empty result', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables, { errorTable: 'golf_holes' });
    await expect(loadPlayerContext(scope('player-a'), { supabase })).rejects.toThrow(/simulated error on golf_holes/);
  });

  it('throws when the golf_rounds query errors', async () => {
    const { supabase } = makeFakeSupabase({ golf_rounds: [], golf_holes: [], golf_shots: [] }, { errorTable: 'golf_rounds' });
    await expect(loadPlayerContext(scope('player-a'), { supabase })).rejects.toThrow(/simulated error on golf_rounds/);
  });

  it('throws when the golf_shots query errors', async () => {
    const tables: FakeTables = {
      golf_rounds: [{ id: 'r1', player_id: 'player-a', status: 'completed', team_id: null, course_id: 'c1', round_date: '2026-06-01' }],
      golf_holes: [{ round_id: 'r1', hole_number: 1, par: 4, score: 4, penalty_strokes: 0, putts: 2, gir: true, created_at: '2026-06-01T10:00:00.000Z' }],
      golf_shots: [],
    };
    const { supabase } = makeFakeSupabase(tables, { errorTable: 'golf_shots' });
    await expect(loadPlayerContext(scope('player-a'), { supabase })).rejects.toThrow(/simulated error on golf_shots/);
  });
});

function shotRow(overrides: Partial<Record<string, unknown>>): FakeRow {
  return {
    round_id: 'r1',
    hole_number: 1,
    shot_number: 1,
    shot_type: 'approach',
    club_type: 'non_driver',
    distance_to_hole_before: 100,
    distance_unit_before: 'yards',
    distance_to_hole_after: 10,
    distance_unit_after: 'feet',
    lie_before: 'fairway',
    lie_after: 'green',
    result: null,
    is_penalty: false,
    putt_made: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}
