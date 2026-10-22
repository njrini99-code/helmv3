/**
 * Fixtures for the coach-voice test: one aggregate per row, each the input a
 * generator's compose step (or a composite rule's match) received in the
 * existing tests (synthetic data, captured once), plus a few variants that
 * reach the remaining wording branches, keyed by what composes it.
 */
import type { ComposedContent } from '@/lib/coachhelm/v3/engine/types';
import { ApproachMissGenerator } from '@/lib/coachhelm/v3/generators/approach-miss';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';
import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';
import { PuttBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-bias';
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';
import { PuttSlopeBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-slope-bias';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { TeeStrategyGenerator } from '@/lib/coachhelm/v3/generators/tee-strategy';
import { WarmupHoleGenerator } from '@/lib/coachhelm/v3/generators/warmup-hole';
import { composeApproachCompass } from '@/lib/coachhelm/v3/generators/insight-angles/approach-miss-compass';
import { composeSgFamily } from '@/lib/coachhelm/v3/generators/insight-angles/approach-sg';
import { composeBadDayFloor } from '@/lib/coachhelm/v3/generators/insight-angles/bad-day-floor';
import { composeLagLeave } from '@/lib/coachhelm/v3/generators/insight-angles/lag-leave';
import { composeLieApproach } from '@/lib/coachhelm/v3/generators/insight-angles/lie-approach';
import { composeTeeMiss } from '@/lib/coachhelm/v3/generators/insight-angles/tee-miss-cost';
import { composeThreePuttChain } from '@/lib/coachhelm/v3/generators/insight-angles/three-putt-chain';
import { composeUnderReading } from '@/lib/coachhelm/v3/generators/insight-angles/under-reading';
import { COMPOSITE_RULES } from '@/lib/coachhelm/v3/composite/registry';
import rows from './fixtures/coach-copy-aggregates.json';

const P = '00000000-0000-4000-8000-000000000001';

/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are JSON; each composer reads its own aggregate shape */
type Composer = (agg: any) => ComposedContent;

/** Every v3 generator that writes a read, by the key its fixtures carry. */
export const COMPOSERS: Record<string, Composer> = {
  ApproachMiss: (a) => new ApproachMissGenerator(P, a.bucket).composeContent(a),
  CourseMgmt: (a) => new CourseMgmtGenerator(P, a.variant).composeContent(a),
  ParType: (a) => new ParTypeGenerator(P, a.par).composeContent(a),
  PressureGap: (a) => new PressureGapGenerator(P).composeContent(a),
  PuttBias: (a) => new PuttBiasGenerator(P).composeContent(a),
  PuttDistance: (a) => new PuttDistanceGenerator(P, a.bucket).composeContent(a),
  PuttSlopeBias: (a) => new PuttSlopeBiasGenerator(P).composeContent(a),
  Scrambling: (a) => new ScramblingGenerator(P, a.lie).composeContent(a),
  TeeStrategy: (a) => new TeeStrategyGenerator(P).composeContent(a),
  WarmupHole: (a) => new WarmupHoleGenerator(P).composeContent(a),
  composeApproachCompass: (a) => composeApproachCompass(a),
  composeSgFamily: (a) => composeSgFamily(a),
  composeBadDayFloor: (a) => composeBadDayFloor(a),
  composeLagLeave: (a) => composeLagLeave(a),
  composeLieApproach: (a) => composeLieApproach(a),
  composeTeeMiss: (a) => composeTeeMiss(a),
  composeThreePuttChain: (a) => composeThreePuttChain(a),
  composeUnderReading: (a) => composeUnderReading(a),
  // Composite reads (`composite/synthesis.ts`), keyed `composite:<rule id>`.
  ...Object.fromEntries(COMPOSITE_RULES.map((rule) => [`composite:${rule.id}`, (m: any) => rule.compose(m) as ComposedContent])),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CoachCopyFixture {
  /** The composer key (`COMPOSERS`). */
  g: string;
  agg: unknown;
}

export const FIXTURES = rows as CoachCopyFixture[];
