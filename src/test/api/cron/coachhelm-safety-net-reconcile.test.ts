/**
 * Repair plan R3 / Package 4 — the safety net's three populations.
 *
 * Acceptance (owner plan §5.3): rounds 1–2 wait without a failure; round 3
 * wakes the player when the configured floor is three; no-membership stays
 * quiet; team disable stays quiet; a genuine transient failure retries
 * (bounded); hard failures stay inspectable; a waiting player never creates
 * a recurring retry storm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(),
}));

const logServerErrorMock = vi.fn(async (..._args: unknown[]) => undefined);
const logServerEventMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
  logServerEvent: (...args: unknown[]) => logServerEventMock(...args),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coachhelm-safety-net/route';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const postRoundTriggerMock = vi.mocked(postRoundTrigger);

type Row = Record<string, unknown>;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

interface Tables {
  golf_rounds: Row[];
  golf_team_members?: Row[];
  golf_team_coachhelm_settings?: Row[];
  golf_teams?: Row[];
  golf_coaches?: Row[];
  golf_coachhelm_settings?: Row[];
}

function seed(tables: Tables) {
  const rounds = tables.golf_rounds;
  fake = createFakeSupabase({
    tables: {
      golf_team_members: [],
      golf_team_coachhelm_settings: [],
      golf_teams: [],
      golf_coaches: [],
      golf_coachhelm_settings: [],
      ...tables,
    },
    rpc: {
      record_round_coachhelm_terminal_state: async (rawArgs) => {
        const args = rawArgs as {
          p_round_id: string;
          p_analyzed_at: string | null;
          p_failed_at: string | null;
          p_failure_reason: string | null;
        };
        const round = rounds.find((row) => row.id === args.p_round_id);
        if (!round) return { data: null, error: null };
        Object.assign(round, {
          coachhelm_analyzed_at: args.p_analyzed_at,
          coachhelm_failed_at: args.p_failed_at,
          coachhelm_failure_reason: args.p_failure_reason,
        });
        return { data: args.p_round_id, error: null };
      },
    },
  });
}

function callGet() {
  return GET(
    new Request('http://x/api/cron/coachhelm-safety-net', {
      headers: { authorization: 'Bearer cs' },
    }) as unknown as import('next/server').NextRequest,
  );
}

function completed(overrides: Row): Row {
  return {
    status: 'completed',
    team_id: 't1',
    coachhelm_analyzed_at: null,
    coachhelm_failed_at: null,
    coachhelm_failure_reason: null,
    ...overrides,
  };
}

function parked(reason: string, overrides: Row): Row {
  return completed({ coachhelm_failure_reason: reason, ...overrides });
}

function succeeded(roundId: string) {
  return {
    success: true,
    code: 'engine_succeeded' as const,
    outcome: { kind: 'succeeded' as const, code: 'engine_succeeded' as const, message: 'ok' },
    roundId,
  };
}

function round(id: string) {
  return fake.from('golf_rounds').select('*').eq('id', id).maybeSingle();
}

beforeEach(() => {
  vi.clearAllMocks();
  postRoundTriggerMock.mockReset();
  postRoundTriggerMock.mockImplementation(async (_admin, args) => succeeded(args.roundId));
  process.env.CRON_SECRET = 'cs';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('safety net — parked rounds (R3)', () => {
  it('a parked round is not re-run every tick: excluded from the never-processed sweep, no engine call', async () => {
    seed({
      golf_rounds: [
        parked('engine_below_round_floor', { id: 'r1', player_id: 'p1', created_at: ago(2 * HOUR_MS) }),
        parked('engine_below_round_floor', { id: 'r2', player_id: 'p1', created_at: ago(HOUR_MS) }),
      ],
    });

    const res = await callGet();
    const body = (await res.json()) as { pending: number; reconciled: { stillParked: number; woken: number; covered: number } };
    expect(body.pending).toBe(0);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect(body.reconciled).toMatchObject({ woken: 0, covered: 0, stillParked: 2 });
    // Still parked, still not failed.
    expect((await round('r1')).data).toMatchObject({ coachhelm_failed_at: null, coachhelm_failure_reason: 'engine_below_round_floor' });
  });

  it('round 3 wakes the player: the never-processed sweep runs it, and its success covers rounds 1–2', async () => {
    seed({
      golf_rounds: [
        parked('engine_below_round_floor', { id: 'r1', player_id: 'p1', created_at: ago(3 * HOUR_MS) }),
        parked('engine_below_round_floor', { id: 'r2', player_id: 'p1', created_at: ago(2 * HOUR_MS) }),
        // Round 3's own trigger never ran (after() died) — reason NULL, pending.
        completed({ id: 'r3', player_id: 'p1', created_at: ago(HOUR_MS) }),
      ],
    });
    postRoundTriggerMock.mockImplementation(async (admin, args) => {
      await (admin as unknown as FakeSupabase).rpc('record_round_coachhelm_terminal_state', {
        p_round_id: args.roundId,
        p_analyzed_at: new Date().toISOString(),
        p_failed_at: null,
        p_failure_reason: null,
      });
      return succeeded(args.roundId);
    });

    const res = await callGet();
    const body = (await res.json()) as { recovered: number; reconciled: { covered: number; woken: number } };
    expect(body.recovered).toBe(1);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r3' }));
    expect(body.reconciled).toMatchObject({ covered: 2, woken: 0 });
    for (const id of ['r1', 'r2']) {
      expect((await round(id)).data).toMatchObject({
        coachhelm_failed_at: null,
        coachhelm_failure_reason: 'engine_covered_by_later_run',
      });
      expect((await round(id)).data?.coachhelm_analyzed_at).toBeTruthy();
    }
  });

  it('a legacy FAILED engine_no_recent_rounds round is repaired by the same coverage rule, not a bulk update', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'old',
          player_id: 'p1',
          created_at: ago(40 * 24 * HOUR_MS),
          coachhelm_failed_at: ago(39 * 24 * HOUR_MS),
          coachhelm_failure_reason: 'engine_no_recent_rounds',
        }),
        completed({ id: 'new', player_id: 'p1', created_at: ago(HOUR_MS), coachhelm_analyzed_at: ago(50 * MINUTE_MS) }),
      ],
    });

    const res = await callGet();
    const body = (await res.json()) as { reconciled: { covered: number } };
    expect(body.reconciled.covered).toBe(1);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect((await round('old')).data).toMatchObject({
      coachhelm_failed_at: null,
      coachhelm_failure_reason: 'engine_covered_by_later_run',
    });
  });

  it('no membership stays quiet until a roster row appears, then gets ONE run', async () => {
    seed({
      golf_rounds: [
        parked('engine_no_team_membership', { id: 'r1', player_id: 'p1', created_at: ago(3 * HOUR_MS) }),
        parked('engine_no_team_membership', { id: 'r2', player_id: 'p1', created_at: ago(2 * HOUR_MS) }),
      ],
      golf_team_members: [],
    });

    let body = (await (await callGet()).json()) as { reconciled: { woken: number; stillParked: number; covered: number } };
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect(body.reconciled).toMatchObject({ woken: 0, stillParked: 2 });

    // The player joins a team.
    await fake.from('golf_team_members').insert({ player_id: 'p1', team_id: 't1', status: 'active' });
    body = (await (await callGet()).json()) as { reconciled: { woken: number; stillParked: number; covered: number } };
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r2', triggerReason: 'safety_net' }));
    expect(body.reconciled).toMatchObject({ woken: 1, covered: 1 });
    expect((await round('r1')).data).toMatchObject({ coachhelm_failure_reason: 'engine_covered_by_later_run' });
  });

  it('a legacy FAILED engine_membership_missing round wakes the same way', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'r1',
          player_id: 'p1',
          created_at: ago(20 * 24 * HOUR_MS),
          coachhelm_failed_at: ago(19 * 24 * HOUR_MS),
          coachhelm_failure_reason: 'engine_membership_missing',
        }),
      ],
      golf_team_members: [{ player_id: 'p1', team_id: 't1', status: 'active' }],
    });

    const body = (await (await callGet()).json()) as { reconciled: { woken: number } };
    expect(body.reconciled.woken).toBe(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r1' }));
  });

  it('team disable stays quiet until both switches are on', async () => {
    seed({
      golf_rounds: [parked('engine_disabled', { id: 'r1', player_id: 'p1', team_id: 't1', created_at: ago(HOUR_MS) })],
      golf_team_coachhelm_settings: [{ team_id: 't1', enabled: false }],
      golf_teams: [{ id: 't1', organization_id: 'o1' }],
      golf_coaches: [{ id: 'c1', organization_id: 'o1', created_at: '2026-01-01' }],
      golf_coachhelm_settings: [{ coach_id: 'c1', enabled: true }],
    });

    let body = (await (await callGet()).json()) as { reconciled: { woken: number; stillParked: number } };
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect(body.reconciled).toMatchObject({ woken: 0, stillParked: 1 });

    // Coach re-enables the team.
    await fake.from('golf_team_coachhelm_settings').update({ enabled: true }).eq('team_id', 't1');
    body = (await (await callGet()).json()) as { reconciled: { woken: number; stillParked: number } };
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(body.reconciled.woken).toBe(1);
  });

  it('a coach-level disable keeps the round parked even when the team switch is on', async () => {
    seed({
      golf_rounds: [parked('engine_disabled', { id: 'r1', player_id: 'p1', team_id: 't1', created_at: ago(HOUR_MS) })],
      golf_team_coachhelm_settings: [{ team_id: 't1', enabled: true }],
      golf_teams: [{ id: 't1', organization_id: 'o1' }],
      golf_coaches: [{ id: 'c1', organization_id: 'o1', created_at: '2026-01-01' }],
      golf_coachhelm_settings: [{ coach_id: 'c1', enabled: false }],
    });

    const body = (await (await callGet()).json()) as { reconciled: { woken: number; stillParked: number } };
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
    expect(body.reconciled).toMatchObject({ woken: 0, stillParked: 1 });
  });

  it('a woken run that parks again leaves the older rounds parked (no coverage claimed)', async () => {
    seed({
      golf_rounds: [
        parked('engine_no_team_membership', { id: 'r1', player_id: 'p1', created_at: ago(3 * HOUR_MS) }),
        parked('engine_no_team_membership', { id: 'r2', player_id: 'p1', created_at: ago(2 * HOUR_MS) }),
      ],
      golf_team_members: [{ player_id: 'p1', team_id: 't1', status: 'active' }],
    });
    postRoundTriggerMock.mockResolvedValue({
      success: false,
      error: 'under the floor',
      code: 'engine_below_round_floor',
      outcome: { kind: 'waiting_for_data', code: 'engine_below_round_floor', message: 'under the floor' },
    });

    const body = (await (await callGet()).json()) as { reconciled: { woken: number; covered: number; stillParked: number } };
    expect(body.reconciled).toMatchObject({ woken: 1, covered: 0, stillParked: 1 });
    expect((await round('r1')).data).toMatchObject({ coachhelm_failure_reason: 'engine_no_team_membership' });
  });

  it('bounds reconciliation to RECONCILE_PLAYER_LIMIT players per tick and reports the rest as still parked', async () => {
    const rounds: Row[] = [];
    for (let i = 0; i < 60; i++) {
      rounds.push(parked('engine_no_team_membership', { id: `r${i}`, player_id: `p${i}`, created_at: ago(HOUR_MS + i) }));
    }
    seed({
      golf_rounds: rounds,
      golf_team_members: rounds.map((r) => ({ player_id: r.player_id, team_id: 't1', status: 'active' })),
    });

    const body = (await (await callGet()).json()) as { reconciled: { playersExamined: number; woken: number; stillParked: number } };
    expect(body.reconciled.playersExamined).toBe(50);
    expect(body.reconciled.woken).toBe(50);
    expect(body.reconciled.stillParked).toBe(10);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(50);
  });
});

describe('safety net — transient failures (R3 backoff_with_deadline)', () => {
  it('re-runs a transient failure after the backoff with the next attempt number', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'r1',
          player_id: 'p1',
          created_at: ago(2 * HOUR_MS),
          coachhelm_failed_at: ago(45 * MINUTE_MS),
          coachhelm_failure_reason: 'engine_timeout',
        }),
      ],
    });

    const body = (await (await callGet()).json()) as { retried: { examined: number; rerun: number; recovered: number } };
    expect(body.retried).toMatchObject({ examined: 1, rerun: 1, recovered: 1 });
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r1', attempt: 2, triggerReason: 'safety_net' }));
  });

  it('respects the backoff: a failure younger than one tick is not re-run yet', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'r1',
          player_id: 'p1',
          created_at: ago(2 * HOUR_MS),
          coachhelm_failed_at: ago(5 * MINUTE_MS),
          coachhelm_failure_reason: 'engine_transient',
        }),
      ],
    });

    const body = (await (await callGet()).json()) as { retried: { examined: number } };
    expect(body.retried.examined).toBe(0);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
  });

  it('an exhausted failure is never selected again, and exhaustion is reported when it happens', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'r-last',
          player_id: 'p1',
          created_at: ago(2 * HOUR_MS),
          coachhelm_failed_at: ago(HOUR_MS),
          coachhelm_failure_reason: 'engine_timeout:r2',
        }),
        completed({
          id: 'r-done',
          player_id: 'p2',
          created_at: ago(2 * HOUR_MS),
          coachhelm_failed_at: ago(HOUR_MS),
          coachhelm_failure_reason: 'engine_timeout:exhausted',
        }),
      ],
    });
    postRoundTriggerMock.mockResolvedValue({
      success: false,
      error: 'still timing out',
      code: 'engine_timeout',
      outcome: { kind: 'retryable_failure', code: 'engine_timeout', message: 'still timing out' },
    });

    const body = (await (await callGet()).json()) as { retried: { examined: number; rerun: number; exhausted: number } };
    expect(body.retried).toMatchObject({ examined: 1, rerun: 1, exhausted: 1 });
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(1);
    expect(postRoundTriggerMock).toHaveBeenCalledWith(fake, expect.objectContaining({ roundId: 'r-last', attempt: 3 }));
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('exhausted its transient-failure retries'),
      expect.objectContaining({ errorCode: 'engine_timeout', extra: expect.objectContaining({ roundId: 'r-last', attempts: 3 }) }),
      'warning',
    );
  });

  it('a permanent failure is never re-run by the safety net', async () => {
    seed({
      golf_rounds: [
        completed({
          id: 'r1',
          player_id: 'p1',
          created_at: ago(2 * HOUR_MS),
          coachhelm_failed_at: ago(HOUR_MS),
          coachhelm_failure_reason: 'engine_error',
        }),
      ],
    });

    const body = (await (await callGet()).json()) as { retried: { examined: number } };
    expect(body.retried.examined).toBe(0);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
  });
});
