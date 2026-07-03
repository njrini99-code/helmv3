/**
 * ============================================================================
 * Fairway · pages/documents — barrel
 * ----------------------------------------------------------------------------
 * The flag-gated redesign of the SHARED coach+player /golf/dashboard/documents
 * route. ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * documents/page.tsx (imported by DIRECT PATH from the page). Renders inside a
 * `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

export {
  FairwayDocuments,
  type FairwayDocumentsProps,
  type FairwayDocument,
} from './FairwayDocuments';
