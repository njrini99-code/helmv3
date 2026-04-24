/**
 * Shot Analysis Module
 *
 * Deep shot-level analytics for the CoachHelm engine including:
 * - Shot-level strokes gained calculation
 * - Yardage performance curves and dead zone detection
 * - Shot sequence / resilience analysis
 * - Scoring opportunity conversion and scramble rates
 */

export {
  calculateShotSG,
  buildDefaultBaseline,
  analyzeShotsByContext,
  rankWeaknessContexts,
} from './shot-level-sg';

export type {
  ShotData,
  SGBaseline,
  ShotContextAnalysis,
} from './shot-level-sg';

export {
  buildYardageCurve,
  findDeadZones,
  compareYardageCurves,
} from './yardage-curves';

export type {
  YardageBucket,
  YardageCurve,
  DeadZone,
} from './yardage-curves';

export {
  analyzeSequenceEffects,
  calculateResilienceScore,
  detectCompoundingPatterns,
} from './sequence-analysis';

export type {
  SequenceAnalysis,
  CompoundingPattern,
} from './sequence-analysis';

export {
  identifyScoringOpportunities,
  calculateConversionRate,
  calculateScrambleRate,
} from './scoring-opportunities';

export type {
  ScoringOpportunity,
  ScrambleAnalysis,
} from './scoring-opportunities';

export {
  formatLie,
  formatDistanceRange,
  formatShotContext,
} from './format';

export type { ShotLie } from './format';
