/**
 * Shared base for the insight-angle generators.
 *
 * - The flag `coachhelm_insight_angles_v1` is checked in `run()` itself. With
 *   it off, `run()` is a no-op: no read, no write and NO scope sweep. (The
 *   base's `isEnabled() === false` path archives every active row in scope,
 *   which is right for a team toggle but wrong for a release flag: turning
 *   the flag off must not retract anything by itself.)
 * - The reads are injected (`AngleLoaders`), one lazy load per
 *   `insightAngleGenerators(playerId)` call, shared by the five generators of
 *   that call and never cached across calls.
 */
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type { GeneratorAggregate, RunResult } from '@/lib/coachhelm/v3/engine/types';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { INSIGHT_ANGLES_FLAG, type AngleData, type PeerRound, type TourThreePutt } from './angle-data';

export interface AngleLoaders {
  /** The player's countable-round read (rejects on a read error). */
  data(): Promise<AngleData>;
  /** Every countable round on a team, for the team benchmarks. */
  teamRounds(teamId: string): Promise<PeerRound[]>;
  /** The Tour three-putt figure for the player's tour, or null when none is stored. */
  tourThreePutt(): Promise<TourThreePutt | null>;
}

export abstract class AngleGenerator<A extends GeneratorAggregate> extends BaseGenerator<A> {
  constructor(
    playerId: string,
    protected readonly loaders: AngleLoaders,
  ) {
    super(playerId);
  }

  override async run(): Promise<RunResult> {
    if (!isFlagEnabled(INSIGHT_ANGLES_FLAG)) return { id: null, gated: true, status: 'gated', retracted: 0 };
    return super.run();
  }
}
