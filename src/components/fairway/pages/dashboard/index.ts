/**
 * ============================================================================
 * Fairway · pages/dashboard — barrel
 * ----------------------------------------------------------------------------
 * Redesigned /golf/dashboard page compositions (role-split). ADDITIVE + GATED:
 * consumed only behind `isRedesignEnabled()` via a thin flag fork in the route.
 * ========================================================================== */

export {
  FairwayPlayerDashboard,
  type PlayerDashboardData,
} from './FairwayPlayerDashboard';
