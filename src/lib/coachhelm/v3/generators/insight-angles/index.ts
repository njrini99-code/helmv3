/**
 * The insight-angle generators as one tier-1 batch, behind
 * `coachhelm_insight_angles_v1` (default OFF).
 *
 * The orchestrator calls {@link insightAngleGenerators} at ONE call site.
 * With the flag off it returns no entries, so no angle generator runs at all
 * (no read, no write, no sweep). With it on, the angle generators share one
 * lazy set of reads made for this call (`createAngleLoaders`), never cached
 * across calls. Each generator's `run()` also checks the flag, and with it off
 * returns without reading, writing or sweeping (`angle-generator.ts`).
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { INSIGHT_ANGLES_FLAG } from './angle-data';
import { ApproachMissCompassGenerator } from './approach-miss-compass';
import { ApproachSgGenerator, Par3TeeGenerator } from './approach-sg';
import { BadDayFloorGenerator } from './bad-day-floor';
import { LagLeaveGenerator } from './lag-leave';
import { LieApproachGenerator } from './lie-approach';
import { createAngleLoaders } from './load-angle-data';
import { TeeMissCostGenerator } from './tee-miss-cost';
import { ThreePuttChainGenerator } from './three-putt-chain';
import { UnderReadingGenerator } from './under-reading';

export interface AngleGeneratorEntry {
  name: string;
  fn: () => Promise<unknown>;
}

/** Tier-1 entries for the angle generators; empty while the flag is off. */
export function insightAngleGenerators(playerId: string): AngleGeneratorEntry[] {
  if (!isFlagEnabled(INSIGHT_ANGLES_FLAG)) return [];
  const loaders = createAngleLoaders(playerId);
  return [
    { name: 'v3.angles.lieApproach', fn: () => new LieApproachGenerator(playerId, loaders).run() },
    { name: 'v3.angles.badDayFloor', fn: () => new BadDayFloorGenerator(playerId, loaders).run() },
    { name: 'v3.angles.threePuttChain', fn: () => new ThreePuttChainGenerator(playerId, loaders).run() },
    { name: 'v3.angles.teeMissCost', fn: () => new TeeMissCostGenerator(playerId, loaders).run() },
    { name: 'v3.angles.approachMissCompass', fn: () => new ApproachMissCompassGenerator(playerId, loaders).run() },
    // Slice 5b: counted families (par-3 tee split, SG per approach, lag leave, under-reading).
    { name: 'v3.angles.par3Tee', fn: () => new Par3TeeGenerator(playerId, loaders).run() },
    { name: 'v3.angles.approachSg50to125', fn: () => new ApproachSgGenerator(playerId, loaders, '50_125').run() },
    { name: 'v3.angles.approachSg125to175', fn: () => new ApproachSgGenerator(playerId, loaders, '125_175').run() },
    { name: 'v3.angles.approachSg175plus', fn: () => new ApproachSgGenerator(playerId, loaders, '175_plus').run() },
    { name: 'v3.angles.lagLeave', fn: () => new LagLeaveGenerator(playerId, loaders).run() },
    { name: 'v3.angles.underReading', fn: () => new UnderReadingGenerator(playerId, loaders).run() },
  ];
}
