// =============================================================================
// src/components/baseball/source-trust/index.ts
//
// Public surface of the Source Trust System (V5 System 2). Fan-out surfaces
// (stat rows, import rows, signals, AI cards) import EVERYTHING they need from
// here — the badge, the drawer, the shared prop/types contract, and the helpers
// that turn a `SourcedRecord`/raw row into a render-ready `SourceTrust`.
//
// OWNED BY THE SOURCE-TRUST FOUNDATION PACKET.
// =============================================================================

export { SourceTrustBadge } from './SourceTrustBadge';
export { SourceDrawer } from './SourceDrawer';

export {
  getTrustPresentation,
  resolveTrustLevel,
  formatConfidence,
  type TrustPresentation,
  type TrustIconKey,
} from './trust-presentation';

export {
  buildSourceTrust,
  trustFromSourcedRecord,
} from './build-source-trust';

export {
  mapStampedTrustToTrustLevel,
  matchTierLabel,
  buildStampedSourceTrust,
  buildImportProvenance,
  STAMPED_PROVENANCE_COLUMNS,
  type StampedStatProvenance,
} from './stamped-trust';

export type {
  // canonical model (re-exported from @/lib/baseball/source-record)
  SourceKind,
  SourceRef,
  CaptureMode,
  SourceBadge,
  // trust system contract
  TrustLevel,
  SourceTrust,
  SourceProvenance,
  SourceRelatedObject,
  SourceAuditEntry,
  SourceTrustBadgeProps,
  SourceDrawerProps,
} from './source-trust-types';
