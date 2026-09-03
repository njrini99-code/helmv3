/**
 * Bridge Premium — shared visual vocabulary (Phase 1 of
 * docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md).
 *
 * Every later phase (Overview Command Deck, core triage tabs, app lenses,
 * Engineering OS views) imports its posture pills, evidence coverage,
 * release relationships, confidence display, episode timelines and the
 * "unknown" treatment from HERE — one implementation per concept, matching
 * the brief's own "one intelligence layer, many lenses" architecture (§5).
 * Do not re-implement any of these inline in a page component.
 */

export { UnknownValue, UnknownInline, type UnknownValueProps } from './UnknownValue';
export {
  PosturePill,
  ReleaseWatchPosturePill,
  RELEASE_WATCH_POSTURE_TONE,
  type BridgePostureTone,
  type PosturePillProps,
} from './PosturePill';
export {
  EvidenceSourceChips,
  SourceConfidenceRing,
  type EvidenceSourceChipsProps,
  type SourceConfidenceRingProps,
} from './EvidenceSourceChips';
export { ReleaseRelationshipLabel, type ReleaseRelationshipLabelProps } from './ReleaseRelationshipLabel';
export { ConfidenceMeter, type ConfidenceMeterProps } from './ConfidenceMeter';
export { EpisodeTimelineStrip, type EpisodeTimelineStripProps } from './EpisodeTimelineStrip';
export {
  EvidenceInspector,
  type EvidenceInspectorData,
  type EvidenceInspectorProps,
} from './EvidenceInspector';
