import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeCall, type FakeResponse } from './fake-supabase';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({
  isFlagEnabled: (id: string) => id === 'coachhelm_verdicts_v1' && flag.on,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/notifications/in-app', () => ({
  recordInAppNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { recordInAppNotification } from '@/lib/notifications/in-app';
import { logServerError } from '@/lib/server-error-logger';
import { runFocusAreaVerdicts } from '../verdict-job';

const NOW = new Date('2026-10-20T04:00:00.000Z');

const criterion = (threshold: number) => ({ direction: 'higher', threshold, unit: 'pct' });

/** Synthetic focus areas: one at its horizon and worse, one short of it, one untrackable. */
const AREAS = [
  {
    id: 'fa-worse',
    player_id: 'p1',
    coach_id: 'c1',
    title: 'Short putts',
    target_metric: 'putts_made_3_5ft_pct',
    started_at: '2026-09-01T12:00:00Z',
    baseline_shrunk: 0.65,
    criterion: criterion(0.72),
    horizon: { attempts: 20 },
  },
  {
    id: 'fa-early',
    player_id: 'p2',
    coach_id: 'c2',
    title: 'Short putts',
    target_metric: 'putts_made_3_5ft_pct',
    started_at: '2026-09-01T12:00:00Z',
    baseline_shrunk: 0.6,
    criterion: criterion(0.7),
    horizon: { attempts: 40 },
  },
  {
    id: 'fa-custom',
    player_id: 'p2',
    coach_id: 'c2',
    title: 'Tempo',
    target_metric: 'tempo',
    started_at: '2026-09-01T12:00:00Z',
    baseline_shrunk: 0.5,
    criterion: criterion(0.6),
    horizon: { attempts: 20 },
  },
];

const ROUNDS = [
  { id: 'r1', player_id: 'p1', round_date: '2026-09-03' },
  { id: 'r2', player_id: 'p1', round_date: '2026-09-10' },
  { id: 'r9', player_id: 'p1', round_date: '2026-09-20' }, // after the horizon round: not counted
  { id: 'r3', player_id: 'p2', round_date: '2026-09-04' },
];

function putts(roundId: string, attempts: number, made: number) {
  return Array.from({ length: attempts }, (_, i) => ({
    round_id: roundId,
    distance_to_hole_before: 4,
    result: i < made ? 'hole' : 'green',
    putt_made: null,
  }));
}

const SHOTS = [...putts('r1', 12, 5), ...putts('r2', 10, 4), ...putts('r9', 10, 10), ...putts('r3', 10, 7)];

function world(overrides: Partial<Record<string, (call: FakeCall) => FakeResponse>> = {}) {
  return fakeSupabase((call) => {
    const custom = overrides[`${call.table}:${call.op}`];
    if (custom) return custom(call);
    if (call.table === 'golf_player_focus_areas' && call.op === 'select') return { data: AREAS, error: null };
    if (call.table === 'golf_player_focus_areas' && call.op === 'update') return { data: [{ id: 'x' }], error: null };
    if (call.table === 'golf_rounds') return { data: ROUNDS, error: null };
    if (call.table === 'golf_shots') return { data: SHOTS, error: null };
    if (call.table === 'golf_coaches') return { data: { user_id: 'coach-user-1' }, error: null };
    throw new Error(`unexpected ${call.op} on ${call.table}`);
  });
}

describe('runFocusAreaVerdicts', () => {
  beforeEach(() => {
    flag.on = false;
    vi.mocked(recordInAppNotification).mockClear();
    vi.mocked(logServerError).mockClear();
  });

  it('flag off: returns without a single query', async () => {
    const { client, calls } = world();
    const summary = await runFocusAreaVerdicts(client, NOW);
    expect(summary).toMatchObject({ ran: false, reason: 'flag_off', candidates: 0 });
    expect(calls).toHaveLength(0);
    expect(recordInAppNotification).not.toHaveBeenCalled();
  });

  it.each(['42703', 'PGRST204', '42P01', 'PGRST205'])(
    'migration not applied (%s): feature not available, nothing thrown or written',
    async (code) => {
      flag.on = true;
      const { client, calls } = world({
        'golf_player_focus_areas:select': () => ({ data: null, error: { code, message: 'column golf_player_focus_areas.verdict does not exist' } }),
      });
      const summary = await runFocusAreaVerdicts(client, NOW);
      expect(summary).toMatchObject({ ran: false, reason: 'schema_missing' });
      expect(calls.map((c) => c.table)).toEqual(['golf_player_focus_areas']);
      expect(logServerError).not.toHaveBeenCalled();
    },
  );

  it('writes a verdict at the horizon, once, and puts "got worse" in front of the coach only', async () => {
    flag.on = true;
    const { client, calls } = world();
    const summary = await runFocusAreaVerdicts(client, NOW);

    expect(summary).toMatchObject({
      ran: true,
      candidates: 3,
      unsupported: 1,
      too_early: 1,
      written: { got_worse: 1 },
      failed: 0,
      coach_notices: 1,
    });

    // The candidate query only takes started, unjudged areas with a criterion.
    const load = calls[0]!;
    expect(load.steps).toContainEqual(['is', ['verdict', null]]);
    expect(load.steps).toContainEqual(['not', ['criterion', 'is', null]]);

    // Test rounds never count.
    expect(calls.find((c) => c.table === 'golf_rounds')!.steps).toContainEqual(['eq', ['is_test', false]]);

    const writes = calls.filter((c) => c.op === 'update');
    expect(writes).toHaveLength(1);
    const write = writes[0]!;
    expect(write.steps).toContainEqual(['eq', ['id', 'fa-worse']]);
    expect(write.steps).toContainEqual(['is', ['verdict', null]]);
    const verdict = (write.payload as { verdict: Record<string, unknown> }).verdict;
    // r1 + r2 = 9 of 22 reaches the 20-putt horizon; r9 is not counted.
    expect(verdict).toMatchObject({
      word: 'got_worse',
      post: { made: 9, n: 22, window_start: '2026-09-01', window_end: '2026-09-10' },
      expected_without_coaching: 0.65,
      threshold: 0.72,
      computed_at: NOW.toISOString(),
    });
    // Nothing else on the row moves: no status, no outcome_status.
    expect(Object.keys(write.payload as object)).toEqual(['verdict']);

    expect(recordInAppNotification).toHaveBeenCalledTimes(1);
    expect(recordInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['coach-user-1'],
        data: expect.objectContaining({ verdict: 'got_worse', focus_area_id: 'fa-worse' }),
      }),
    );
  });

  it('a verdict another run already wrote is not counted or re-announced', async () => {
    flag.on = true;
    const { client } = world({ 'golf_player_focus_areas:update': () => ({ data: [], error: null }) });
    const summary = await runFocusAreaVerdicts(client, NOW);
    expect(summary.written).toEqual({});
    expect(recordInAppNotification).not.toHaveBeenCalled();
  });

  describe('HELM_COACHHELM_TEAMS canary', () => {
    afterEach(() => {
      delete process.env.HELM_COACHHELM_TEAMS;
    });

    it('judges only the areas of players on a listed team', async () => {
      flag.on = true;
      process.env.HELM_COACHHELM_TEAMS = 't1';
      const { client, calls } = world({
        'golf_team_members:select': () => ({ data: [{ player_id: 'p1', team_id: 't1' }], error: null }),
      });
      const summary = await runFocusAreaVerdicts(client, NOW);
      // p2's two areas are left out; p1's is judged as before.
      expect(summary).toMatchObject({ ran: true, candidates: 1, written: { got_worse: 1 } });
      expect(calls.find((c) => c.table === 'golf_team_members')!.steps).toContainEqual(['in', ['team_id', ['t1']]]);
    });

    it('no player on a listed team: flag off, no focus-area read', async () => {
      flag.on = true;
      process.env.HELM_COACHHELM_TEAMS = 't1';
      const { client, calls } = world({
        'golf_team_members:select': () => ({ data: [], error: null }),
      });
      const summary = await runFocusAreaVerdicts(client, NOW);
      expect(summary).toMatchObject({ ran: false, reason: 'flag_off' });
      expect(calls.map((c) => c.table)).toEqual(['golf_team_members']);
    });
  });

  it('a failed count load stops the run without writing a verdict on partial data', async () => {
    flag.on = true;
    const { client, calls } = world({ 'golf_shots:select': () => ({ data: null, error: { code: '57014', message: 'timeout' } }) });
    const summary = await runFocusAreaVerdicts(client, NOW);
    expect(summary).toMatchObject({ ran: false, reason: 'load_failed' });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });
});
