import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression guard: the causal-relationships read must rank by LAST CONFIRMED
// (`updated_at`), not by FIRST DETECTED (`created_at`).
//
// `CausalEngine.saveRelationships` UPDATES a relationship in place when it
// re-fires and only INSERTs a genuinely new one, so `created_at` is frozen at
// first detection and never moves again. Measured in production 2026-08-16:
// 5,518 of 5,641 rows (97.8%) have `updated_at > created_at`, newest
// `created_at` is 2026-07-31 while newest `updated_at` is the same morning.
// Ordering by `created_at` therefore mis-ranks essentially the whole table.
//
// This is NOT display-only. `dedupeAndRank` keeps the FIRST row per natural
// key, so the ordering column decides which duplicate SURVIVES: by
// `created_at` the winner is the oldest-inserted duplicate, which may be a
// relationship the engine has since stopped confirming.
//
// The stub simulates Postgres — it sorts by whichever column the action
// actually asks for. A stub returning a fixed array would pass no matter what
// the query said, which is exactly what this test needs to be able to fail on.
// ---------------------------------------------------------------------------

const { state, fromMock } = vi.hoisted(() => {
  const state = {
    rows: [] as Array<Record<string, unknown>>,
    orderedBy: null as string | null,
    selected: '' as string,
  };

  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = (cols: string) => {
      state.selected = cols;
      return builder;
    };
    builder.eq = () => builder;
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      state.orderedBy = column;
      const ascending = opts?.ascending !== false;
      state.rows = [...state.rows].sort((a, b) => {
        const av = String(a[column] ?? '');
        const bv = String(b[column] ?? '');
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return builder;
    };
    builder.limit = () => Promise.resolve({ data: state.rows, error: null });
    return builder;
  }

  const fromMock = vi.fn(() => makeBuilder());
  return { state, fromMock };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: fromMock,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: async () => ({ allowed: true }),
  verifyTeamAccess: async () => ({ allowed: true }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

// `withAdminObserved` wraps the impl for telemetry; pass it straight through.
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (
    _name: string,
    _meta: unknown,
    fn: (...args: unknown[]) => unknown,
  ) => fn,
}));

import { getPlayerCausalRelationships } from '@/app/golf/actions/causal-relationships';

/**
 * TWO PHYSICAL ROWS, ONE NATURAL KEY — same player|cause|effect|type.
 *
 * This is the shape that actually exists in production: the save-path bug this
 * module's header describes appended a duplicate row per round review (one
 * gir→scoring relationship 1,831×). `dedupeAndRank` keeps the FIRST row it
 * sees, so the DB `.order()` chooses the SURVIVOR.
 *
 * Deliberately NOT asserting final output position: `dedupeAndRank` re-sorts
 * its result by `confidence × intervention_potential` (actionability), so the
 * ordering column does not control display order. Asserting position would
 * test the wrong thing and would fail even against a correct fix.
 */
function duplicatePair() {
  const base = {
    player_id: 'p1',
    cause: 'gir',
    cause_metric: 'total_gir',
    effect: 'scoring',
    effect_metric: 'score_to_par',
    relationship_type: 'direct',
    mechanism: 'more greens, lower scores',
    dose_response: true,
  };
  return [
    {
      ...base,
      id: 'rel-stale',
      // Inserted LATER, but the engine has not re-confirmed it since 1 July.
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      strength: 0.42,
      confidence: 0.5,
      intervention_potential: 0.4,
    },
    {
      ...base,
      id: 'rel-fresh',
      // Inserted EARLIER, re-confirmed this morning. This is the live one.
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-08-16T10:37:00.000Z',
      strength: 0.81,
      confidence: 0.9,
      intervention_potential: 0.8,
    },
  ];
}

describe('getPlayerCausalRelationships — ranks by last confirmed, not first detected', () => {
  beforeEach(() => {
    state.rows = duplicatePair();
    state.orderedBy = null;
    state.selected = '';
    fromMock.mockClear();
  });

  it('keeps the most recently CONFIRMED duplicate, not the first inserted', async () => {
    const rows = await getPlayerCausalRelationships('p1');

    // One natural key in, one row out.
    expect(rows).toHaveLength(1);
    // `rel-fresh` has the OLDER created_at but the NEWER updated_at. Ordering
    // by created_at makes `rel-stale` the survivor and the panel shows a
    // relationship the engine stopped confirming six weeks ago.
    expect(rows[0]!.id).toBe('rel-fresh');
    // And the survivor carries the live figures, not the stale ones.
    expect(rows[0]!.confidence).toBe(0.9);
    expect(rows[0]!.updated_at).toBe('2026-08-16T10:37:00.000Z');
  });

  it('orders the query on updated_at', async () => {
    await getPlayerCausalRelationships('p1');
    expect(state.orderedBy).toBe('updated_at');
  });

  it('selects updated_at so freshness is available to consumers', async () => {
    await getPlayerCausalRelationships('p1');
    expect(state.selected).toContain('updated_at');
  });
});
