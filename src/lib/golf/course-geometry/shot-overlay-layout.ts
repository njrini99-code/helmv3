import { checkedAnchor, checkedConnection, checkedRegions } from './quality';
import { inFeature } from './spatial';
import { createSurfaceGuard } from './surface-compatibility';
import type { EstimatedPin, HoleScene, LocalFeature, PointM } from './types';

export interface PreparedShotOverlay {
  regions: { key: string; shotNumber: number; feature: LocalFeature; rings: PointM[][] }[];
  segments: { key: string; shotNumber: number; active: boolean; fromM: PointM; toM: PointM }[];
  anchors: { key: string; pointM: PointM }[];
  badges: { key: string; shotNumber: number; active: boolean; anchorM: PointM }[];
  pin: { positionM: PointM; basis: EstimatedPin['basis']; greenFeatureId: string } | null;
  protectedFeatures: LocalFeature[];
}

export interface ShotOverlayProjection {
  width: number;
  height: number;
  project: (point: PointM) => PointM | null;
  pathForFeature: (feature: LocalFeature) => string | null;
  /** Camera controls and HUD occupy CSS-pixel rectangles. Labels avoid them;
   * geographic anchors and connections keep their physical coordinates. */
  reservedRects?: readonly { x: number; y: number; width: number; height: number }[];
}

export interface ShotOverlayLayout {
  /** clip is the actual candidate surface outline. d can be empty when the
   * sampled cells are too small to show truthfully at the current scale. */
  regions: { key: string; shotNumber: number; featureId: string; clip: string; d: string }[];
  segments: { key: string; shotNumber: number; active: boolean; from: PointM; to: PointM }[];
  anchors: { key: string; point: PointM }[];
  badges: { key: string; shotNumber: number; active: boolean; anchor: PointM; label: PointM }[];
  pin: { position: PointM; label: PointM; basis: EstimatedPin['basis']; glyphScale: number } | null;
}

/** Validate world evidence when the scene or selected event changes. Camera
 * frames reuse these inputs; a new renderer cannot bypass the surface gates. */
export function prepareShotOverlay(scene: HoleScene, selectedShotNumber?: number): PreparedShotOverlay {
  const selected = selectedShotNumber ?? [...scene.events].reverse().find(event => event.regions?.length)?.evidence.shotNumber;
  const anchors = scene.events.flatMap(event => {
    const pointM = checkedAnchor(event, scene.features);
    return pointM ? [{ key: event.evidence.eventKey, pointM }] : [];
  });
  const badges = scene.events.flatMap(event => {
    const anchorM = checkedAnchor(event, scene.features);
    return anchorM ? [{ key: event.evidence.eventKey, shotNumber: event.evidence.shotNumber,
      active: event.evidence.shotNumber === selected, anchorM }] : [];
  }).sort((a, b) => Number(b.active) - Number(a.active));
  const segments = scene.events.flatMap((event, index) => {
    const connection = checkedConnection(event, scene.events[index - 1], scene.features);
    return connection ? [{ key: event.evidence.eventKey, shotNumber: event.evidence.shotNumber,
      active: event.evidence.shotNumber === selected, fromM: connection.fromM, toM: connection.toM }] : [];
  });
  const regions = scene.events.flatMap((event, eventIndex) => event.evidence.shotNumber === selected
    ? checkedRegions(event, scene.features).flatMap((region, regionIndex) => {
      const feature = scene.features.find(candidate => candidate.id === region.featureId && candidate.reviewed);
      if (!feature) return [];
      return [{ key: `${eventIndex}-${regionIndex}`, shotNumber: event.evidence.shotNumber, feature,
        rings: region.cells.slice(0, 96).map(cell => Array.from({ length: 16 }, (_, index): PointM => {
          const angle = index * Math.PI / 8;
          return [cell.centerM[0] + cell.radiusM * Math.cos(angle), cell.centerM[1] + cell.radiusM * Math.sin(angle)];
        })) }];
    }) : []);
  const estimate = scene.target.estimate;
  const green = scene.features.find(feature => feature.id === scene.target.greenFeatureId && feature.kind === 'green' && feature.reviewed);
  const pin = estimate && ['retained_manual_hypothesis', 'nominal_green_reference'].includes(estimate.basis) &&
    estimate.positionM.every(Number.isFinite) && green && inFeature(estimate.positionM, green) &&
    createSurfaceGuard(scene.features).clearance(estimate.positionM, 'green', 1e-6) > 0
    ? { positionM: estimate.positionM, basis: estimate.basis, greenFeatureId: green.id } : null;
  return { regions, segments, anchors, badges, pin,
    protectedFeatures: scene.features.filter(feature => feature.kind === 'green' || feature.kind === 'bunker') };
}

