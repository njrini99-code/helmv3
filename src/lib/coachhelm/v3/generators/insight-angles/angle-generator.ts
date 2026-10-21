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
 * - Slice 0b judges a read against `FAMILY_FLOORS` by family key. The
 *   angles' insight types (`tee`, `putting`, ...) are shared with other
 *   generators and two angles are both `tee`, so each angle reads under its
 *   own key, `angle:<family>` (`ANGLE_FAMILIES`). No 0b floor carries that
 *   key: the angle's own floors (`ANGLE_FAMILIES`, applied in compute) hold
 *   it back instead, never another family's.
 */
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type { ComposedContent, GeneratorAggregate, RunResult } from '@/lib/coachhelm/v3/engine/types';
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';
import { INSIGHT_ANGLES_FLAG, type AngleData, type PeerRound, type TourThreePutt } from './angle-data';

/** The Slice 0b family key an angle read is stamped and judged under. */
export function angleReadFamilyKey(composed: Pick<ComposedContent, 'evidence'>, fallback: string): string {
  const family = (composed.evidence?.detail as { family?: unknown } | undefined)?.family;
  return typeof family === 'string' && family ? `angle:${family}` : `angle:${fallback}`;
}

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

  protected override readFamilyKey(composed: ComposedContent): string {
    return angleReadFamilyKey(composed, this.insightType);
  }

  override async run(): Promise<RunResult> {
    if (!isCoachHelmFlagEnabled(INSIGHT_ANGLES_FLAG)) return { id: null, gated: true, status: 'gated', retracted: 0 };
    return super.run();
  }
}
