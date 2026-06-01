/**
 * ============================================================================
 * Fairway · player-game — barrel
 * ----------------------------------------------------------------------------
 * The player profile / game surfaces re-skinned behind the redesign flag:
 *   • FairwayMyGameProfile          → /dashboard/my-game-profile (player genome)
 *   • FairwayGolfClasses            → /dashboard/classes (academic schedule)
 *   • FairwayPlayerGameFingerprint  → /dashboard/players/[id]/game (coach scout)
 *
 * ADDITIVE — consumed only behind isRedesignEnabled() forks in the route pages.
 * ========================================================================== */

export {
  FairwayMyGameProfile,
  type FairwayMyGameProfileProps,
  type GameProfileAxis,
  type GameProfileDimensionCell,
  type GameProfilePersonaEntry,
} from './FairwayMyGameProfile';

export {
  FairwayGolfClasses,
  type FairwayGolfClassesProps,
  type FairwayPlayerClass,
} from './FairwayGolfClasses';

export {
  FairwayPlayerGameFingerprint,
  type FairwayPlayerGameFingerprintProps,
} from './FairwayPlayerGameFingerprint';
