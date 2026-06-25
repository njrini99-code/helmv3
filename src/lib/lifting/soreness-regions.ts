// =============================================================================
// src/lib/lifting/soreness-regions.ts
//
// Central registry of body regions for the Helm Lifting Lab soreness system.
//
// Every surface that touches soreness data — storage rows (helm_lifting_soreness_maps),
// the body-map UI, coach compliance dashboards, and player-profile overlays — resolves
// region identifiers through this file so IDs, labels, and metadata stay consistent.
//
// Usage:
//   import { SORENESS_REGIONS, SORENESS_REGION_IDS } from '@/lib/lifting/soreness-regions';
//   import type { SorenessRegionId, SorenessRegion } from '@/lib/lifting/soreness-regions';
// =============================================================================

/** Anatomical side of the region. */
export type SorenessRegionSide = 'left' | 'right' | 'center';

/** Logical grouping for coach filters and body-map section headers. */
export type SorenessRegionGroup =
  | 'upper_body'
  | 'trunk'
  | 'hips'
  | 'lower_body'
  | 'whole_body';

/** Which body-map views this region appears on. */
export type SorenessRegionView = 'front' | 'back';

/**
 * Pitcher-risk flag. Used by the overuse-detection rules (§13) to surface
 * throwing-arm and spine/hip alerts when severity thresholds are met.
 *
 *   'throwing_arm' — shoulder, elbow, forearm (high concern for pitchers)
 *   'spine_hip'    — lower back, groin (secondary concern)
 */
export type BaseballRiskGroup = 'throwing_arm' | 'spine_hip';

export interface SorenessRegion {
  readonly label: string;
  readonly side: SorenessRegionSide;
  readonly group: SorenessRegionGroup;
  readonly view: readonly SorenessRegionView[];
  /** Present only on pitcher-relevant regions. */
  readonly baseballRiskGroup?: BaseballRiskGroup;
}

// =============================================================================
// Registry — ~29 MVP regions (§7 "Suggested MVP Regions")
//
// Key = SorenessRegionId: lowercase, snake_case, stable string used in DB rows.
// DO NOT rename an existing key — that would orphan historical soreness_maps rows.
// Add new regions by appending to the bottom of each group.
// =============================================================================

