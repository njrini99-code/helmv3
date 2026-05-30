/**
 * ============================================================================
 * Fairway · pages · rounds — barrel
 * ----------------------------------------------------------------------------
 * The flag-on /golf/dashboard/rounds library surface. Exports ONLY the three
 * components owned by this surface. Sibling files in this directory (the round
 * detail surface) are imported by their own routes via DIRECT PATH and are
 * intentionally NOT re-exported here.
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * rounds/page.tsx.
 * ========================================================================== */

export {
  FairwayRoundsLibrary,
  type FairwayRoundsLibraryProps,
  type RoundLibraryRound,
  type RoundStats,
} from './FairwayRoundsLibrary';
export { FairwayRoundCard, type FairwayRoundCardProps } from './FairwayRoundCard';
export {
  FairwayUnfinishedBanner,
  type FairwayUnfinishedBannerProps,
} from './FairwayUnfinishedBanner';
