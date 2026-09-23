/**
 * Pkg 9 slice 1a — `findActiveFocusAreaForMetric`, the shared duplicate-
 * active-work pre-check used by all 5 focus-area create paths in
 * `development.ts`. No schema change in this slice (no unique index —
 * prod already has a duplicate-active pair on the same player/metric that
 * needs an owner decision first); this is an app-level, best-effort guard.
 *
 * Uses an in-memory fake `golf_player_focus_areas` table whose `select`
 * chain actually filters on the (col, value) pairs the code passes — this
 * exercises the REAL `.in('status', ACTIVE_FOCUS_AREA_STATUSES_FOR_DEDUP)`
 * value the code sends, rather than a mock that just returns a fixed
 * boolean, so a status accidentally added to (or dropped from) that list
 * would change what these tests see.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }));

import {
  createFocusArea,
  createPlayerFocusArea,
  createFocusAreaFromReview,
  createFocusAreaFromInsightV2,
  createFocusAreaFromInsight,
  ACTIVE_FOCUS_DUPLICATE_ERROR,
} from '@/app/golf/actions/development';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

interface FaRow {
  id: string;
  player_id: string;
  target_metric: string | null;
  status: string;
}

/** In-memory `golf_player_focus_areas` handle. `insert` pushes the new row
 *  into the SAME `rows` array `select` reads from, so a second call in the
 *  same test sees the first call's own insert — modelling a real
 *  double-submit rather than a static fixture. */
function makeFocusAreaTable(initialRows: FaRow[] = []) {
  const rows: FaRow[] = [...initialRows];
  const inserted: Array<Record<string, unknown>> = [];

  const handler = {
    select: (_cols: string) => ({
      eq: (col1: string, val1: unknown) => ({
        eq: (col2: string, val2: unknown) => ({
          in: (col3: string, vals: readonly string[]) => ({
            limit: (_n: number) => ({
              maybeSingle: async () => {
                const match = rows.find((r) => {
                  const rec = r as unknown as Record<string, unknown>;
                  return rec[col1] === val1 && rec[col2] === val2 && vals.includes(rec[col3] as string);
                });
                return { data: match ? { id: match.id } : null, error: null };
              },
            }),
          }),
        }),
      }),
    }),
    insert: (payload: Record<string, unknown>) => {
      inserted.push(payload);
      const id = `new-fa-${inserted.length}`;
      rows.push({
        id,
        player_id: payload.player_id as string,
        target_metric: (payload.target_metric as string | null) ?? null,
        status: payload.status as string,
      });
      const result = { error: null };
      return {
        select: () => ({ single: async () => ({ data: { id }, error: null }) }),
        // Awaiting the builder directly (no .select() chained) resolves via
        // `.then` — the shape `fromUntyped(...).insert(...)` callers use.
        then: (resolve: (v: typeof result) => void) => resolve(result),
      };
    },
  };
  return { handler, rows, inserted };
}

function emptyTable() {
  return { select: () => ({}), insert: () => ({}) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createFocusArea — coach path', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>) {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'coach-1', organization_id: null, full_name: 'Coach' }, error: null }) }) }) };
        }
        if (table === 'golf_player_focus_areas') return fa.handler;
        if (table === 'golf_players') return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no row' } }) }) }) };
        return emptyTable();
      },
    });
  }

  it('blocks a duplicate active focus on the same metric and returns the existing id', async () => {
    const fa = makeFocusAreaTable([{ id: 'existing-1', player_id: 'player-1', target_metric: 'sg_putting', status: 'active' }]);
    harness(fa);

    const result = await createFocusArea({
      player_id: 'player-1',
      coach_id: 'coach-1',
      area_type: 'putting',
      title: 'Putting',
      description: null,
      target_metric: 'sg_putting',
      current_value: 1,
      target_value: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(result.duplicateFocusAreaId).toBe('existing-1');
    expect(fa.inserted).toHaveLength(0);
  });

  it('does not block when the existing focus on this metric is completed or declined', async () => {
    const fa = makeFocusAreaTable([
      { id: 'done-1', player_id: 'player-1', target_metric: 'sg_putting', status: 'completed' },
      { id: 'declined-1', player_id: 'player-1', target_metric: 'sg_putting', status: 'declined' },
    ]);
    harness(fa);

    const result = await createFocusArea({
      player_id: 'player-1',
      coach_id: 'coach-1',
      area_type: 'putting',
      title: 'Putting',
      description: null,
      target_metric: 'sg_putting',
      current_value: 1,
      target_value: 2,
    });

    expect(result.success).toBe(true);
    expect(fa.inserted).toHaveLength(1);
  });
});

