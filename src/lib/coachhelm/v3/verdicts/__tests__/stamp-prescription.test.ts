import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeCall, type FakeResponse } from './fake-supabase';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({
  isFlagEnabled: (id: string) => id === 'coachhelm_verdicts_v1' && flag.on,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { stampPrescriptionFromRead } from '../stamp-prescription';

const ARGS = {
  focusAreaId: 'fa-1',
  insightId: 'ins-1',
  playerId: 'player-1',
  targetMetric: 'putts_made_3_5ft_pct',
  targetValue: null,
  assignedBy: 'coach' as const,
};

const EVIDENCE = {
  metric: 'putts_made_3_5ft_pct',
  unit: 'percent',
  your_value: 58,
  sample_n: 31,
  standing: { team_avg: 72, team_n: 9 },
};

function client(updateResponse: FakeResponse) {
  return fakeSupabase((call: FakeCall) => {
    if (call.table === 'golf_coach_insights') return { data: { evidence: EVIDENCE }, error: null };
    if (call.table === 'golf_player_focus_areas' && call.op === 'update') return updateResponse;
    throw new Error(`unexpected ${call.op} on ${call.table}`);
  });
}

describe('stampPrescriptionFromRead', () => {
  beforeEach(() => {
    flag.on = false;
    vi.mocked(logServerError).mockClear();
    vi.mocked(logServerEvent).mockClear();
  });

  it('flag off: reads nothing and writes nothing', async () => {
    const { client: c, calls } = client({ data: null, error: null });
    await expect(stampPrescriptionFromRead(c, ARGS)).resolves.toEqual({ status: 'flag_off' });
    expect(calls).toHaveLength(0);
  });

  it('flag on: writes the prescription fields scoped to the area and the player', async () => {
    flag.on = true;
    const { client: c, calls } = client({ data: null, error: null });
    const result = await stampPrescriptionFromRead(c, ARGS);
    expect(result).toEqual({ status: 'stamped', criterion: true, reason: null });

    const read = calls.find((x) => x.table === 'golf_coach_insights')!;
    expect(read.steps).toContainEqual(['eq', ['player_id', 'player-1']]);

    const write = calls.find((x) => x.op === 'update')!;
    expect(write.payload).toMatchObject({ assigned_by: 'coach', baseline_n: 31, check_after_rounds: 3, horizon: { attempts: expect.any(Number) } });
    expect(write.payload).not.toHaveProperty('criterionReason');
    expect(write.steps).toContainEqual(['eq', ['id', 'fa-1']]);
    expect(write.steps).toContainEqual(['eq', ['player_id', 'player-1']]);
  });

  it.each(['42703', 'PGRST204', '42P01', 'PGRST205'])(
    'migration not applied (%s): reports schema_missing without throwing or warning',
    async (code) => {
      flag.on = true;
      const { client: c } = client({ data: null, error: { code, message: 'column does not exist' } });
      await expect(stampPrescriptionFromRead(c, ARGS)).resolves.toEqual({ status: 'schema_missing' });
      expect(logServerError).not.toHaveBeenCalled();
      expect(logServerEvent).toHaveBeenCalledTimes(1);
    },
  );

  it('any other write failure is logged as a warning, never thrown', async () => {
    flag.on = true;
    const { client: c } = client({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(stampPrescriptionFromRead(c, ARGS)).resolves.toEqual({ status: 'write_failed' });
    expect(logServerError).toHaveBeenCalledWith(expect.stringContaining('prescription write failed'), expect.anything(), 'warning');
  });

  it('a read the area cannot be judged on still records who assigned it', async () => {
    flag.on = true;
    const { client: c, calls } = client({ data: null, error: null });
    const result = await stampPrescriptionFromRead(c, { ...ARGS, targetMetric: 'three_putt_chain' });
    expect(result).toEqual({ status: 'stamped', criterion: false, reason: 'metric_mismatch' });
    expect(calls.find((x) => x.op === 'update')!.payload).toEqual({ assigned_by: 'coach', check_after_rounds: 3 });
  });
});
