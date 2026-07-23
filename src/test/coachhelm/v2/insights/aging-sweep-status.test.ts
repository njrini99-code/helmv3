import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * P1 B3 (2026-07-23 accuracy audit) — regression test for the
 * `triggerPlayerInsightsAfterRoundImpl` dedup "aging sweep" in
 * src/app/golf/actions/insights.ts.
 *
 * BUG: the sweep used to bulk-write `status: 'resolved'` on every v2-engine
 * insight older than 3 days, with NO check on whether the underlying metric
 * improved. 'resolved' is the exact value `resolveInsightImpl` writes for
 * genuine coach/outcome-validated resolution — reusing it silently hid live
 * problems (including a coach's biggest insight) under a label that means
 * "this got fixed."
 *
 * FIX: the sweep now writes `status: 'dismissed'` instead — verified against
 * the live `golf_coach_insights_status_check` CHECK constraint (only
 * 'active' | 'acknowledged' | 'dismissed' | 'resolved' are permitted; there
 * is no 'superseded'/'stale' member, and this task is APP-code-only with no
 * DB migration, so the fix must land inside the existing enum. 'dismissed'
 * was chosen over 'acknowledged' because 'acknowledged' rows stay searchable
 * in command-palette.ts's insight search, which explicitly whitelists
 * status IN ('active','acknowledged') — that would leave an aged-out row
 * visible in the very surface the sweep exists to clear it from).
 *
 * This test drives the REAL `triggerPlayerInsightsAfterRound` bridge (the
 * actual production entrypoint post-round submission and the roster-sweep
 * cron use), not a re-implementation of the sweep's SQL, so a regression
 * back to 'resolved' — or any change that stops moving old rows out of the
 * active set — fails this test.
 */

// ── Minimal Postgrest-shaped fake admin client ──────────────────────────
// Deliberately local to this test file (not the shared src/test/fixtures
// fake-supabase.ts) — the aging sweep chains `.lt()` and `.contains()`,
// which that shared fixture doesn't implement, and this task's scope is
// insights.ts + its own test only.
type Row = Record<string, unknown>;

function containsMatch(row: Row, col: string, value: Record<string, unknown>): boolean {
  const target = row[col];
  if (!target || typeof target !== 'object') return false;
  return Object.entries(value).every(([k, v]) => (target as Row)[k] === v);
}

function makeFakeAdminClient(tables: Record<string, Row[]>) {
  function queryBuilder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let limitN: number | undefined;
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      lt: (col: string, val: unknown) => {
        filters.push((row) => (row[col] as string) < (val as string));
        return builder;
      },
      contains: (col: string, val: Record<string, unknown>) => {
        filters.push((row) => containsMatch(row, col, val));
        return builder;
      },
      limit: (n: number) => {
        limitN = n;
        return builder;
      },
      async single() {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
      },
      async maybeSingle() {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: { data: Row[]; error: null }) => unknown) {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (limitN !== undefined) rows = rows.slice(0, limitN);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  }

  function writeBuilder(table: string, op: 'update' | 'insert', payload: unknown) {
    const filters: Array<(row: Row) => boolean> = [];
    const builder = {
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      lt: (col: string, val: unknown) => {
        filters.push((row) => (row[col] as string) < (val as string));
        return builder;
      },
      contains: (col: string, val: Record<string, unknown>) => {
        filters.push((row) => containsMatch(row, col, val));
        return builder;
      },
      select: () => builder,
      async single() {
        const { data } = await run();
        return { data: data?.[0] ?? null, error: null };
      },
      then(resolve: (v: { data: Row[]; error: null }) => unknown) {
        return run().then(resolve);
      },
    };
    async function run() {
      const list = (tables[table] ??= []);
      const affected: Row[] = [];
      if (op === 'insert') {
        const row = { id: `fake-${Math.random().toString(36).slice(2, 8)}`, ...(payload as Row) };
        list.push(row);
        affected.push(row);
      } else {
        for (const row of list) {
          if (filters.every((f) => f(row))) {
            Object.assign(row, payload as Row);
            affected.push(row);
          }
        }
      }
      return { data: affected, error: null };
    }
    return builder;
  }

  return {
    from(table: string) {
      return {
        select: () => queryBuilder(table).select(),
        update: (payload: unknown) => writeBuilder(table, 'update', payload),
        insert: (payload: unknown) => writeBuilder(table, 'insert', payload),
      };
    },
  };
}

