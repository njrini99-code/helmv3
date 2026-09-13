import source from './cacapon.json';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { normalizeLiveShot } from '@/lib/golf/course-geometry/normalize';
import { inFeature } from '@/lib/golf/course-geometry/spatial';
import type { ShotRecord } from '@/lib/types/golf';
import type { Direction8, HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';

export const pilotPackage = parseGeometryPackage(source);
/** Synthetic ledger, never production player data. The numeric evidence does
 * not prove any endpoint on the pilot course, so all physical anchors stay null. */
export const pilotShots: ShotRecord[] = [
  { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
    distanceToHoleBefore: 383, distanceUnitBefore: 'yards', result: 'fairway',
    distanceToHoleAfter: 148, distanceUnitAfter: 'yards', shotDistance: 235, isPenalty: false },
  { shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
    distanceToHoleBefore: 148, distanceUnitBefore: 'yards', result: 'sand',
    distanceToHoleAfter: 18, distanceUnitAfter: 'yards', shotDistance: 135, isPenalty: false,
    approachMissDirection: 'short_left', missDirection: 'short_left' },
];
export function pilotScene(holeKey = 'cacapon-01', includeEvents = true) {
  return buildHoleScene(pilotPackage, holeKey, includeEvents ? pilotShots.map(normalizeLiveShot) : []);
}

/** Presentation fixture with explicitly supplied test coordinates. These are
 * NOT the output of reconstructing player entries. Ordinary pilotScene may
 * show possible regions but keeps exact endpoints unresolved. This fixture
 * demonstrates marker styling/containment against a nominal green reference. */
export function illustrativeScene() {
  // Replacing a ledger must not retain a pin hypothesis solved from the old one.
  const scene = pilotScene('cacapon-07', false);
  scene.overlayKind = 'analytic_fixture';
  const fixtures = [
    { feature: 'osm-way-885719202', point: [139.3914878419688, 524.840140060172] as const, before: 431, after: 158, miss: undefined },
    { feature: 'osm-way-885719199', point: [178.12531033169677, 398.3275348976763] as const, before: 158, after: 17, miss: 'short_right' as const },
  ];
  scene.events = fixtures.map((fixture, i) => ({
    evidence: normalizeLiveShot({ ...pilotShots[i]!, distanceToHoleBefore: fixture.before, distanceToHoleAfter: fixture.after,
      missDirection: fixture.miss, approachMissDirection: fixture.miss }),
    anchorM: fixture.point, placement: 'compatible_estimate', inferredSurfaceFeatureId: fixture.feature,
    candidateFeatureIds: [fixture.feature], reasons: ['analytic_fixture_only_not_a_reconstruction'],
  }));
  return scene;
}

/**
 * The static phone fixture intentionally has no GPS/player location write
 * path. It can still show a useful, plainly labelled estimated trace: the
 * route supplies the along-hole position from the recorded remaining distance
 * and the selected surface/miss direction supplies a deterministic display
 * endpoint. These points never enter the shot ledger or spatial sidecar.
 */
const yardsToMeters = (yards: number) => yards * 0.9144;
const feetToMeters = (feet: number) => feet * 0.3048;
const distance = (a: PointM, b: PointM) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const add = (a: PointM, b: PointM, scale = 1): PointM => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const subtract = (a: PointM, b: PointM): PointM => [a[0] - b[0], a[1] - b[1]];
const dot = (a: PointM, b: PointM) => a[0] * b[0] + a[1] * b[1];
function unit(vector: PointM): PointM {
  const length = Math.hypot(vector[0], vector[1]);
  return length > 1e-6 ? [vector[0] / length, vector[1] / length] : [0, 1];
}

interface RouteStation { point: PointM; towardHole: PointM }

function routeStation(route: readonly PointM[], distanceFromHoleM: number): RouteStation {
  let remaining = Math.max(0, distanceFromHoleM);
  for (let index = route.length - 1; index > 0; index--) {
    const from = route[index - 1]!, to = route[index]!;
    const length = distance(from, to);
    if (remaining <= length || index === 1) {
      const progress = length > 1e-6 ? Math.max(0, 1 - remaining / length) : 1;
      return { point: add(from, subtract(to, from), progress), towardHole: unit(subtract(to, from)) };
    }
    remaining -= length;
  }
  return { point: route[0]!, towardHole: unit(subtract(route[1] ?? route[0]!, route[0]!)) };
}

function featureSamples(feature: LocalFeature, divisions = 14): PointM[] {
  if (feature.type === 'LineString') return [];
  const samples: PointM[] = [];
  for (const rings of feature.parts) {
    const outer = rings[0];
    if (!outer?.length) continue;
    const xs = outer.map(point => point[0]), ys = outer.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
      const point: PointM = [minX + (x + .5) * (maxX - minX) / divisions, minY + (y + .5) * (maxY - minY) / divisions];
      if (inFeature(point, feature)) samples.push(point);
    }
  }
  return samples;
}

