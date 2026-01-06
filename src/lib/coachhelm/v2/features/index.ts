/**
 * Feature Extraction Module
 *
 * Exports all feature extraction functions and a combined extractor.
 */

import type { ExtractedFeatures } from '../types';

export { extractTemporalFeatures } from './temporal';
export { extractSequenceFeatures } from './sequence';
export { extractContextualFeatures } from './contextual';

// Re-export for convenience
import { extractTemporalFeatures } from './temporal';
import { extractSequenceFeatures } from './sequence';
import { extractContextualFeatures } from './contextual';

/**
 * Extracts all features for a player
 *
 * @param playerId - The player's UUID
 * @returns All extracted features or null if insufficient data
 */
export async function extractAllFeatures(
  playerId: string
): Promise<ExtractedFeatures | null> {
  // Extract features in parallel where possible
  const [temporalFeatures, sequenceFeatures] = await Promise.all([
    extractTemporalFeatures(playerId),
    extractSequenceFeatures(playerId),
  ]);

  // Contextual features depend on temporal and sequence
  const contextualFeatures = await extractContextualFeatures(
    playerId,
    temporalFeatures,
    sequenceFeatures
  );

  // Need at least temporal features to proceed
  if (!temporalFeatures) {
    return null;
  }

  return {
    playerId,
    extractedAt: new Date().toISOString(),
    temporal: temporalFeatures,
    sequence: sequenceFeatures ?? {
      birdieFollowUpPar: 0,
      birdieFollowUpBirdie: 0,
      birdieFollowUpBogey: 0,
      bogeyFollowUpPar: 0,
      bogeyFollowUpBirdie: 0,
      bogeyFollowUpBogey: 0,
      averageBirdieStreak: 0,
      averageBogeyStreak: 0,
      longestBirdieStreak: 0,
      longestBogeyStreak: 0,
      frontNineAvg: 0,
      backNineAvg: 0,
      frontBackDiff: 0,
      typicalCollapseHole: undefined,
      finishingHolesAvg: 0,
    },
    contextual: contextualFeatures ?? {
      confidenceLevel: 'medium',
      formCycle: 'stable',
      pressureExposure: 0,
      clutchFactor: 1,
      competitiveIndex: 0,
      practiceVsTournament: 0,
    },
  };
}
