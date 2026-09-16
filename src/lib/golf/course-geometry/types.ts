/** Stage 0–2 display contracts. No field here is a new player measurement. */
import type { TerrainMesh } from './terrain';
import type { LocalContextZone } from './context-layer';
export type PointM = readonly [number, number];
export type PositionWgs84 = readonly [number, number];
export type Direction8 = 'short' | 'short_left' | 'left' | 'long_left' |
  'long' | 'long_right' | 'right' | 'short_right';
export type SurfaceKind = 'tee' | 'fairway' | 'green' | 'bunker' | 'water' | 'rough' | 'woods';
export type Geometry =
  | { type: 'LineString'; coordinates: PositionWgs84[] }
  | { type: 'Polygon'; coordinates: PositionWgs84[][] }
  | { type: 'MultiPolygon'; coordinates: PositionWgs84[][][] };
export interface GeometryFeature {
  id: string;
  kind: SurfaceKind | 'route';
  sourceIds: string[];
  holeKeys: string[];
  geometryWgs84: Geometry;
  /** Source agreement only; not survey accuracy or completeness. */
  reviewed: boolean;
  accuracyMeters: number | null;
}
export interface PhysicalHole {
  key: string;
  /** Internal source studies may be unassigned to a played hole. */
  displayLabel?: string;
  ordinal: number;
  par: number;
  scorecardYards: number | null;
  featureIds: string[];
  routeFeatureId: string | null;
  greenFeatureId: string | null;
  nominalTargetWgs84: PositionWgs84 | null;
  completeness: 'partial' | 'reviewed_surfaces' | 'route_only';
  gaps: string[];
}
export interface CourseGeometryPackage {
  schemaVersion: 1;
  siteId: string;
  name: string;
  contentHash: string;
  /** This pilot cannot be promoted to a production binding by a page read. */
  status: 'reviewed_draft' | 'source_candidate';
  originWgs84: PositionWgs84;
  projection: 'wgs84-local-enu-v1';
  features: GeometryFeature[];
  holes: PhysicalHole[];
  sources: {
    id: string; provider: string; licenseId: string; url: string;
    capturedAt: string | null; retrievedAt: string; attribution: string;
  }[];
}
export type DistanceUnit = 'yards' | 'feet' | 'meters';
export interface DiagramDistance {
  valueM: number | null;
  basis: 'recorded_before' | 'recorded_remaining' | 'recorded_proximity' | 'legacy_derived_length';
  originalValue: number | null;
  originalUnit: string | null;
  referenceKnown: false;
  estimated: boolean;
}
export interface ShotEvidence {
  eventKey: string;
  shotNumber: number;
  shotType: string | null;
  result: string | null;
  lieBefore: string | null;
  lieAfter: string | null;
  before: DiagramDistance;
  after: DiagramDistance;
  legacyLength: DiagramDistance;
  miss: Direction8 | null;
  rawMiss: string | null;
  putt: { made: boolean | null; break: string | null; slope: string | null; tags: string[] };
  penalty: { type: string | null; nextLie: string | null; nextDistance: DiagramDistance } | null;
  provenance: 'current_entry' | 'persisted_unknown_writer';
  issues: string[];
  /** Original fields retained as evidence, never rewritten by rendering. */
  original: Readonly<Record<string, unknown>>;
}
export interface DiagramEvent {
  evidence: ShotEvidence;
  anchorM: PointM | null;
  placement: 'compatible_estimate' | 'ambiguous' | 'schematic' | 'unknown';
  inferredSurfaceFeatureId: string | null;
  candidateFeatureIds: string[];
  reasons: string[];
  /** Bounded examples of feasible area under a shared, unknown target.
   * The renderer must clip every cell to its canonical source feature.
   * These are not exhaustive boundaries or statistical confidence regions. */
  regions?: {
    featureId: string;
    cells: { centerM: PointM; radiusM: number }[];
    basis: 'sampled_feasible_region';
  }[];
  /** A straight connection between two representatives of ONE retained
   * sequence. It is neither a measured flight nor the legacy shot length. */
  connection?: {
    fromM: PointM;
    toM: PointM;
    /** Planimetric separation, not carry, roll, terrain-adjusted or 3D length. */
    distanceM: number;
    basis: 'inferred_endpoint_separation';
  } | null;
}
export interface LocalFeature {
  id: string;
  kind: GeometryFeature['kind'];
  type: Geometry['type'];
  /** Polygon -> rings; MultiPolygon -> components -> rings. */
  parts: PointM[][][];
  reviewed: boolean;
}
export interface EstimatedPin {
  /** A display hypothesis only. Never an observed or dated cup location. */
  positionM: PointM;
  basis: 'retained_manual_hypothesis' | 'nominal_green_reference';
}

/** A deliberately non-measured path used only by isolated interactive
 * fixtures. It may use recorded lie/result/distance to make a transparent
 * display estimate, but stays separate from `DiagramEvent.connection` so it
 * can never become a recorded flight or persisted player location. */
export interface IllustrativePreviewTrajectory {
  key: string;
  shotNumber: number;
  pointsM: readonly PointM[];
  /** `route_reference` uses the course route's start only as a display
   * origin for the first tee stroke. `compatible_estimate` joins two
   * reviewed, evidence-compatible representatives. */
  anchorBasis?: 'route_reference' | 'compatible_estimate';
  source: 'interactive_preview_fixture' | 'reconstruction_display_estimate';
}
/** A display-only putting position or surface roll for the isolated fixture.
 * These points are calculated from a recorded distance-to-pin against the
 * reviewed green and nominal pin. They are deliberately not shot coordinates,
 * a measured roll, or input to scoring and analytics. */
export interface IllustrativePuttingTrack {
  key: string;
  shotNumber: number;
  kind: 'ball_position' | 'surface_roll';
  pointsM: readonly PointM[];
  source: 'interactive_preview_fixture';
}
export interface HoleScene {
  /** Optional source candidate used only by the expanded terrain feasibility view. */
  terrain?: TerrainMesh;
  /** Supplied analytic coordinates exist only in the local demonstration. */
  overlayKind: 'unresolved' | 'estimated_regions' | 'analytic_fixture';
  packageHash: string;
  physicalHoleKey: string;
  sharedGreenHoleOrdinals?: readonly number[];
  algorithmVersion: 'evidence-only-v1' | 'manual-bounds-v1';
  /** `reference` is a layout point inside the green for the restrained target
   * glyph when no estimate exists (candidate packages). It is never a cup. */
  target: { kind: 'unknown_pin'; greenFeatureId: string | null; estimate?: EstimatedPin; reference?: PointM };
  hole: PhysicalHole;
  features: LocalFeature[];
  /** Neighboring source geometry for landscape context; excluded from shot inference. */
  contextFeatures?: LocalFeature[];
  /** Outside-world zones (paths, structures, woods, water, open land) from the
   * hash-locked context layer; display and orientation only. */
  contextZones?: LocalContextZone[];
  /** Content hash of the context layer the zones came from (artifact gate). */
  contextLayerHash?: string;
  events: DiagramEvent[];
  /** Never supplied by the course compiler or player-record reconstruction. */
  illustrativePreviewTrajectories?: readonly IllustrativePreviewTrajectory[];
  /** Never supplied by the course compiler or player-record reconstruction. */
  illustrativePuttingTracks?: readonly IllustrativePuttingTrack[];
  /** Chosen from physical routing, independent of events and labels. */
  orientationRadians: number;
  attribution: string;
}