function directionScore(point: PointM, desired: PointM, towardHole: PointM, miss: Direction8 | null): number {
  const delta = subtract(point, desired), left: PointM = [-towardHole[1], towardHole[0]];
  const lateral = dot(delta, left), along = dot(delta, towardHole);
  const wantsLeft = miss?.includes('left'), wantsRight = miss?.includes('right');
  const wantsShort = miss?.startsWith('short'), wantsLong = miss?.startsWith('long');
  const opposite = (wantsLeft && lateral < 0) || (wantsRight && lateral > 0) ||
    (wantsShort && along > 0) || (wantsLong && along < 0);
  return dot(delta, delta) + (opposite ? 10_000 : 0);
}

function selectedSurfacePoint(scene: HoleScene, kind: LocalFeature['kind'], desired: PointM,
  towardHole: PointM, miss: Direction8 | null): PointM | null {
  const samples = scene.features.filter(feature => feature.kind === kind).flatMap(feature => featureSamples(feature));
  return samples.length ? samples.reduce((best, candidate) =>
    directionScore(candidate, desired, towardHole, miss) < directionScore(best, desired, towardHole, miss) ? candidate : best) : null;
}

function remainingMeters(shot: ShotRecord): number {
  return shot.distanceUnitAfter === 'feet' ? feetToMeters(shot.distanceToHoleAfter) : yardsToMeters(shot.distanceToHoleAfter);
}

function endpointForShot(scene: HoleScene, route: readonly PointM[], shot: ShotRecord): RouteStation {
  const station = routeStation(route, remainingMeters(shot));
  const target = route.at(-1)!;
  if (shot.result === 'hole') return { point: target, towardHole: station.towardHole };
  if (shot.result === 'fairway') return station;
  const kind = shot.result === 'sand' ? 'bunker' : shot.result === 'green' ? 'green' : shot.result === 'rough' ? 'rough' : null;
  if (kind === 'green') {
    // Proximity describes a radius around the cup, not a bearing. Start on the
    // approach side until the golfer logs a direction or marks the ball.
    const radius = remainingMeters(shot);
    const lateral: PointM = [-station.towardHole[1], station.towardHole[0]];
    const signed = shot.missDirection?.includes('right') ? -1 : shot.missDirection?.includes('left') ? 1 : 0;
    const desired = add(add(target, station.towardHole, -radius * (signed ? .45 : 1)), lateral, radius * signed * .9);
    const surface = selectedSurfacePoint(scene, kind, desired, station.towardHole, normalizeLiveShot(shot).miss);
    return { point: surface ?? desired, towardHole: station.towardHole };
  }
  if (kind) {
    const surface = selectedSurfacePoint(scene, kind, station.point, station.towardHole, normalizeLiveShot(shot).miss);
    if (surface) return { point: surface, towardHole: station.towardHole };
  }
  // Partial source geometry commonly lacks rough. Preserve the recorded side
  // without pretending that the fallback is a mapped feature.
  const miss = normalizeLiveShot(shot).miss;
  const left: PointM = [-station.towardHole[1], station.towardHole[0]];
  const offset = miss?.includes('right') ? -14 : miss?.includes('left') ? 14 : shot.shotNumber % 2 ? 8 : -8;
  return { point: add(station.point, left, offset), towardHole: station.towardHole };
}

function flightCurve(from: PointM, to: PointM, shot: ShotRecord): PointM[] {
  const chord = subtract(to, from), length = Math.hypot(chord[0], chord[1]);
  if (length < .01) return [from, to];
  const normal = unit([-chord[1], chord[0]]);
  const direction = shot.missDirection ?? '';
  const sign = direction.includes('right') ? -1 : direction.includes('left') ? 1 : shot.shotNumber % 2 ? 1 : -1;
  const control = add(add(from, chord, .5), normal, sign * Math.min(12, length * .08));
  return Array.from({ length: 7 }, (_, index) => {
    const t = index / 6, inverse = 1 - t;
    return [inverse * inverse * from[0] + 2 * inverse * t * control[0] + t * t * to[0],
      inverse * inverse * from[1] + 2 * inverse * t * control[1] + t * t * to[1]] as PointM;
  });
}

export function addInteractivePreviewTrajectories(scene: HoleScene, shots: readonly ShotRecord[]): HoleScene {
  if (scene.physicalHoleKey !== 'cacapon-07') return scene;
  const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId && feature.kind === 'route')?.parts[0]?.[0];
  if (!route || route.length < 2) return scene;
  let origin = route[0]!;
  const trajectories = [...shots].sort((a, b) => a.shotNumber - b.shotNumber).flatMap(shot => {
    if (shot.isPenalty) return [];
    const endpoint = endpointForShot(scene, route, shot);
    const pointsM = flightCurve(origin, endpoint.point, shot);
    origin = endpoint.point;
    return [{ key: `fixture-flight-${shot.shotNumber}`, shotNumber: shot.shotNumber,
      pointsM, source: 'interactive_preview_fixture' as const }];
  });
  // An empty fixture list still identifies this as the isolated interactive
  // preview. That lets it begin on the Three landscape and prevents SVG
  // uncertainty boundaries from turning a fairway edge into a white dash.
  return { ...scene, overlayKind: 'analytic_fixture', illustrativePreviewTrajectories: trajectories };
}
