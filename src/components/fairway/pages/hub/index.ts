/**
 * ============================================================================
 * Fairway · pages/hub — barrel
 * ----------------------------------------------------------------------------
 * Redesigned /golf/dashboard/hub page composition (PLAYER role). ADDITIVE +
 * GATED: consumed only behind `isRedesignEnabled()` via a thin flag fork in the
 * route. Hub-only — no contention with other page barrels.
 * ========================================================================== */

export {
  FairwayPlayerHub,
  FairwayPlayerHubWrapper,
  type FairwayPlayerHubProps,
  type FairwayPlayerHubWrapperProps,
} from './FairwayPlayerHub';