describe('createPlayerFocusArea — player self path (admin client)', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>) {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_players') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'player-1' }, error: null }) }) }) };
        return emptyTable();
      },
    });
    createAdminClientMock.mockReturnValue({
      from: (table: string) => (table === 'golf_player_focus_areas' ? fa.handler : emptyTable()),
    });
  }

  it('blocks a duplicate active focus on the same metric', async () => {
    const fa = makeFocusAreaTable([{ id: 'existing-2', player_id: 'player-1', target_metric: 'gir_pct', status: 'proposed' }]);
    harness(fa);

    const result = await createPlayerFocusArea({
      player_id: 'player-1',
      area_type: 'iron_play',
      title: 'GIR',
      description: null,
      target_metric: 'gir_pct',
      current_value: 50,
      target_value: 60,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(result.duplicateFocusAreaId).toBe('existing-2');
    expect(fa.inserted).toHaveLength(0);
  });

  it('a double submit produces exactly one row', async () => {
    const fa = makeFocusAreaTable([]);
    harness(fa);
    const payload = {
      player_id: 'player-1',
      area_type: 'iron_play',
      title: 'GIR',
      description: null,
      target_metric: 'gir_pct',
      current_value: 50,
      target_value: 60,
    };

    const first = await createPlayerFocusArea(payload);
    const second = await createPlayerFocusArea(payload);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(fa.inserted).toHaveLength(1);
  });
});

describe('createFocusAreaFromReview — self-promote path (admin client)', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') return { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { team_id: 'team-1' }, error: null }) }) }) }) }) };
        if (table === 'golf_team_coach_staff') return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1' }, error: null }) }) }) }) };
        return emptyTable();
      },
    });
    createAdminClientMock.mockReturnValue({
      from: (table: string) => (table === 'golf_player_focus_areas' ? fa.handler : emptyTable()),
    });
  }

  it('blocks a duplicate active focus on the same metric', async () => {
    const fa = makeFocusAreaTable([{ id: 'existing-3', player_id: 'player-1', target_metric: 'scrambling_pct', status: 'in_progress' }]);
    harness(fa);

    const result = await createFocusAreaFromReview({
      playerId: 'player-1',
      reviewId: 'rev-1',
      title: 'Scrambling',
      description: 'desc',
      areaType: 'short_game',
      targetMetric: 'scrambling_pct',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(result.duplicateFocusAreaId).toBe('existing-3');
    expect(fa.inserted).toHaveLength(0);
  });
});

describe('createFocusAreaFromInsightV2 — self-promote path (admin client), double-submit + ledger dedup', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') return { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { team_id: 'team-1' }, error: null }) }) }) }) }) };
        if (table === 'golf_team_coach_staff') return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1' }, error: null }) }) }) }) };
        return emptyTable();
      },
    });
    createAdminClientMock.mockReturnValue({
      from: (table: string) => (table === 'golf_player_focus_areas' ? fa.handler : emptyTable()),
    });
  }

  it('blocks a duplicate active focus on the same metric', async () => {
    const fa = makeFocusAreaTable([{ id: 'existing-4', player_id: 'player-1', target_metric: 'sg_approach', status: 'active' }]);
    harness(fa);

    const result = await createFocusAreaFromInsightV2({
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(fa.inserted).toHaveLength(0);
    expect(recordInsightAction).not.toHaveBeenCalled();
  });

  it('a double submit produces exactly one row and one ledger event', async () => {
    const fa = makeFocusAreaTable([]);
    harness(fa);
    const payload = {
      playerId: 'player-1',
      insightId: 'insight-1',
      title: 'Approach',
      description: 'desc',
      areaType: 'iron_play',
      targetMetric: 'sg_approach',
    };

    const first = await createFocusAreaFromInsightV2(payload);
    const second = await createFocusAreaFromInsightV2(payload);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(fa.inserted).toHaveLength(1);
    // The blocked second attempt never reaches the post-insert
    // recordInsightAction call at all — only the one real create does.
    expect(recordInsightAction).toHaveBeenCalledTimes(1);
  });
});

describe('createFocusAreaFromInsight — legacy coach-only path', () => {
  function harness(fa: ReturnType<typeof makeFocusAreaTable>) {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'coach-1' }, error: null }) }) }) };
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { metadata: null, content: 'insight body', team_id: 'team-1' }, error: null }) }) }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          };
        }
        if (table === 'golf_player_focus_areas') return fa.handler;
        return emptyTable();
      },
    });
  }

  it('blocks a duplicate active focus on the same metric', async () => {
    const fa = makeFocusAreaTable([{ id: 'existing-5', player_id: 'player-1', target_metric: 'putts_made_10_15ft_pct', status: 'paused' }]);
    harness(fa);

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Putting',
      description: null,
      insight_type: 'stat_regression',
      target_metric: 'putts_made_10_15ft_pct',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTIVE_FOCUS_DUPLICATE_ERROR);
    expect(result.duplicateFocusAreaId).toBe('existing-5');
    expect(fa.inserted).toHaveLength(0);
  });
});
