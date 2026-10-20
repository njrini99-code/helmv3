import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logServerError, isFlagEnabled } = vi.hoisted(() => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  isFlagEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError, logServerEvent: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the test must inject its own client');
  },
}));

import { runSupportPass, SUPPORT_FLAG, isSupportPassEnabled } from '../run-pass';
import { buildRunLogRow, isMissingTableError, writeRunLog, RUN_LOG_TABLE } from '../run-log';

type Result = { data: unknown; error: unknown };

/** A minimal chainable PostgREST stand-in that records every call. */
function fakeClient(handlers: {
  select?: (table: string, filters: Array<[string, unknown[]]>) => Result;
  update?: (table: string, values: unknown, filters: Array<[string, unknown[]]>) => Result;
  insert?: (table: string, values: unknown) => Result;
}) {
  const calls: Array<{ table: string; op: string; values?: unknown; filters: Array<[string, unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown[]]> = [];
      let op = 'select';
      let values: unknown;
      const builder: Record<string, unknown> = {};
      const chain = (name: string) =>
        (...args: unknown[]) => {
          filters.push([name, args]);
          return builder;
        };
      for (const name of ['eq', 'is', 'neq', 'gte', 'order', 'limit', 'in']) builder[name] = chain(name);
      builder.select = (...args: unknown[]) => {
        filters.push(['select', args]);
        return builder;
      };
      builder.update = (v: unknown) => {
        op = 'update';
        values = v;
        return builder;
      };
      builder.insert = (v: unknown) => {
        op = 'insert';
        values = v;
        calls.push({ table, op, values, filters });
        return Promise.resolve(handlers.insert?.(table, v) ?? { data: null, error: null });
      };
      builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
        calls.push({ table, op, values, filters });
        try {
          const r =
            op === 'update'
              ? handlers.update?.(table, values, filters) ?? { data: [], error: null }
              : handlers.select?.(table, filters) ?? { data: [], error: null };
          return Promise.resolve(r).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

const ROW = {
  id: 'i1',
  insight_type: 'putt_distance',
  updated_at: '2026-10-20T10:00:00.000Z',
  evidence: {
    metric: 'putts_made_3_5ft_pct',
    unit: 'percent',
    your_value: 60,
    sample_n: 80,
    comparison_value: 96,
    comparison_source: 'pga_baseline',
    strokes_impact: 0.8,
    strokes_impact_method: 'peer_delta',
    confidence: 1,
    detail: { band_attempts: 80, rounds_played: 10 },
    standing: { team_avg: 80, team_n: 8 },
  },
};

beforeEach(() => {
  logServerError.mockClear();
  isFlagEnabled.mockReset().mockReturnValue(false);
});

describe('flag', () => {
  it('is coachhelm_support_v1 and reads the registry', () => {
    expect(SUPPORT_FLAG).toBe('coachhelm_support_v1');
    expect(isSupportPassEnabled()).toBe(false);
    expect(isFlagEnabled).toHaveBeenCalledWith('coachhelm_support_v1');
  });
});

describe('runSupportPass', () => {
  it('does nothing at all with the flag off', async () => {
    const { client, calls } = fakeClient({});
    const r = await runSupportPass({ playerId: 'p1', runStartedAt: '2026-10-20T09:59:00.000Z', supabase: client });
    expect(r).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('reads this run’s rows, merges the support fields, and writes the run log', async () => {
    const { client, calls } = fakeClient({
      select: (table) =>
        table === 'golf_coach_insights'
          ? { data: [ROW], error: null }
          : { data: [{ id: 'r-newest' }], error: null },
      update: () => ({ data: [{ id: 'i1' }], error: null }),
    });
    const r = await runSupportPass({
      playerId: 'p1',
      runStartedAt: '2026-10-20T09:59:00.000Z',
      trigger: 'round',
      supabase: client,
      enabled: true,
    });
    expect(r).not.toBeNull();
    expect(r!.rowsUpdated).toBe(1);
    expect(r!.runLog).toBe('written');

    const read = calls.find((c) => c.table === 'golf_coach_insights' && c.op === 'select')!;
    expect(read.filters).toContainEqual(['eq', ['player_id', 'p1']]);
    expect(read.filters).toContainEqual(['gte', ['updated_at', '2026-10-20T09:59:00.000Z']]);

    const write = calls.find((c) => c.op === 'update')!;
    const evidence = (write.values as { evidence: Record<string, unknown> }).evidence;
    // Additive only: the original keys (confidence included) are untouched.
    expect(evidence.confidence).toBe(1);
    expect(evidence.your_value).toBe(60);
    expect(evidence.ladder).toBe('observed');
    expect((evidence.support as { q_adj: number }).q_adj).toBeGreaterThan(0);
    // Only `evidence` is written; compare-and-set on updated_at.
    expect(Object.keys(write.values as object)).toEqual(['evidence']);
    expect(write.filters).toContainEqual(['eq', ['updated_at', ROW.updated_at]]);

    const log = calls.find((c) => c.op === 'insert')!;
    expect(log.table).toBe(RUN_LOG_TABLE);
    expect(log.values).toMatchObject({
      player_id: 'p1',
      trigger: 'round',
      newest_round_id: 'r-newest',
      candidates: 1,
      supported: 1,
      shown: 1,
      engine_version: 'v3',
      support_version: 'support_v1',
    });
  });

  it('counts a lost compare-and-set as skipped, not updated', async () => {
    const { client } = fakeClient({
      select: (table) => (table === 'golf_coach_insights' ? { data: [ROW], error: null } : { data: [], error: null }),
      update: () => ({ data: [], error: null }),
    });
    const r = await runSupportPass({ playerId: 'p1', runStartedAt: 'x', supabase: client, enabled: true });
    expect(r!.rowsUpdated).toBe(0);
    expect(r!.rowsSkipped).toBe(1);
  });

  it('treats a missing run-log table as not available, without logging an error', async () => {
    const { client } = fakeClient({
      select: (table) => (table === 'golf_coach_insights' ? { data: [ROW], error: null } : { data: [], error: null }),
      update: () => ({ data: [{ id: 'i1' }], error: null }),
      insert: () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }),
    });
    const r = await runSupportPass({ playerId: 'p1', runStartedAt: 'x', supabase: client, enabled: true });
    expect(r!.runLog).toBe('unavailable');
    expect(r!.rowsUpdated).toBe(1);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('never throws: a failed read is logged and returns null', async () => {
    const { client } = fakeClient({ select: () => ({ data: null, error: { code: '57014', message: 'timeout' } }) });
    await expect(runSupportPass({ playerId: 'p1', runStartedAt: 'x', supabase: client, enabled: true })).resolves.toBeNull();
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

describe('run log writer', () => {
  it('recognises both missing-table codes', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTableError({ message: 'relation "public.golf_coachhelm_run_log" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: '23505' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });

  it('returns unavailable when the insert throws a missing-table error', async () => {
    const client = {
      from: () => ({
        insert: () => {
          throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
        },
      }),
    };
    const row = buildRunLogRow({ playerId: 'p', runAt: 'now', trigger: 'unspecified', newestRoundId: null, summary: emptySummary(), engineVersion: 'v3', supportVersion: 'support_v1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(writeRunLog(client as any, row)).resolves.toBe('unavailable');
  });

  it('logs and returns failed on any other error', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { code: '23514', message: 'check' } }) }) };
    const row = buildRunLogRow({ playerId: 'p', runAt: 'now', trigger: 'sweep', newestRoundId: null, summary: emptySummary(), engineVersion: 'v3', supportVersion: 'support_v1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(writeRunLog(client as any, row)).resolves.toBe('failed');
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

function emptySummary() {
  return {
    candidates: 0,
    testable: 0,
    supported: 0,
    eligible: 0,
    suppressed: {},
    rungs: { not_enough_yet: 0, working_hypothesis: 0, likely: 0, observed: 0, seen_repeatedly: 0 },
    families: {},
    watching: [],
    tests_in_run: 0,
  };
}
