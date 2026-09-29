import type { IntelTourRefs } from '../types';

/** A payload with no tour row: every visual draws without a tour mark. */
export const NO_REFS: IntelTourRefs = { puttMake: {}, proximity: {}, scrambling: {}, girPct: null };

/** The 2024 PGA rows of golf_pga_standards, for tests that draw tour marks. */
export const PGA_REFS: IntelTourRefs = {
  puttMake: { '3_5': 90.5, '5_10': 62.2, '10_15': 35.7, '15_25': 15.4, '25_plus': 5.5 },
  proximity: { '50_125': 18, '125_175': 30, '175_plus': 45 },
  scrambling: { fairway: 65, rough: 58, sand: 50 },
  girPct: 66,
};
