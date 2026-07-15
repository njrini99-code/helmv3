// =============================================================================
// src/app/baseball/actions/__tests__/imports-capability-shape-gate.test.ts
//
// ROUND-4 FIX (#863) — previewImport/commitImport were hard-gated on
// can_manage_imports UNCONDITIONALLY, so the quickEntryOnly inline wizard at
// /stats/upload (rendered for the 6 can_manage_stats-only staff presets) let a
// stats-only coach fill out the ENTIRE form and then fail server-side on
// submit — the two real actions behind it never actually authorized them.
// Pre-consolidation, stats-only staff COULD upload box scores via the legacy
// /stats/upload wizard, so the faithful model is: a 'game_box_score' request
// may be authorized by can_manage_imports OR can_manage_stats; every other
// shape (season_totals, event_log, undefined) keeps the ORIGINAL
// can_manage_imports-only gate.
//
// UNLIKE imports-registry.test.ts (which mocks withBaseballAction to a
// passthrough and so proves nothing about authorization), THIS suite leaves
// the real withBaseballAction/capabilities wiring in place and mocks only the
// capability/staff-resolution seam (hasBaseballCapability/
// requireBaseballCapability) plus the auth/context/observability plumbing —
// the SAME pattern academics-coach-gating.test.ts uses. This is what actually
// exercises the new shape-conditional `requiredCapability` resolver in
// with-baseball-action.ts end-to-end, through the real action bodies.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- capability/staff-resolution seam (the thing under test) ---------------

let grantedCapabilities: Set<string>;

vi.mock('@/lib/baseball/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/capabilities')>();
  return {
    ...actual,
    hasBaseballCapability: vi.fn(async (_teamId: string, cap: string) =>
      grantedCapabilities.has(cap),
    ),
    requireBaseballCapability: vi.fn(async (teamId: string, cap: string) => {
      if (!grantedCapabilities.has(cap)) {
        throw new actual.BaseballCapabilityError(cap as never, teamId);
      }
      return {} as never;
    }),
  };
});

// ---- auth/context/observability plumbing (real withBaseballAction runs) ----

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'coach' as const,
    activeCoachId: 'coach-1',
    activePlayerId: null,
    fellBackFromStale: false,
  })),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), addBreadcrumb: vi.fn(), setUser: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/baseball/actions/coachhelm', () => ({ runBaseballEngine: vi.fn(async () => {}) }));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendImportTimelineEvent: vi.fn(async () => {}),
}));

// ---- table-aware Supabase recorder (same pattern as imports-registry.test.ts) --

type Row = Record<string, unknown>;
const inserted: Record<string, Row[]> = {};

/** What loadSourcePolicy returns — null (unregistered, adapter defaults) for
 *  every test here since the registry policy is not what's under test. */
let existingStatRow: Row | null = null;

function tableHandle(table: string) {
  const result = (data: unknown) => ({ data, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'is']) chain[m] = vi.fn(ret);

  chain.maybeSingle = vi.fn(async () => {
    if (table === 'baseball_player_stats') return result(existingStatRow);
    return result(null);
  });
  chain.single = vi.fn(async () => {
    if (table === 'baseball_import_runs') return result({ id: 'run-1' });
    if (table === 'baseball_player_stats') return result({ id: 'stat-new-1' });
    return result({ id: `${table}-1` });
  });

  // baseball_import_sources resolves via .eq(...).or(...).limit(1) awaited
  // directly (no .single()) — always unregistered (adapter defaults) here.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result([]));

  chain.insert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () =>
          table === 'baseball_import_runs' ? result({ id: 'run-1' }) : result({ id: 'stat-new-1' }),
        ),
      })),
      then: (r: (v: unknown) => unknown) => r(result(null)),
    };
  });
  chain.update = vi.fn(() => ({
    eq: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(result(null)) })),
  }));
  chain.upsert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return { then: (r: (v: unknown) => unknown) => r(result(null)) };
  });

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'coach@example.edu' } },
        error: null,
      })),
    },
  })),
}));

// ---- import AFTER every mock -------------------------------------------------

import { previewImport, commitImport } from '@/app/baseball/actions/imports';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';

const TEAM_ID = 'team-1';

