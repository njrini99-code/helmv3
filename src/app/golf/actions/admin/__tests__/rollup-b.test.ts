import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpcResponses: {} as Record<string, { data: unknown; error: unknown }>,
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string) =>
      Promise.resolve(
        mocks.rpcResponses[fn] ?? { data: null, error: { message: `no mock for ${fn}` } },
      ),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));

import { fetchAdminRollupB } from '@/app/golf/actions/admin/rollup-b';

const EMPTY_TEAMS_SCORING = {
  teams: [],
  team_members: [],
  team_rounds_week: [],
  player_stats_top50: [],
  player_team_map: [],
  coach_orgs: [],
  scoring_distribution: [],
  recent_best_rounds: [],
  strokes_gained: null,
  stats_cache_last_updated: null,
  demo_requests: { total: 0, pending: 0, recent: [] },
  golf_communication: { total_announcements: 0, ack_count: 0, total_messages: 0, total_conversations: 0 },
  attendance_percentages: [],
};

const EMPTY_BASEBALL = {
  total_players: 0,
  total_coaches: 0,
  watchlist_stages: {},
  recruiting_activated_players: 0,
  videos_30d: 0,
  engagement_events_30d: 0,
  messages_30d: 0,
  conversations_30d: 0,
  players_onboarded: 0,
  coaches_onboarded: 0,
  total_teams: 0,
  total_events: 0,
  total_camps: 0,
};

const EMPTY_PLATFORM_AVGS = {
  scoring_average: null,
  driving_accuracy_percentage: null,
  gir_percentage: null,
  putts_per_round: null,
  player_count: 0,
};

function baseErrorsPayload(errorSummary: unknown) {
  return {
    error_logs: { recent: [], total_7d: 0, critical_7d: 0, count_24h: 0 },
    error_summary: errorSummary,
    audit_log: { recent: [], total_7d: 0 },
    login_security: { recent: [], locked_count: 0 },
    admin_events: { recent: [], unresolved_critical: [], error_only: [], summary: null },
  };
}

describe('fetchAdminRollupB — top_errors occurrences mapping', () => {
  beforeEach(() => {
    mocks.logServerError.mockClear();
    mocks.rpcResponses = {
      get_admin_baseball_rollup: { data: EMPTY_BASEBALL, error: null },
      get_admin_teams_scoring_rollup: { data: EMPTY_TEAMS_SCORING, error: null },
      get_admin_platform_stat_averages: { data: EMPTY_PLATFORM_AVGS, error: null },
    };
  });

  it('maps the RPC wire field `cnt` onto the public `occurrences` field', async () => {
    mocks.rpcResponses.get_admin_errors_rollup = {
      data: baseErrorsPayload({
        by_severity: [{ severity: 'error', count: 3 }],
        top_errors: [
          {
            message: 'Save failed',
            severity: 'error',
            cnt: 7,
            first_seen: '2026-07-01T00:00:00Z',
            last_seen: '2026-07-02T00:00:00Z',
            affected_users: 4,
          },
        ],
        daily_rate: [],
        total_count: 7,
        critical_count: 0,
      }),
      error: null,
    };

    const result = await fetchAdminRollupB();

    expect(result.errors.errorSummaryDegraded).toBe(false);
    expect(result.errors.errorSummary?.top_errors).toHaveLength(1);
    const row = result.errors.errorSummary!.top_errors[0]!;
    expect(row.occurrences).toBe(7);
    // No stray `cnt` key leaking through — the module's public contract is
    // `occurrences` only.
    expect((row as unknown as Record<string, unknown>).cnt).toBeUndefined();
    expect(row.message).toBe('Save failed');
    expect(row.affected_users).toBe(4);
  });

  it('leaves errorSummary null (and degraded=true) when the RPC returns a null error_summary', async () => {
    mocks.rpcResponses.get_admin_errors_rollup = {
      data: baseErrorsPayload(null),
      error: null,
    };

    const result = await fetchAdminRollupB();

    expect(result.errors.errorSummaryDegraded).toBe(true);
    expect(result.errors.errorSummary).toBeNull();
  });

  it('maps an empty top_errors array to an empty array, not an error', async () => {
    mocks.rpcResponses.get_admin_errors_rollup = {
      data: baseErrorsPayload({
        by_severity: [],
        top_errors: [],
        daily_rate: [],
        total_count: 0,
        critical_count: 0,
      }),
      error: null,
    };

    const result = await fetchAdminRollupB();

    expect(result.errors.errorSummary?.top_errors).toEqual([]);
  });
});