// ── Module mocks ─────────────────────────────────────────────────────────
let fakeTables: Record<string, Row[]>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeFakeAdminClient(fakeTables),
}));

const analyzePlayerMock = vi.fn();
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { analyzePlayer: (...args: unknown[]) => analyzePlayerMock(...args) },
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true })),
}));

vi.mock('@/lib/coachhelm/v3/intent/loader', () => ({
  loadAlertPostureForPlayer: vi.fn(async () => null),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

// Import AFTER the mocks above — importing insights.ts runs its module-scope
// `__registerTriggerPlayerInsightsAfterRound(...)` side effect, which is
// what the bridge needs to have a real impl to delegate to.
import '@/app/golf/actions/insights';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const agedIso = new Date(Date.now() - THREE_DAYS_MS - 24 * 60 * 60 * 1000).toISOString(); // 4 days old
const recentResolvedIso = new Date(Date.now() - THREE_DAYS_MS - 5 * 24 * 60 * 60 * 1000).toISOString(); // 8 days old, already resolved

describe('triggerPlayerInsightsAfterRound — aging sweep status (P1 B3)', () => {
  beforeEach(() => {
    analyzePlayerMock.mockReset();
    // Empty analysis — no insights/patterns to process — lets the run reach
    // the aging sweep and a clean success return without needing to also
    // mock upsertInsight/toInsightInput/push notifications.
    analyzePlayerMock.mockResolvedValue({ insights: [], patterns: [], predictions: [] });

    fakeTables = {
      golf_team_members: [
        {
          player_id: 'player-1',
          team_id: 'team-1',
          status: 'active',
          golf_teams: { organization_id: 'org-1' },
        },
      ],
      golf_coaches: [{ id: 'coach-1', organization_id: 'org-1' }],
      golf_coachhelm_settings: [],
      golf_team_coachhelm_settings: [],
      golf_coach_philosophy: [],
      golf_coach_insights: [
        // Stale v2-engine insight still 'active' — the sweep's actual
        // target. Must be moved OUT of 'active' without landing on
        // 'resolved'.
        {
          id: 'insight-aged',
          coach_id: 'coach-1',
          player_id: 'player-1',
          status: 'active',
          created_at: agedIso,
          metadata: { v2_engine: true },
        },
        // A genuinely resolved insight (as resolveInsightImpl would leave
        // it — status already 'resolved', not 'active') that is also old
        // and also v2-tagged. The sweep's WHERE clause only ever touches
        // status='active' rows, so this must come out completely
        // untouched — proving the aging sweep can't clobber a real,
        // outcome-validated resolution.
        {
          id: 'insight-genuinely-resolved',
          coach_id: 'coach-1',
          player_id: 'player-1',
          status: 'resolved',
          resolved_at: recentResolvedIso,
          lifecycle_state: 'resolved',
          created_at: recentResolvedIso,
          metadata: { v2_engine: true },
        },
      ],
      golf_insight_generation_log: [],
    };
  });

  it('moves the aged active insight to status=dismissed, never resolved', async () => {
    const result = await triggerPlayerInsightsAfterRound('player-1');

    expect(result.success).toBe(true);

    const aged = fakeTables.golf_coach_insights?.find((r) => r.id === 'insight-aged');
    expect(aged?.status).toBe('dismissed');
    expect(aged?.status).not.toBe('resolved');
  });

  it('leaves a genuinely-resolved insight completely unaffected', async () => {
    await triggerPlayerInsightsAfterRound('player-1');

    const genuine = fakeTables.golf_coach_insights?.find((r) => r.id === 'insight-genuinely-resolved');
    expect(genuine?.status).toBe('resolved');
    expect(genuine?.resolved_at).toBe(recentResolvedIso);
    expect(genuine?.lifecycle_state).toBe('resolved');
  });
});
