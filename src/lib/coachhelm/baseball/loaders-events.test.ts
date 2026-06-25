/**
 * Event-grain loader correctness — guards that derived metrics compute the right
 * value, the right sign, and degrade honestly (no rows → metric absent).
 */

import { describe, it, expect } from 'vitest';
import {
  loadPitchingEventMetrics,
  loadHittingEventMetrics,
  loadCatchingMetrics,
  loadDefenseMetrics,
  loadBaserunningMetrics,
  type PitchEventRow,
  type CatchingEventRow,
  type FieldingEventRow,
  type BaserunningEventRow,
} from './loaders-events';

describe('pitching event loader', () => {
  it('velo decay is signed late − early (a late drop is NEGATIVE, never inverted)', () => {
    // 9 pitches: early third ~92, late third ~88 → decay ≈ −4.
    const pitches: PitchEventRow[] = Array.from({ length: 9 }, (_, i) => ({
      id: `x${i}`,
      pitcher_id: 'pitcher1',
      pitch_number: i + 1,
      velocity: i < 3 ? 92 : i < 6 ? 90 : 88,
      measured_at: '2026-06-20T00:00:00Z',
    }));
    const m = loadPitchingEventMetrics('pitcher1', pitches).pitcher_velo_inning_decay;
    expect(m).toBeDefined();
    expect(m!.value!).toBeLessThan(0); // velo dropped late → negative signed delta
    expect(m!.value!).toBeCloseTo(-4, 0);
  });

  it('first-pitch strike rate counts only 0-0 pitches', () => {
    const pitches: PitchEventRow[] = [
      { id: '1', pitcher_id: 'p', count_state: '0-0', is_in_zone: true },
      { id: '2', pitcher_id: 'p', count_state: '0-0', is_in_zone: false, is_swing: false, is_called_strike: false, pitch_call: 'ball' },
      { id: '3', pitcher_id: 'p', count_state: '1-1', is_in_zone: true }, // ignored (not 0-0)
    ];
    const m = loadPitchingEventMetrics('p', pitches).pitcher_first_pitch_strike_rate;
    expect(m).toBeDefined();
    expect(m!.sample_n).toBe(2);
    expect(m!.value!).toBeCloseTo(0.5, 5);
  });

  it('no pitches for the pitcher → no metrics (honest absence)', () => {
    expect(Object.keys(loadPitchingEventMetrics('ghost', []))).toHaveLength(0);
  });
});

describe('hitting event loader', () => {
  it('zone-contact rate = 1 − whiff-on-in-zone-swings', () => {
    const pitches: PitchEventRow[] = [
      { id: '1', batter_id: 'b', is_in_zone: true, is_swing: true, is_whiff: false },
      { id: '2', batter_id: 'b', is_in_zone: true, is_swing: true, is_whiff: true },
      { id: '3', batter_id: 'b', is_in_zone: true, is_swing: true, is_whiff: false },
      { id: '4', batter_id: 'b', is_in_zone: true, is_swing: true, is_whiff: false },
    ];
    const m = loadHittingEventMetrics('b', pitches, []).hitter_zone_contact_rate;
    expect(m).toBeDefined();
    expect(m!.value!).toBeCloseTo(0.75, 5); // 1 whiff of 4
  });
});

describe('catching event loader', () => {
  it('block-miss rate uses block events only', () => {
    const rows: CatchingEventRow[] = [
      { id: '1', catcher_id: 'c', event_type: 'block', block_result: 'miss' },
      { id: '2', catcher_id: 'c', event_type: 'block', block_result: 'blocked' },
      { id: '3', catcher_id: 'c', event_type: 'throwdown', throw_accuracy: 'accurate' }, // ignored
    ];
    const m = loadCatchingMetrics('c', rows).catcher_block_miss_rate;
    expect(m).toBeDefined();
    expect(m!.value!).toBeCloseTo(0.5, 5);
  });
});

describe('defense event loader', () => {
  it('error rate counts result=error OR an error_type', () => {
    const rows: FieldingEventRow[] = [
      { id: '1', player_id: 'd', result: 'error', error_type: 'fielding' },
      { id: '2', player_id: 'd', result: 'out' },
      { id: '3', player_id: 'd', result: 'out' },
      { id: '4', player_id: 'd', result: 'out' },
    ];
    const m = loadDefenseMetrics('d', rows).defense_error_cluster_rate;
    expect(m).toBeDefined();
    expect(m!.value!).toBeCloseTo(0.25, 5);
  });
});

describe('baserunning event loader', () => {
  it('out rate counts out + cs results', () => {
    const rows: BaserunningEventRow[] = [
      { id: '1', runner_id: 'r', result: 'out' },
      { id: '2', runner_id: 'r', result: 'cs' },
      { id: '3', runner_id: 'r', result: 'safe' },
      { id: '4', runner_id: 'r', result: 'advanced' },
    ];
    const m = loadBaserunningMetrics('r', rows).baserunning_out_rate;
    expect(m).toBeDefined();
    expect(m!.value!).toBeCloseTo(0.5, 5);
  });
});
