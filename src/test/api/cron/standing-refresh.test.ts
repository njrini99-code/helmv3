/**
 * Route + metric-list tests for the v3 standing-refresh cron.
 *
 * Covers the standing-cron-db audit fixes:
 *   - SC2: the 5 putt_make_pct_* metrics are now COVERED (re-promoted 2026-06-06
 *     once update_player_putt_make_pct populated the per-band cache columns); the
 *     cron still asserts on any covered-but-0-rows metric (metrics_covered_zero_rows).
 *   - SC1: the orphan prune RPC (prune_stale_player_standing) is invoked with a
 *     pre-refresh cutoff and its count is surfaced (orphans_pruned).
 *   - PERF-2: team selection uses select_stalest_teams (freshness-ordered), with
 *     a created_at fallback when the RPC isn't deployed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  STANDING_REFRESH_METRIC_IDS,
  STANDING_REFRESH_DEFERRED_METRIC_IDS,
} from '@/lib/coachhelm/v3/standing/refresh';

const PUTT_MAKE_PCT_METRICS = [
  'putts_made_3_5ft_pct',
  'putts_made_5_10ft_pct',
  'putts_made_10_15ft_pct',
  'putts_made_15_25ft_pct',
  'putts_made_25_plus_ft_pct',
] as const;

// ---- Mock harness -----------------------------------------------------------
// A configurable admin-client whose .rpc() dispatches per function name and
// whose .from('golf_teams') chain returns the created_at fallback rows.

interface MockConfig {
  stalestTeams?: { data: Array<{ team_id: string }> | null; error: { message: string } | null };
  fallbackTeams?: Array<{ id: string }>;
  standingRows?: Array<{ metric_id: string; rows_upserted: number }>;
  roundRows?: Array<{ out_metric_id: string; out_rows_upserted: number }>;
  shotRows?: Array<{ out_metric_id: string; out_rows_upserted: number }>;
  pruneCount?: number;
}

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function makeClient(cfg: MockConfig) {
  return {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      switch (name) {
        case 'select_stalest_teams':
          return Promise.resolve(
            cfg.stalestTeams ?? { data: null, error: { message: 'not deployed' } },
          );
        case 'refresh_player_standing':
          return Promise.resolve({ data: cfg.standingRows ?? [], error: null });
        case 'refresh_player_standing_round_metrics':
          return Promise.resolve({ data: cfg.roundRows ?? [], error: null });
        case 'refresh_player_standing_shot_metrics':
          return Promise.resolve({ data: cfg.shotRows ?? [], error: null });
        case 'prune_stale_player_standing':
          return Promise.resolve({ data: cfg.pruneCount ?? 0, error: null });
        default:
          return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
      }
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve({ data: cfg.fallbackTeams ?? [], error: null }),
          ),
        })),
      })),
    })),
  };
}

let currentClient: ReturnType<typeof makeClient>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => currentClient,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/v3/standing-refresh/route';

function authed(): NextRequest {
  return new NextRequest('http://x/api/cron/v3/standing-refresh', {
    headers: { authorization: 'Bearer cron-secret-value' },
  });
}

interface Body {
  teams_in_chunk: number;
  team_ids: string[];
  metrics_covered: string[];
  metrics_deferred: string[];
  metrics_covered_zero_rows: string[];
  orphans_pruned: number;
}

describe('standing-refresh refresh.ts metric lists (SC2 → re-promoted 2026-06-06)', () => {
  // After update_player_putt_make_pct() began populating the per-band cache
  // columns, the 5 putt_make_pct_* metrics were re-promoted from deferred to
  // covered (they now upsert real, raw-shot-matching rows).
  it('declares all 5 putt_make_pct_* metrics covered', () => {
    for (const m of PUTT_MAKE_PCT_METRICS) {
      expect(STANDING_REFRESH_METRIC_IDS).toContain(m);
    }
  });

  it('no longer defers any putt_make_pct_* metric', () => {
    for (const m of PUTT_MAKE_PCT_METRICS) {
      expect(STANDING_REFRESH_DEFERRED_METRIC_IDS).not.toContain(m);
    }
  });

  it('keeps covered and deferred lists disjoint', () => {
    const covered = new Set<string>(STANDING_REFRESH_METRIC_IDS);
    for (const m of STANDING_REFRESH_DEFERRED_METRIC_IDS) {
      expect(covered.has(m)).toBe(false);
    }
  });
});

describe('standing-refresh cron route (SC1 / SC2 / PERF-2)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret-value';
    rpcCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    currentClient = makeClient({});
    const res = await GET(new NextRequest('http://x/api/cron/v3/standing-refresh'));
    expect(res.status).toBe(401);
  });

  it('PERF-2: selects teams via select_stalest_teams (freshness ordering)', async () => {
    currentClient = makeClient({
      stalestTeams: { data: [{ team_id: 'T1' }, { team_id: 'T2' }], error: null },
      standingRows: STANDING_REFRESH_METRIC_IDS.map((m) => ({ metric_id: m, rows_upserted: 3 })),
    });
    const res = await GET(authed());
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.team_ids).toEqual(['T1', 'T2']);
    expect(rpcCalls.some((c) => c.name === 'select_stalest_teams')).toBe(true);
  });

  it('PERF-2: falls back to created_at order when the stalest RPC is undeployed', async () => {
    currentClient = makeClient({
      stalestTeams: { data: null, error: { message: 'function does not exist' } },
      fallbackTeams: [{ id: 'F1' }, { id: 'F2' }],
      standingRows: STANDING_REFRESH_METRIC_IDS.map((m) => ({ metric_id: m, rows_upserted: 1 })),
    });
    const res = await GET(authed());
    const body = (await res.json()) as Body;
    expect(body.team_ids).toEqual(['F1', 'F2']);
  });

  it('SC1: prunes orphans with the pre-refresh cutoff and surfaces the count', async () => {
    currentClient = makeClient({
      stalestTeams: { data: [{ team_id: 'T1' }], error: null },
      standingRows: STANDING_REFRESH_METRIC_IDS.map((m) => ({ metric_id: m, rows_upserted: 2 })),
      pruneCount: 4,
    });
    const res = await GET(authed());
    const body = (await res.json()) as Body;
    expect(body.orphans_pruned).toBe(4);

    const prune = rpcCalls.find((c) => c.name === 'prune_stale_player_standing');
    expect(prune).toBeDefined();
    expect(prune?.args.p_team_ids).toEqual(['T1']);
    // cutoff is a parseable ISO timestamp captured before the refresh
    expect(typeof prune?.args.p_cutoff).toBe('string');
    expect(Number.isNaN(Date.parse(prune?.args.p_cutoff as string))).toBe(false);
  });

  it('SC2: flags a covered metric that upserted 0 rows across the chunk', async () => {
    // sg_total returns 0 rows while every other covered metric returns rows.
    currentClient = makeClient({
      stalestTeams: { data: [{ team_id: 'T1' }], error: null },
      standingRows: STANDING_REFRESH_METRIC_IDS.map((m) => ({
        metric_id: m,
        rows_upserted: m === 'sg_total' ? 0 : 5,
      })),
    });
    const res = await GET(authed());
    const body = (await res.json()) as Body;
    expect(body.metrics_covered_zero_rows).toContain('sg_total');
    // a metric that produced rows must NOT be flagged
    expect(body.metrics_covered_zero_rows).not.toContain('sg_ott');
  });

  it('SC2: empty covered-zero-rows list when every covered metric produces rows', async () => {
    currentClient = makeClient({
      stalestTeams: { data: [{ team_id: 'T1' }], error: null },
      standingRows: STANDING_REFRESH_METRIC_IDS.map((m) => ({ metric_id: m, rows_upserted: 7 })),
      roundRows: [
        { out_metric_id: 'practice_tournament_delta', out_rows_upserted: 2 },
        { out_metric_id: 'opening_hole_delta', out_rows_upserted: 2 },
      ],
      shotRows: [
        { out_metric_id: 'approach_proximity_50_125ft', out_rows_upserted: 1 },
        { out_metric_id: 'approach_proximity_125_175ft', out_rows_upserted: 1 },
        { out_metric_id: 'approach_proximity_175_plus_ft', out_rows_upserted: 1 },
      ],
    });
    const res = await GET(authed());
    const body = (await res.json()) as Body;
    expect(body.metrics_covered_zero_rows).toEqual([]);
  });
});
