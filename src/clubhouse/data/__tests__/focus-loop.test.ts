import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm chs-11's loader: with `coachhelm_verdicts_v1` off it reads nothing and the focus areas are as before; on, it reads the
 * prescription columns, counts the live progress of an area still short of its horizon as the verdict step counts it, and a
 * database without the columns answers no loops without a log line.
 */

vi.mock('server-only', () => ({}));
const log = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: log }));
const m = vi.hoisted(() => ({ flag: true, rounds: vi.fn(), putts: vi.fn(), cache: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (k: string) => k === 'coachhelm_verdicts_v1' && m.flag }));
vi.mock('@/lib/coachhelm/v3/verdicts/verdict-job', () => ({
  loadRounds: (...a: unknown[]) => m.rounds(...a),
  loadPutts: (...a: unknown[]) => m.putts(...a),
  loadCache: (...a: unknown[]) => m.cache(...a),
}));

import { loadFocusLoops } from '../focus-loop';

type Answer = { data?: unknown; error?: unknown };
const fake = (answer: Answer) => {
  const reads: string[] = [];
  const chain: object = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...answer }).then(ok);
        return () => chain;
      },
    },
  );
  return { client: { from: (t: string) => (reads.push(t), chain) } as never, reads };
};

const area = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  title: 'Mid-range putts',
  from_insight_id: null,
  target_metric: 'putts_made_5_10ft_pct',
  baseline_value: 0.58,
  baseline_n: 31,
  criterion: { direction: 'higher', threshold: 0.7, unit: 'pct' },
  horizon: { attempts: 40 },
  verdict: null,
  started_at: '2026-10-01T00:00:00Z',
  ...over,
});
const NOW = '2026-10-21T12:00:00Z';

beforeEach(() => {
  m.flag = true;
  log.mockReset();
  m.rounds.mockReset().mockResolvedValue([
    { id: 'r1', player_id: 'p1', round_date: '2026-10-03' },
    { id: 'r2', player_id: 'p1', round_date: '2026-10-10' },
    { id: 'r0', player_id: 'p1', round_date: '2026-09-20' },
  ]);
  m.putts.mockReset().mockResolvedValue([
    ...Array.from({ length: 12 }, (_, i) => ({ round_id: 'r1', distance_to_hole_before: 7, result: i < 8 ? 'hole' : 'green', putt_made: null })),
    ...Array.from({ length: 10 }, (_, i) => ({ round_id: 'r2', distance_to_hole_before: 8, result: i < 7 ? 'hole' : 'green', putt_made: null })),
    { round_id: 'r2', distance_to_hole_before: 30, result: 'hole', putt_made: null },
  ]);
  m.cache.mockReset().mockResolvedValue([]);
});

describe('loadFocusLoops', () => {
  it('reads nothing with the flag off, or with no areas', async () => {
    m.flag = false;
    const off = fake({ data: [area()] });
    expect((await loadFocusLoops(off.client, 'p1', ['f1'], { role: 'player' }, NOW)).size).toBe(0);
    expect(off.reads).toEqual([]);
    m.flag = true;
    const none = fake({ data: [] });
    expect((await loadFocusLoops(none.client, 'p1', [], { role: 'player' }, NOW)).size).toBe(0);
    expect(none.reads).toEqual([]);
    expect(m.rounds).not.toHaveBeenCalled();
  });

  it('counts an open area’s progress live, from its start, in its band', async () => {
    const f = fake({ data: [area()] });
    const loops = await loadFocusLoops(f.client, 'p1', ['f1'], { role: 'player' }, NOW);
    expect(loops.get('f1')).toEqual({ word: 'Too early', tone: 'plain', line: null, target: '70% or better over 40 putts', progress: '22 of 40 putts in · 68% so far' });
    expect(m.rounds).toHaveBeenCalledWith(f.client, ['p1'], '2026-10-01');
  });

  it('draws a stored verdict without counting, and no loop for an area with no prescription', async () => {
    const stored = {
      word: 'did_not_move',
      post: { value: 0.6, made: 24, n: 40, window_start: '2026-09-01', window_end: '2026-10-17' },
      lower_bound_90: 0.501,
      upper_bound_90: 0.699,
      bound_method: 'normal',
      expected_without_coaching: 0.635,
      threshold: 0.7,
      horizon: { attempts: 40 },
      computed_at: '2026-10-19T06:00:00Z',
    };
    const f = fake({ data: [area({ verdict: stored }), area({ id: 'f2', criterion: null, horizon: null })] });
    const loops = await loadFocusLoops(f.client, 'p1', ['f1', 'f2'], { role: 'coach', first: 'Jonah' }, NOW);
    expect(loops.get('f1')?.word).toBe('Did not move');
    expect(loops.has('f2')).toBe(false);
    expect(m.rounds).not.toHaveBeenCalled();
  });

  it('a database without the prescription columns answers no loops, quietly; another failure is logged', async () => {
    expect((await loadFocusLoops(fake({ error: { code: '42703', message: 'column criterion does not exist' } }).client, 'p1', ['f1'], { role: 'player' }, NOW)).size).toBe(0);
    expect(log).not.toHaveBeenCalled();
    expect((await loadFocusLoops(fake({ error: { code: '500', message: 'down' } }).client, 'p1', ['f1'], { role: 'player' }, NOW)).size).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('a count that did not load leaves the progress line out, not the loop', async () => {
    m.putts.mockResolvedValue(null);
    const loops = await loadFocusLoops(fake({ data: [area()] }).client, 'p1', ['f1'], { role: 'player' }, NOW);
    expect(loops.get('f1')).toMatchObject({ word: 'Too early', progress: null });
  });
});