function commitArgs(overrides: Record<string, unknown> = {}) {
  return {
    teamId: TEAM_ID,
    sourceId: 'generic_csv',
    // No at_bats/hits mapped — a 'game_box_score' dataShape's canonical
    // box-score routing (applyGameBoxScoreImport) then finds no batting/
    // pitching-shaped values and no-ops WITHOUT touching games.ts, keeping
    // this suite scoped to the authorization gate rather than box-score
    // write mechanics (already covered by games.ts's own suites).
    fileName: 'box.csv',
    statType: 'game' as const,
    sessionDate: '2026-03-01',
    headers: ['player'],
    mapping: { player_name: 'player' },
    rows: [{ player: 'Jane Doe' }],
    matches: [
      {
        rowIndex: 0,
        sourceName: 'Jane Doe',
        playerId: 'p1',
        playerName: 'Jane Doe',
        confidence: 1,
        matchTier: 'exact_roster' as const,
        isManualMatch: false,
        action: 'create' as const,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  existingStatRow = null;
  grantedCapabilities = new Set();
});

// -----------------------------------------------------------------------------
// previewImport
// -----------------------------------------------------------------------------

describe('previewImport — shape-conditional capability gate', () => {
  it('(a) stats-only staff + game_box_score preview: authorized, runs (parses the real CSV)', async () => {
    grantedCapabilities = new Set(['can_manage_stats']);

    const result = await previewImport({
      teamId: TEAM_ID,
      sourceId: 'generic_csv',
      csvContent: 'player,ab,h\nJane Doe,4,2\n',
      statType: 'game',
      sessionDate: '2026-03-01',
      dataShape: 'game_box_score',
    });

    // Proves the REAL body ran (parsed the CSV), not just that the gate
    // didn't throw.
    expect(result.totalRows).toBe(1);
    expect(result.headers).toEqual(['player', 'ab', 'h']);
  });

  it('restrictive default: stats-only staff previewing WITHOUT a dataShape still requires can_manage_imports', async () => {
    grantedCapabilities = new Set(['can_manage_stats']);

    await expect(
      previewImport({
        teamId: TEAM_ID,
        sourceId: 'generic_csv',
        csvContent: 'player,ab,h\nJane Doe,4,2\n',
        statType: 'game',
        sessionDate: '2026-03-01',
        // dataShape omitted — must NOT be treated as 'game_box_score'.
      }),
    ).rejects.toBeInstanceOf(BaseballCapabilityError);
  });

  it('stats-only staff + season_totals preview: still requires can_manage_imports', async () => {
    grantedCapabilities = new Set(['can_manage_stats']);

    await expect(
      previewImport({
        teamId: TEAM_ID,
        sourceId: 'generic_csv',
        csvContent: 'player,ab,h\nJane Doe,4,2\n',
        statType: 'other',
        sessionDate: '2026',
        dataShape: 'season_totals',
      }),
    ).rejects.toBeInstanceOf(BaseballCapabilityError);
  });
});

// -----------------------------------------------------------------------------
// commitImport
// -----------------------------------------------------------------------------

describe('commitImport — shape-conditional capability gate', () => {
  it('(b) stats-only staff + season_totals commit: BaseballCapabilityError, writes NOTHING', async () => {
    grantedCapabilities = new Set(['can_manage_stats']);

    await expect(
      commitImport(commitArgs({ dataShape: 'season_totals', sessionDate: '2026' })),
    ).rejects.toBeInstanceOf(BaseballCapabilityError);

    // The gate ran BEFORE any side effect — no run header, no stat row.
    expect(inserted['baseball_import_runs'] ?? []).toHaveLength(0);
    expect(inserted['baseball_player_stats'] ?? []).toHaveLength(0);
  });

  it('(c) stats-only staff + game_box_score commit: authorized, runs (writes the stat row for real)', async () => {
    grantedCapabilities = new Set(['can_manage_stats']);

    const res = await commitImport(commitArgs({ dataShape: 'game_box_score' }));

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
    expect(inserted['baseball_player_stats'] ?? []).toHaveLength(1);
    expect(inserted['baseball_import_runs'] ?? []).toHaveLength(1);
  });

  it('(d) no-capability staff + game_box_score commit: BaseballCapabilityError (the OR is not "anyone")', async () => {
    grantedCapabilities = new Set(); // neither can_manage_imports nor can_manage_stats

    await expect(
      commitImport(commitArgs({ dataShape: 'game_box_score' })),
    ).rejects.toBeInstanceOf(BaseballCapabilityError);

    expect(inserted['baseball_import_runs'] ?? []).toHaveLength(0);
    expect(inserted['baseball_player_stats'] ?? []).toHaveLength(0);
  });

  it('(e) imports-only staff + game_box_score commit: unchanged — authorized exactly as before this fix', async () => {
    grantedCapabilities = new Set(['can_manage_imports']);

    const res = await commitImport(commitArgs({ dataShape: 'game_box_score' }));

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
  });

  it('(e) imports-only staff + season_totals commit: unchanged — authorized exactly as before this fix', async () => {
    grantedCapabilities = new Set(['can_manage_imports']);

    const res = await commitImport(commitArgs({ dataShape: 'season_totals', sessionDate: '2026' }));

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
  });

  it('imports-only staff + NO dataShape commit: unchanged — the legacy (pre-#379) caller path still works', async () => {
    grantedCapabilities = new Set(['can_manage_imports']);

    const res = await commitImport(commitArgs({ dataShape: undefined }));

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
  });
});
