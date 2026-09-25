/**
 * Test fixtures: stored insight-angle evidence, one per angle, in the shape
 * the insight-angle generators write to `evidence.detail`.
 */
const ROUND = '8a1f3c2e-1b2c-4d5e-8f90-123456789abc';

const receipts = (samples: Record<string, number>, exclusions: Record<string, number> = {}) => ({
  window: { window_start: '2026-06-01', window_end: '2026-09-01' },
  definition: 'Stroke-play rounds with hole-level shots.',
  samples,
  exclusions,
  examples: [
    { round_id: ROUND, hole_number: 7, date: '2026-08-14', note: 'rough, 160 yd' },
    { round_id: 'not-a-uuid', hole_number: 12, date: null, note: null },
  ],
});

export const lieEvidence = {
  metric: 'approach_rough_lie_penalty',
  detail: {
    angle: 'lie_adjusted_approach',
    cause: 'rough_execution',
    bands: [
      { band: '125_150', label: '125–150 yd', qualifies: true, fairway: { n: 30, gir_pct: 62, proximity_ft: 28 }, rough: { n: 18, gir_pct: 28, proximity_ft: 44 } },
      { band: '150_175', label: '150–175 yd', qualifies: false, fairway: { n: 12, gir_pct: 50, proximity_ft: 33 }, rough: { n: 4, gir_pct: 25, proximity_ft: 50 } },
    ],
    fairway_pct: 48,
    peer_fairway_pct: 57,
    peer_n: 9,
    fairway_holes: 140,
    rough_all_per_18: 5.1,
    receipts: receipts({ rough_approaches_in_tested_bands: 22, rounds: 14 }, { recovery_lies: 3 }),
  },
};

export const floorEvidence = {
  metric: 'round_bad_day_floor',
  detail: {
    angle: 'bad_day_floor',
    median: 4,
    p80: 8,
    bad_mean: 9.5,
    middle_mean: 4.2,
    split: { penalties: 1.8, double_or_worse: 2.4, everything_else: 1.1 },
    rounds: [
      { id: 'r1', date: '2026-06-03', to_par: 3 },
      { id: 'r2', date: '2026-06-10', to_par: 4 },
      { id: 'r3', date: '2026-06-17', to_par: 9 },
      { id: 'r4', date: '2026-06-24', to_par: 5 },
      { id: 'r5', date: '2026-07-01', to_par: 10 },
    ],
    receipts: receipts({ rounds: 5, bad_rounds: 2, middle_rounds: 3 }),
  },
};

export const threePuttEvidence = {
  metric: 'three_putt_chain',
  detail: {
    angle: 'three_putt_autopsy',
    cause: 'long_first_putt',
    pathways: [
      { pathway: 'long_first_putt', label: 'Long first putt', three_putts: 9, share_pct: 60 },
      { pathway: 'short_miss', label: 'Short second putt missed', three_putts: 6, share_pct: 40 },
    ],
    classified: 15,
    pathway_suppressed: 1,
    three_putts: 16,
    exposure: [
      { band: '30_plus', label: '30+ ft', first_putt_missed: 40, leave_recorded: 36, leave_missing: 4, buckets: { lt3: 10, '3_6': 14, '6_10': 8, '10_plus': 4 } },
    ],
    receipts: receipts({ holes: 250, three_putts: 16 }),
  },
};

export const teeMissEvidence = {
  metric: 'tee_miss_next_shot_cost',
  detail: {
    angle: 'miss_cost_compass',
    worse_side: 'right',
    compass: [
      { side: 'left', shots: 20, costed: 18, cost_vs_fairway: 0.21 },
      { side: 'fairway', shots: 70, costed: 70, cost_vs_fairway: 0 },
      { side: 'right', shots: 26, costed: 24, cost_vs_fairway: 0.48 },
    ],
    coverage: { side_recorded: 46, missed: 50, pct: 92 },
    club_chain: [
      { par: 4, club: 'driver', tee_shots: 60, fairway_pct: 51, to_par: 0.4 },
      { par: 4, club: 'non_driver', tee_shots: 20, fairway_pct: 70, to_par: 0.3 },
    ],
    selection_bias_note: 'Non-driver holes are chosen, not random.',
    receipts: receipts({ tee_shots: 116, rounds: 14 }),
  },
};

export const approachMissEvidence = {
  metric: 'approach_miss_recovery_cost',
  detail: {
    angle: 'approach_miss_compass',
    axis: 'depth',
    worse_side: 'short',
    sides: {
      short: { misses: 30, costed: 28, recovery_cost: 0.35, up_and_down_pct: 38 },
      long: { misses: 12, costed: 12, recovery_cost: 0.1, up_and_down_pct: 55 },
      left: { misses: 14, costed: 13, recovery_cost: 0.18, up_and_down_pct: 47 },
      right: { misses: 16, costed: 16, recovery_cost: 0.2, up_and_down_pct: 45 },
    },
    coverage: { side_recorded: 60, missed: 72, pct: 83 },
    receipts: receipts({ missed_greens: 72, rounds: 14 }),
  },
};

export const EXAMPLE_ROUND_ID = ROUND;
