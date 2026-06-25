// =============================================================================
// src/components/lifting/soreness/index.ts
//
// Public barrel for the soreness component system.
// =============================================================================

export { BodySilhouetteFront } from './BodySilhouetteFront';
export type { RegionHitState } from './BodySilhouetteFront';

// Shared severity color helpers (used by silhouettes, slider, badges)
export {
  severityFill,
  severityStroke,
  severityTrackClass,
  severityThumbClass,
  severityTextClass,
  severityBadge,
  SEVERITY_LABELS,
} from './severity-colors';

export { BodySilhouetteBack } from './BodySilhouetteBack';

export { SorenessSeveritySlider } from './SorenessSeveritySlider';

export { SorenessRegionBottomSheet } from './SorenessRegionBottomSheet';
export type { RegionEntry } from './SorenessRegionBottomSheet';

export { SorenessSelectedRegionList } from './SorenessSelectedRegionList';

export { SorenessBodyMap } from './SorenessBodyMap';
export type { SorenessMapState } from './SorenessBodyMap';

export { ReadyToGoButton } from './ReadyToGoButton';

export { SorenessCheckCard } from './SorenessCheckCard';

export { SorenessComplianceBoard } from './SorenessComplianceBoard';

export { HighPrioritySorenessList } from './HighPrioritySorenessList';

export { TeamSorenessHeatmap } from './TeamSorenessHeatmap';

export { SorenessScheduleBuilder } from './SorenessScheduleBuilder';
