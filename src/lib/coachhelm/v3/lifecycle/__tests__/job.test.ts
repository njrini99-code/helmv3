/**
 * The nightly lifecycle step against a fake database boundary: the flag-off
 * and table-missing paths make no writes, and one full player run writes the
 * recheck onto the read and moves the checkpoint counter. Synthetic data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flag = { on: false };
vi.mock('../flag', () => ({ isRecheckEnabled: () => flag.on, RECHECK_FLAG: 'coachhelm_recheck_v1' }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));

import { runCheckpointLifecycle } from '../job';
import { LIFECYCLE_META_KEY } from '../types';

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: 'select' | 'update' | 'upsert';
  payload?: unknown;
  filters: Array<[string, unknown[]]>;
}

function fakeClient(tables: Record<string, Row[] | { error: { code: string; message: string } }>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const chain = (name: string) => (...args: unknown[]) => {
        call.filters.push([name, args]);
        return builder;
      };
      for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'range', 'gte', 'lte']) builder[m] = chain(m);
      builder.update = (payload: unknown) => {
        call.op = 'update';
        call.payload = payload;
        return builder;
      };
      builder.upsert = (payload: unknown) => {
        call.op = 'upsert';
        call.payload = payload;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        const t = tables[table];
        if (t && !Array.isArray(t)) return Promise.resolve(resolve({ data: null, error: t.error }));
        if (call.op === 'update') return Promise.resolve(resolve({ data: [{ id: 'x' }], error: null }));
        if (call.op === 'upsert') return Promise.resolve(resolve({ data: null, error: null }));
        let rows = t ?? [];
        // Only the filters the job relies on to split live and retired reads.
        const lc = call.filters.find(([n, a]) => n === 'eq' && a[0] === 'lifecycle_state');
        if (table === 'golf_coach_insights' && lc) rows = rows.filter((r) => r.lifecycle_state === lc[1][1]);
        const lcIn = call.filters.find(([n, a]) => n === 'in' && a[0] === 'lifecycle_state');
        if (table === 'golf_coach_insights' && lcIn) rows = rows.filter((r) => (lcIn[1][1] as string[]).includes(String(r.lifecycle_state)));
        return Promise.resolve(resolve({ data: rows, error: null }));
      };
      return builder;
    },
  };
  return { client, calls };
}

const NOW = new Date('2026-10-20T03:00:00.000Z');

function round(i: number): Row {
  return {
    id: `r${i}`,
    round_date: new Date(Date.UTC(2026, 9, 19) - i * 86400_000).toISOString().slice(0, 10),
    created_at: null,
    status: 'completed',
    is_test: false,
    holes_played: 18,
    total_score: 74,
    front_nine: 37,
    back_nine: 37,
    total_putts: 30,
  };
}

const putts = Array.from({ length: 30 }, (_, i) => ({
  id: `s${i}`,
  round_id: 'r0',
  hole_number: (i % 18) + 1,
  shot_number: 2,
  shot_type: 'putting',
  lie_before: 'green',
  club_type: null,
  distance_to_hole_before: 4,
  distance_unit_before: 'feet',
  result: i < 27 ? 'hole' : 'green',
  putt_made: i < 27,
  is_penalty: false,
}));

const liveRead = {
  id: 'read-1',
  player_id: 'player-1',
  insight_type: 'putt_distance',
  signature: 'putt_distance:3_5ft',
  title: '3-5 ft putts',
  lifecycle_state: 'detected',
  dismissed: false,
  evidence: {
    metric: 'putts_made_3_5ft_pct',
    metric_label: '3-5 ft putts',
    unit: 'percent',
    your_value: 62,
    comparison_value: 72,
    sample_n: 95,
    window_end: '2026-10-19',
    source_round_ids: ['r0'],
  },
  metadata: { movement_count: 2 },
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

describe('runCheckpointLifecycle', () => {
  beforeEach(() => {
    flag.on = false;
  });

  it('flag off: no query at all', async () => {
    const { client, calls } = fakeClient({});
    const res = await runCheckpointLifecycle(client as never, { now: NOW });
    expect(res).toMatchObject({ enabled: false, available: false, players: 0 });
    expect(calls).toHaveLength(0);
  });

  it('flag on, table not applied (PGRST205): not available, nothing else read or written', async () => {
    flag.on = true;
    const { client, calls } = fakeClient({
      golf_coachhelm_player_state: { error: { code: 'PGRST205', message: 'missing' } },
    });
    const res = await runCheckpointLifecycle(client as never, { now: NOW });
    expect(res).toMatchObject({ enabled: true, available: false });
    expect(calls.map((c) => c.table)).toEqual(['golf_coachhelm_player_state']);
  });

  it('flag on, another error on the probe throws (the cron logs it)', async () => {
    flag.on = true;
    const { client } = fakeClient({ golf_coachhelm_player_state: { error: { code: '57014', message: 'timeout' } } });
    await expect(runCheckpointLifecycle(client as never, { now: NOW })).rejects.toThrow('timeout');
  });

  it('a player checkpoint rechecks the read, writes evidence.recheck with CAS, and moves the counter', async () => {
    flag.on = true;
    const { client, calls } = fakeClient({
      golf_coachhelm_player_state: [
        {
          player_id: 'player-1',
          last_checkpoint_round_id: 'r3',
          last_checkpoint_at: '2026-10-01T00:00:00Z',
          checkpoint_count: 1,
          rounds_since: 2,
          attempts_since: {},
          updated_at: '2026-10-19T00:00:00Z',
        },
      ],
      golf_coach_insights: [liveRead],
      golf_coachhelm_corrections: { error: { code: '42P01', message: 'relation does not exist' } },
      golf_rounds: [round(0), round(1), round(2), round(3), round(4)],
      golf_shots: putts,
      golf_holes: [],
    });
    const res = await runCheckpointLifecycle(client as never, { now: NOW });
    expect(res).toMatchObject({ enabled: true, available: true, players: 1, corrections_available: false, failed: 0, patches: 1 });
    expect(res.checkpoints.player).toBe(1);
    expect(res.totals).toMatchObject({ rechecked: 1, cleared: 1 });

    const update = calls.find((c) => c.table === 'golf_coach_insights' && c.op === 'update')!;
    const payload = update.payload as { evidence: Record<string, unknown>; metadata: Record<string, unknown> };
    expect(payload.evidence.recheck).toMatchObject({ outcome: 'cleared', recent_n: 30, benchmark: 72, old_value: 62 });
    expect(payload.metadata.movement_count).toBe(2);
    expect(payload.metadata[LIFECYCLE_META_KEY]).toMatchObject({ checkpoints_seen: 1, cleared_at_checkpoint: 1 });
    expect(payload).not.toHaveProperty('status');
    expect(update.filters).toContainEqual(['eq', ['lifecycle_state', 'detected']]);
    expect(update.filters).toContainEqual(['eq', ['updated_at', '2026-10-19T00:00:00Z']]);

    const state = calls.find((c) => c.table === 'golf_coachhelm_player_state' && c.op === 'upsert')!;
    expect(state.payload).toMatchObject({ player_id: 'player-1', last_checkpoint_round_id: 'r0', checkpoint_count: 2, rounds_since: 0 });

    // Rounds are read with the countable filters.
    const roundsCall = calls.find((c) => c.table === 'golf_rounds')!;
    expect(roundsCall.filters).toContainEqual(['eq', ['is_test', false]]);
    expect(roundsCall.filters).toContainEqual(['eq', ['status', 'completed']]);
  });
});
