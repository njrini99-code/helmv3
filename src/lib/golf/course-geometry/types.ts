/** Stage 0–2 display contracts. No field here is a new player measurement. */
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
  ordinal: number;
  par: number;
  scorecardYards: number | null;
  featureIds: string[];
  routeFeatureId: string;
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
  status: 'reviewed_draft';
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
}
export interface LocalFeature {
  id: string;
  kind: GeometryFeature['kind'];
  type: Geometry['type'];
  /** Polygon -> rings; MultiPolygon -> components -> rings. */
  parts: PointM[][][];
  reviewed: boolean;
}
export interface HoleScene {
  /** Supplied analytic coordinates exist only in the local demonstration. */
  overlayKind: 'unresolved' | 'analytic_fixture';
  packageHash: string;
  physicalHoleKey: string;
  algorithmVersion: 'evidence-only-v1';
  target: { kind: 'unknown_pin'; greenFeatureId: string | null };
  hole: PhysicalHole;
  features: LocalFeature[];
  events: DiagramEvent[];
  /** Chosen from physical routing, independent of events and labels. */
  orientationRadians: number;
  attribution: string;
}