interface ScreenFeature {
  feature: LocalFeature;
  minX: number; maxX: number; minY: number; maxY: number;
}

/** Full box/polygon intersection, including concave edges and cutouts. A
 * few sampled label points can miss a narrow bunker crossing the text box. */
function clearsSurface(point: PointM, halfWidth: number, halfHeight: number, surface: ScreenFeature): boolean {
  const x0 = point[0] - halfWidth, x1 = point[0] + halfWidth;
  const y0 = point[1] - halfHeight, y1 = point[1] + halfHeight;
  if (x1 < surface.minX || x0 > surface.maxX || y1 < surface.minY || y0 > surface.maxY) return true;
  if (([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as PointM[]).some(corner => inFeature(corner, surface.feature))) return false;
  for (const ring of surface.feature.parts.flat()) for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index]!, b = ring[index + 1]!;
    let lo = 0, hi = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const boundaries = [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]];
    let intersects = true;
    for (const [p, q] of boundaries) {
      if (Math.abs(p!) < 1e-9) { if (q! < 0) { intersects = false; break; } }
      else if (p! < 0) lo = Math.max(lo, q! / p!);
      else hi = Math.min(hi, q! / p!);
      if (lo > hi) { intersects = false; break; }
    }
    if (intersects) return false;
  }
  return true;
}

/** Pure camera layout, shared by React SVG and the retained Three overlay.
 * Every physical point uses the supplied camera; labels use CSS pixels. No
 * offscreen anchor is relocated and no small region is enlarged into a dot. */
