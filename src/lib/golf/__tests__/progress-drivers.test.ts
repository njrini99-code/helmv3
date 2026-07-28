import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ============================================================================
 * B2 (P0) — focus-area auto-progress never fires for insight/standing
 * -prescribed focus areas
 * ----------------------------------------------------------------------------
 * `evaluateAreas()` (src/lib/golf/progress-drivers.ts) only ever advanced
 * `current_value` when `isWindowableFocusMetric(target_metric)` resolved
 * against the 14-key legacy `METRIC_CATALOG` (focus-areas/catalog.ts). The
 * primary insight/standing-prescribed "create focus area" flow writes
 * `target_metric` values from the v3 metric registry
 * (src/lib/coachhelm/v3/metrics/registry.ts) — a different id namespace —
 * so those focus areas matched neither source and silently never tracked.
 *
 * Fix: when `target_metric` is NOT recognized by the legacy catalog but IS a
 * recognized v3-registry metric id, read the player's live
 * `golf_player_standing` value (the same source Goals already use via
 * loadPlayerStandingMap/loadPlayersStandingMap) and advance `current_value`
 * from that, instead of no-oping.
 *
 * These tests exercise the fix through the real public entrypoint
 * (`runFocusAreaProgressForPlayers`), mocking only the Supabase/admin-client
 * boundary and the standing loader — the module's own filtering/branching
 * logic (evaluateAreas) runs for real.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Standard mock set (mirrors golf-qualifier-progress.test.ts) so importing
// progress-drivers.ts — and its withAdminObserved wrapper — never touches a
// real Supabase client or Next.js request context.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin/observe-action-result', () => ({
  extractActionSoftFailure: vi.fn(() => null),
  observeActionSoftFailure: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fake admin client for golf_player_focus_areas (+ golf_rounds /
// golf_round_stats_cache for the legacy-path regression case).
// ---------------------------------------------------------------------------
interface FocusAreaRow {
  id: string;
  player_id: string;
  target_metric: string | null;
  current_value: number | null;
  started_at: string | null;
}

let focusAreaRows: FocusAreaRow[] = [];
let roundRows: Array<{ id: string; player_id: string; round_date: string }> = [];
let statsRows: Array<{ round_id: string; total_putts: number | null }> = [];
const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];

function makeAdminClient() {
  return {
    from: (table: string) => {
      if (table === 'golf_player_focus_areas') {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({ data: focusAreaRows, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updateCalls.push({ id, patch });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'golf_rounds') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                gte: async () => ({ data: roundRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'golf_round_stats_cache') {
        return {
          select: () => ({
            in: async () => ({ data: statsRows, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeAdminClient()),
}));

// ---------------------------------------------------------------------------
// Standing loader — the fallback data source under test.
// ---------------------------------------------------------------------------
const standingByPlayer = new Map<string, Map<string, { player_value: number }>>();

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadPlayerStandingMap: vi.fn(async () => new Map()),
  loadPlayersStandingMap: vi.fn(async (ids: string[]) => {
    const out = new Map<string, Map<string, { player_value: number }>>();
    for (const id of ids) out.set(id, standingByPlayer.get(id) ?? new Map());
    return out;
  }),
}));

import { runFocusAreaProgressForPlayers } from '../progress-drivers';

describe('runFocusAreaProgressForPlayers — standing fallback (B2 / P0 fix)', () => {
  beforeEach(() => {
    focusAreaRows = [];
    roundRows = [];
    statsRows = [];
    updateCalls.length = 0;
    standingByPlayer.clear();
    vi.clearAllMocks();
  });

  it('advances current_value from golf_player_standing for a v3-registry target_metric NOT in the legacy 14-key catalog', async () => {
    // 'sg_putting' is a canonical v3 registry id (METRIC_IDS) but is NOT a
    // key in the legacy focus-areas METRIC_CATALOG — exactly the namespace
    // mismatch the audit finding described.
    focusAreaRows = [
      {
        id: 'area-1',
        player_id: 'player-1',
        target_metric: 'sg_putting',
        current_value: 0.2, // frozen at the value captured on creation
        started_at: '2026-06-01',
      },
    ];
    standingByPlayer.set('player-1', new Map([['sg_putting', { player_value: 0.8 }]]));

    const summary = await runFocusAreaProgressForPlayers(['player-1']);

    expect(summary.evaluated).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.players_with_areas).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe('area-1');
    // No longer frozen at the creation-time 0.2 — advanced to the live standing.
    expect(updateCalls[0]!.patch.current_value).toBe(0.8);
  });

  it('BEFORE-FIX CONTRAST: a metric recognized by neither the legacy catalog nor the v3 registry stays frozen (no fabrication)', async () => {
    focusAreaRows = [
      {
        id: 'area-2',
        player_id: 'player-2',
        target_metric: 'totally_custom_mental_game_note', // not in either namespace
        current_value: 5,
        started_at: '2026-06-01',
      },
    ];
    // Even if a standing row happened to exist under a coincidental key, it
    // must never be consulted for an unrecognized id.
    standingByPlayer.set(
      'player-2',
      new Map([['totally_custom_mental_game_note', { player_value: 99 }]]),
    );

    const summary = await runFocusAreaProgressForPlayers(['player-2']);

    expect(summary.evaluated).toBe(0);
    expect(summary.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('regression guard: the legacy 14-key catalog window path still works unchanged', async () => {
    focusAreaRows = [
      {
        id: 'area-3',
        player_id: 'player-3',
        target_metric: 'putts_per_round', // legacy METRIC_CATALOG key
        current_value: 32,
        started_at: '2026-06-01',
      },
    ];
    roundRows = [{ id: 'round-1', player_id: 'player-3', round_date: '2026-06-10' }];
    statsRows = [{ round_id: 'round-1', total_putts: 28 }];

    const summary = await runFocusAreaProgressForPlayers(['player-3']);

    expect(summary.evaluated).toBe(1);
    expect(summary.updated).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe('area-3');
    expect(updateCalls[0]!.patch.current_value).toBe(28);
  });

  it('mixed batch: legacy-catalog area and standing-fallback area are both evaluated independently', async () => {
    focusAreaRows = [
      {
        id: 'area-legacy',
        player_id: 'player-a',
        target_metric: 'putts_per_round',
        current_value: 32,
        started_at: '2026-06-01',
      },
      {
        id: 'area-fallback',
        player_id: 'player-b',
        target_metric: 'sg_around_green', // v3-registry id only — not in the legacy catalog
        current_value: 0,
        started_at: '2026-06-01',
      },
    ];

    roundRows = [{ id: 'round-2', player_id: 'player-a', round_date: '2026-06-10' }];
    statsRows = [{ round_id: 'round-2', total_putts: 30 }];
    standingByPlayer.set('player-b', new Map([['sg_around_green', { player_value: 0.4 }]]));

    const summary = await runFocusAreaProgressForPlayers(['player-a', 'player-b']);

    expect(summary.evaluated).toBe(2);
    expect(summary.updated).toBe(2);
    expect(summary.players_with_areas).toBe(2);
    const byId = new Map(updateCalls.map((c) => [c.id, c.patch]));
    expect(byId.get('area-legacy')?.current_value).toBe(30);
    expect(byId.get('area-fallback')?.current_value).toBe(0.4);
  });
});
