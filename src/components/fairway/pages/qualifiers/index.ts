/**
 * ============================================================================
 * Fairway · pages · qualifiers — barrel (qualifier DETAIL surfaces)
 * ----------------------------------------------------------------------------
 * Exports ONLY the redesigned Qualifier Detail surfaces:
 *
 *   FairwayQualifierDetail       — the role-forked qualifier detail page
 *   FairwayQualifierLeaderboard  — the matte live-standings hero (reuses the
 *                                  useQualifierRealtime hook verbatim)
 *
 * NOTE: `FairwayQualifiers` (the qualifiers LIST surface) is intentionally NOT
 * re-exported here — it is owned by a separate agent in this same directory and
 * is consumed via a direct-path import, not this barrel.
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * `[id]/page.tsx`. Renders inside the `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

export { FairwayQualifierDetail } from './FairwayQualifierDetail';
export type { FairwayQualifierDetailProps } from './FairwayQualifierDetail';

export { FairwayQualifierLeaderboard } from './FairwayQualifierLeaderboard';
