/**
 * Composite coach voice: every rule's compose() ships `coach` copy — the same
 * read in neutral third person, with the same numbers as the player copy.
 * synthesizeForPlayer stores it as evidence.coach_copy (wiring pinned in
 * composite-refusal-sweep.test.ts).
 */

import { describe, it, expect } from 'vitest';
import bunkerMissSide from '@/lib/coachhelm/v3/composite/rules/bunker-miss-side-amplifier';
import closingHoleFatigue from '@/lib/coachhelm/v3/composite/rules/closing-hole-fatigue';
import doublesAfterBogey from '@/lib/coachhelm/v3/composite/rules/doubles-after-bogey';
import flyerLie from '@/lib/coachhelm/v3/composite/rules/flyer-lie-over-the-green';
import front9Starter from '@/lib/coachhelm/v3/composite/rules/front-9-starter';
import lagDistance3Putt from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import pressureDecel from '@/lib/coachhelm/v3/composite/rules/pressure-decel-chain';
import shortApproachGap from '@/lib/coachhelm/v3/composite/rules/short-approach-proximity-gap';
import shortSideScrambling from '@/lib/coachhelm/v3/composite/rules/short-side-scrambling-chain';
import type { CompositeRule } from '@/lib/coachhelm/v3/composite/types';

// Stricter than the generator tests: also catches "yours" / "yourself".
const SECOND_PERSON = /\byou(r|rs|rself|'re|'ll|'ve)?\b/i;

const cases: Array<[string, CompositeRule, Record<string, unknown>]> = [
  ['bunker, proven overlap', bunkerMissSide,
    { sand_save_pct: 38, bias_direction: 'left', same_hole_share: 0.6, sample_n: 12 }],
  ['bunker, unconfirmed overlap', bunkerMissSide,
    { sand_save_pct: 38, bias_direction: 'right', same_hole_share: 0.1, sample_n: 12 }],
  ['closing-hole fatigue', closingHoleFatigue,
    { delta: 0.62, rounds: 8, early_avg: 0.21, late_avg: 0.83 }],
  ['doubles after bogey', doublesAfterBogey,
    { opportunities: 40, compounded: 11, rate: 0.275, rounds: 9 }],
  ['flyer lie', flyerLie, { attempts: 14, avg_proximity_ft: 41, avg_distance_yd: 146 }],
  ['front-9 starter', front9Starter, { delta: 0.55, rounds: 7, opening_avg: 0.9, rest_avg: 0.35 }],
  ['lag → 3-putt', lagDistance3Putt,
    { lag_signature: 'putt_distance:25_plus_ft', lag_value: 4, short_value: 71, three_putt_rate: 0.28, sample_n: 12 }],
  ['pressure decel, 3-5 ft', pressureDecel,
    { pressure_delta: 2.4, short_putt_value: 68, short_putt_signature: 'v3:putt_distance:3_5ft', sample_n: 10 }],
  ['pressure decel, 5-10 ft', pressureDecel,
    { pressure_delta: 1.3, short_putt_value: 41, short_putt_signature: 'v3:putt_distance:5_10ft', sample_n: 10 }],
  ['short approach + scrambling', shortApproachGap,
    { approach_proximity_ft: 31, scramble_pct: 34, sample_n: 20 }],
  ['short-side scrambling, rough', shortSideScrambling,
    { attempts: 18, avg_proximity: 22, rough_pct: 67, bunker_pct: 33 }],
  ['short-side scrambling, bunker', shortSideScrambling,
    { attempts: 12, avg_proximity: 19, rough_pct: 25, bunker_pct: 75 }],
];

describe('composite rules — coach voice', () => {
  it('ships a coach-voice copy with no second person and the same numbers for every rule and branch', () => {
    for (const [name, rule, signals] of cases) {
      const c = rule.compose({ source_insight_ids: ['a', 'b'], signals });
      expect(c.coach, name).toBeDefined();
      expect(c.coach!.title, name).not.toMatch(SECOND_PERSON);
      expect(c.coach!.content, name).not.toMatch(SECOND_PERSON);
      // Same numbers as the player copy: only the voice changes.
      for (const n of c.content.match(/\d+(\.\d+)?%?/g) ?? []) expect(c.coach!.content, name).toContain(n);
    }
  });

  it('covers every registered rule', async () => {
    const { COMPOSITE_RULES } = await import('@/lib/coachhelm/v3/composite/registry');
    const covered = new Set(cases.map(([, rule]) => rule.id));
    for (const rule of COMPOSITE_RULES) expect(covered, rule.id).toContain(rule.id);
  });
});
