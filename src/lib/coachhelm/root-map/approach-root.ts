/**
 * Server-side assembly of the root map's approach context: the loaded rows
 * (`loaders.ts#loadApproachContext`) → the band sizing, the per-band Why
 * evidence and the per-band map input. Pure shaping over rows already read;
 * split from `approach-context.ts` because A2's `computeDistanceProfile`
 * lives in a server module.
 */

import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import { buildDistanceProfileViewModel } from '@/components/golf/coachhelm/game-fingerprint/distance-profile/buildDistanceProfileViewModel';
import { NARROW_BANDS } from '@/lib/coachhelm/v3/engine/context-narrowing';
import {
  buildApproachRootContext,
  contextPathText,
  sizeApproachBands,
  type ApproachRootContext,
} from './approach-context';
import type { ApproachBandInput } from './build-player-root-map';
import { toContextFacts, type ApproachContextLoad } from './loaders';

export interface PlayerApproachRoot {
  context: ApproachRootContext;
  /** Map input per band (see `buildRootMap`'s `approachBands`). */
  bands: Record<string, ApproachBandInput>;
}

export function buildPlayerApproachRoot(load: ApproachContextLoad, playerId: string, now: Date = new Date()): PlayerApproachRoot | null {
  if (load.rounds.length === 0) return null;
  const { facts, holes } = toContextFacts(load);
  const sizing = sizeApproachBands(load.rounds, load.shots, load.holes, load.scale);
  // A2 over exactly the loaded rounds (the loader already bounded them).
  const scope = { player_id: playerId, window_start: null, window_end: null, analysis_cutoff: now.toISOString() };
  const profile = buildDistanceProfileViewModel(computeDistanceProfile(facts, scope, holes));
  const context = buildApproachRootContext({ rounds: load.rounds.length, facts, holes, profile, sizing });

  const bands: Record<string, ApproachBandInput> = {};
  for (const band of NARROW_BANDS) {
    const why = context.why[band];
    let unsizedNote: string | null = null;
    if (!why?.strokesLost) {
      if (!sizing) unsizedNote = 'No stored approach strokes gained on your recent rounds';
      else if (!sizing.reconciled) {
        unsizedNote = 'Not sized: the per-shot split did not match your stored approach strokes gained';
      } else unsizedNote = `Not losing strokes from this range over your last ${sizing.rounds} rounds`;
    }
    bands[band] = {
      strokesLost: why?.strokesLost ?? null,
      path: why ? contextPathText(why.narrowing.path) : null,
      rounds: sizing?.rounds ?? load.rounds.length,
      unsizedNote,
    };
  }
  return { context, bands };
}