export const SORENESS_REGIONS = {
  // ── Upper Body ────────────────────────────────────────────────────────────
  neck: {
    label: 'Neck',
    side: 'center',
    group: 'upper_body',
    view: ['front', 'back'],
  },

  left_shoulder: {
    label: 'Left Shoulder',
    side: 'left',
    group: 'upper_body',
    view: ['front', 'back'],
    baseballRiskGroup: 'throwing_arm', // left-handed pitchers
  },
  right_shoulder: {
    label: 'Right Shoulder',
    side: 'right',
    group: 'upper_body',
    view: ['front', 'back'],
    baseballRiskGroup: 'throwing_arm',
  },

  left_elbow: {
    label: 'Left Elbow',
    side: 'left',
    group: 'upper_body',
    view: ['front'],
    baseballRiskGroup: 'throwing_arm',
  },
  right_elbow: {
    label: 'Right Elbow',
    side: 'right',
    group: 'upper_body',
    view: ['front'],
    baseballRiskGroup: 'throwing_arm',
  },

  left_forearm: {
    label: 'Left Forearm',
    side: 'left',
    group: 'upper_body',
    view: ['front'],
    baseballRiskGroup: 'throwing_arm',
  },
  right_forearm: {
    label: 'Right Forearm',
    side: 'right',
    group: 'upper_body',
    view: ['front'],
    baseballRiskGroup: 'throwing_arm',
  },

  left_wrist_hand: {
    label: 'Left Wrist / Hand',
    side: 'left',
    group: 'upper_body',
    view: ['front'],
  },
  right_wrist_hand: {
    label: 'Right Wrist / Hand',
    side: 'right',
    group: 'upper_body',
    view: ['front'],
  },

  chest: {
    label: 'Chest',
    side: 'center',
    group: 'upper_body',
    view: ['front'],
  },

  // ── Trunk / Back ──────────────────────────────────────────────────────────
  upper_back: {
    label: 'Upper Back',
    side: 'center',
    group: 'trunk',
    view: ['back'],
  },
  mid_back: {
    label: 'Mid Back',
    side: 'center',
    group: 'trunk',
    view: ['back'],
  },
  lower_back: {
    label: 'Lower Back',
    side: 'center',
    group: 'trunk',
    view: ['back'],
    baseballRiskGroup: 'spine_hip',
  },

  // ── Core / Hips ───────────────────────────────────────────────────────────
  abs_core: {
    label: 'Abs / Core',
    side: 'center',
    group: 'hips',
    view: ['front'],
  },

  left_hip: {
    label: 'Left Hip',
    side: 'left',
    group: 'hips',
    view: ['front', 'back'],
  },
  right_hip: {
    label: 'Right Hip',
    side: 'right',
    group: 'hips',
    view: ['front', 'back'],
  },

  groin: {
    label: 'Groin',
    side: 'center',
    group: 'hips',
    view: ['front'],
    baseballRiskGroup: 'spine_hip',
  },

  left_glute: {
    label: 'Left Glute',
    side: 'left',
    group: 'hips',
    view: ['back'],
  },
  right_glute: {
    label: 'Right Glute',
    side: 'right',
    group: 'hips',
    view: ['back'],
  },

  // ── Lower Body ────────────────────────────────────────────────────────────
  left_quad: {
    label: 'Left Quad',
    side: 'left',
    group: 'lower_body',
    view: ['front'],
  },
  right_quad: {
    label: 'Right Quad',
    side: 'right',
    group: 'lower_body',
    view: ['front'],
  },

  left_hamstring: {
    label: 'Left Hamstring',
    side: 'left',
    group: 'lower_body',
    view: ['back'],
  },
  right_hamstring: {
    label: 'Right Hamstring',
    side: 'right',
    group: 'lower_body',
    view: ['back'],
  },

  left_knee: {
    label: 'Left Knee',
    side: 'left',
    group: 'lower_body',
    view: ['front'],
  },
  right_knee: {
    label: 'Right Knee',
    side: 'right',
    group: 'lower_body',
    view: ['front'],
  },

  left_calf: {
    label: 'Left Calf',
    side: 'left',
    group: 'lower_body',
    view: ['back'],
  },
  right_calf: {
    label: 'Right Calf',
    side: 'right',
    group: 'lower_body',
    view: ['back'],
  },

  left_ankle_foot: {
    label: 'Left Ankle / Foot',
    side: 'left',
    group: 'lower_body',
    view: ['front', 'back'],
  },
  right_ankle_foot: {
    label: 'Right Ankle / Foot',
    side: 'right',
    group: 'lower_body',
    view: ['front', 'back'],
  },

  // ── Whole Body ────────────────────────────────────────────────────────────
  /**
   * General / systemic fatigue — not tied to a specific anatomical site.
   * Accepts player reports like "I feel beat up everywhere" or post-travel
   * tiredness. No baseballRiskGroup: this region is not lateralised and
   * does not trigger throwing-arm or spine-hip overuse alerts.
   */
  general_fatigue: {
    label: 'General Fatigue',
    side: 'center',
    group: 'whole_body',
    view: ['front'],
  },
} as const satisfies Record<string, SorenessRegion>;

// =============================================================================
// Derived types & helpers
// =============================================================================

/** Union of every valid soreness region ID string. */
export type SorenessRegionId = keyof typeof SORENESS_REGIONS;

/** Flat array of all region IDs — useful for validation and iteration. */
export const SORENESS_REGION_IDS: readonly SorenessRegionId[] = Object.keys(
  SORENESS_REGIONS,
) as SorenessRegionId[];

/**
 * Returns true if a string is a valid SorenessRegionId.
 * Use for validating incoming DB values or form submissions.
 */
export function isSorenessRegionId(value: string): value is SorenessRegionId {
  return value in SORENESS_REGIONS;
}

/**
 * All regions visible on the given body-map view (front or back).
 * Useful for rendering only the relevant overlays.
 */
export function regionsForView(
  view: SorenessRegionView,
): Array<{ id: SorenessRegionId; region: SorenessRegion }> {
  return SORENESS_REGION_IDS.filter((id) =>
    (SORENESS_REGIONS[id].view as readonly string[]).includes(view),
  ).map((id) => ({ id, region: SORENESS_REGIONS[id] }));
}

/**
 * All regions that belong to a given baseball risk group.
 * Used by the overuse-detection engine and the coach alert summary.
 */
export function regionsForBaseballRiskGroup(
  riskGroup: BaseballRiskGroup,
): SorenessRegionId[] {
  return SORENESS_REGION_IDS.filter(
    // `as const` narrows members without baseballRiskGroup to a shape lacking the
    // key; the value still satisfies SorenessRegion, so read it through that type.
    (id) => (SORENESS_REGIONS[id] as SorenessRegion).baseballRiskGroup === riskGroup,
  );
}