export function layoutShotOverlay(prepared: PreparedShotOverlay, projection: ShotOverlayProjection): ShotOverlayLayout {
  const { width, height, pathForFeature } = projection;
  const empty: ShotOverlayLayout = { regions: [], segments: [], anchors: [], badges: [], pin: null };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return empty;
  const reserved = (projection.reservedRects ?? []).filter(rect =>
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0);
  const clearsHud = (point: PointM, halfWidth: number, halfHeight: number) => reserved.every(rect =>
    point[0] + halfWidth < rect.x || point[0] - halfWidth > rect.x + rect.width ||
    point[1] + halfHeight < rect.y || point[1] - halfHeight > rect.y + rect.height);
  const project = (point: PointM): PointM | null => {
    const projected = projection.project(point);
    return projected?.every(Number.isFinite) ? projected : null;
  };
  const anchors = prepared.anchors.flatMap(anchor => {
    const point = project(anchor.pointM);
    return point ? [{ key: anchor.key, point }] : [];
  });
  const pin = prepared.pin && project(prepared.pin.positionM);
  const protectedFeatures: ScreenFeature[] = prepared.protectedFeatures.flatMap(feature => {
    const parts = feature.parts.map(part => part.map(ring => ring.map(project)));
    if (parts.flat(2).some(point => point == null)) return [];
    const projected = parts as PointM[][][], points = projected.flat(2);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [{ feature: { ...feature, parts: projected }, minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys) }];
  });
  const pinGreen = protectedFeatures.find(surface => surface.feature.id === prepared.pin?.greenFeatureId);
  const glyphScale = pinGreen && Math.min(pinGreen.maxX - pinGreen.minX, pinGreen.maxY - pinGreen.minY) < 56 ? .8 : 1;
  const labels: PointM[] = [];
  const badges = prepared.badges.flatMap(badge => {
    const anchor = project(badge.anchorM);
    if (!anchor || anchor[0] < 0 || anchor[0] > width || anchor[1] < 0 || anchor[1] > height) return [];
    const candidates: PointM[] = [];
    for (const radius of [24, 40, 56, 72]) for (const angle of [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, 0, Math.PI]) {
      const point: PointM = [anchor[0] + radius * Math.cos(angle), anchor[1] + radius * Math.sin(angle)];
      if (point[0] >= 14 && point[0] <= width - 14 && point[1] >= 14 && point[1] <= height - 14) candidates.push(point);
    }
    const label = candidates.find(point => clearsHud(point, 14, 14) &&
      labels.every(other => Math.hypot(point[0] - other[0], point[1] - other[1]) >= 28) &&
      anchors.every(other => Math.hypot(point[0] - other.point[0], point[1] - other.point[1]) >= 16) &&
      (!pin || Math.hypot(point[0] - pin[0], point[1] - (pin[1] - 10)) >= 26) &&
      protectedFeatures.every(feature => clearsSurface(point, 13, 13, feature)));
    if (!label) return [];
    labels.push(label);
    return [{ key: badge.key, shotNumber: badge.shotNumber, active: badge.active, anchor, label }];
  });
  // A flag can appear only alongside its estimate disclosure. Hiding either
  // preserves its world point; clamping either would claim a different cup.
  const pinOffsets = [[62, -10], [-62, -10], [0, 30], [0, -39], [62, 24], [-62, 24], [0, 52]];
  for (const radius of [48, 64, 80, 104, 128, 152, 176]) for (const angle of [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]) {
    pinOffsets.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  const pinLabel = pin && pin[0] >= 2 && pin[0] <= width - 2 && pin[1] >= 22 * glyphScale && pin[1] <= height - 2 &&
    clearsHud([pin[0] + 5 * glyphScale, pin[1] - 10 * glyphScale], 7 * glyphScale, 11 * glyphScale)
    ? pinOffsets.map(([x, y]): PointM => [pin[0] + x!, pin[1] + y!]).find(point =>
      point[0] >= 46 && point[0] <= width - 46 && point[1] >= 12 && point[1] <= height - 12 && clearsHud(point, 44, 10) &&
      labels.every(other => Math.abs(point[0] - other[0]) > 58 || Math.abs(point[1] - other[1]) > 25) &&
      anchors.every(other => Math.abs(point[0] - other.point[0]) > 49 || Math.abs(point[1] - other.point[1]) > 15) &&
      protectedFeatures.every(feature => clearsSurface(point, 46, 12, feature))) : undefined;
  const regions = prepared.regions.flatMap(region => {
    const clip = pathForFeature(region.feature);
    if (!clip) return [];
    const d = region.rings.flatMap(ring => {
      const projected = ring.map(project);
      if (projected.some(point => point == null)) return [];
      const points = projected as PointM[];
      const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
      if ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) < 24) return [];
      return [points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(3)},${point[1].toFixed(3)}`).join(' ') + ' Z'];
    }).join(' ');
    // The candidate surface remains legible even when individual feasible
    // cells are subpixel. Its canonical outline does not select an endpoint
    // or claim that every point inside the surface satisfies the distances.
    return [{ key: region.key, shotNumber: region.shotNumber, featureId: region.feature.id, clip, d }];
  });
  const segments = prepared.segments.flatMap(segment => {
    const from = project(segment.fromM), to = project(segment.toM);
    return from && to ? [{ key: segment.key, shotNumber: segment.shotNumber, active: segment.active, from, to }] : [];
  });
  return { regions, segments, anchors, badges,
    pin: pin && pinLabel && prepared.pin ? { position: pin, label: pinLabel, basis: prepared.pin.basis, glyphScale } : null };
}
