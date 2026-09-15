import { describe, expect, it } from 'vitest';
import { addInteractivePreviewTrajectories, illustrativeScene, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import terrainSource from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { buildHoleScene } from '../build-scene';
import { normalizeLiveShot } from '../normalize';
import { parseTerrainMesh, projectTerrainPoint, terrainHeight, TERRAIN_PRESETS } from '../terrain';
import { fitTerrainViewportCamera } from '../terrain-viewport';
import { inFeature } from '../spatial';
import { contextCamera } from '../camera';
import type { ShotRecord } from '@/lib/types/golf';
import type { LocalFeature, PointM } from '../types';
import { layoutShotOverlay, prepareShotOverlay } from '../shot-overlay-layout';
import { toScreen } from '../project';

const mesh = parseTerrainMesh(terrainSource, pilotPackage);
function actualCacaponScene() {
  const ledger: ShotRecord[] = [
    { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 158 },
    { ...pilotShots[1]!, distanceToHoleBefore: 158, distanceToHoleAfter: 17, missDirection: 'short_right', approachMissDirection: 'short_right' },
    { shotNumber: 3, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'sand', distanceToHoleBefore: 17,
      distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 12, distanceUnitAfter: 'feet', shotDistance: 13, isPenalty: false },
    { shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 12,
      distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 3.3, isPenalty: false },
    { shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 2,
      distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: .66, isPenalty: false },
  ];
  return buildHoleScene(pilotPackage, 'cacapon-07', ledger.map(normalizeLiveShot), mesh);
}

describe('camera-independent shot overlay evidence', () => {
  it('marks the empty interactive fixture so its compact SVG has no surface dashes', () => {
    const base = buildHoleScene(pilotPackage, 'cacapon-07', [], mesh);
    const scene = addInteractivePreviewTrajectories(base, []);
    expect(scene.overlayKind).toBe('analytic_fixture');
    expect(scene.illustrativePreviewTrajectories).toEqual([]);
  });

  it('keeps an estimated putting ball and surface roll on the actual reviewed green', () => {
    const ledger: ShotRecord[] = [
      { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 158 },
      { ...pilotShots[1]!, distanceToHoleBefore: 158, distanceToHoleAfter: 17, missDirection: 'short_right', approachMissDirection: 'short_right' },
      { shotNumber: 3, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'sand', distanceToHoleBefore: 17,
        distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 12, distanceUnitAfter: 'feet', shotDistance: 13, isPenalty: false },
      { shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 12,
        distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 3.3, isPenalty: false, puttBreak: 'left_to_right' },
      { shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 2,
        distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: .66, isPenalty: false },
    ];
    const base = buildHoleScene(pilotPackage, 'cacapon-07', ledger.map(normalizeLiveShot), mesh);
    const scene = addInteractivePreviewTrajectories(base, ledger);
    const tracks = scene.illustrativePuttingTracks!;
    const green = scene.features.find(feature => feature.id === scene.target.greenFeatureId)!;
    const pin = scene.target.estimate!.positionM;
    const approachBall = tracks.find(track => track.key === 'fixture-putting-ball-3')!;
    const firstPutt = tracks.find(track => track.key === 'fixture-putting-roll-4')!;
    const holedPutt = tracks.find(track => track.key === 'fixture-putting-roll-5')!;
    expect(approachBall.kind).toBe('ball_position');
    expect(firstPutt.kind).toBe('surface_roll');
    expect(firstPutt.pointsM.every(point => inFeature(point, green))).toBe(true);
    expect(holedPutt.pointsM.at(-1)).toEqual(pin);
    expect(Math.hypot(approachBall.pointsM[0]![0] - pin[0], approachBall.pointsM[0]![1] - pin[1])).toBeCloseTo(12 * .3048, 4);
    expect(Math.hypot(firstPutt.pointsM.at(-1)![0] - pin[0], firstPutt.pointsM.at(-1)![1] - pin[1])).toBeCloseTo(2 * .3048, 4);
    const layout = layoutShotOverlay(prepareShotOverlay(scene, 4), { width: 600, height: 700, project: point => point, pathForFeature: () => null });
    expect(layout.illustrativePuttingTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({ shotNumber: 3, kind: 'ball_position', active: false }),
      expect.objectContaining({ shotNumber: 4, kind: 'surface_roll', active: true }),
    ]));
  });

  it('can reserve the HUD without moving physical anchors or changing their evidence', () => {
    const scene = illustrativeScene(), snapshot = structuredClone(scene);
    const prepared = prepareShotOverlay(scene, 2), preparedSnapshot = structuredClone(prepared);
    const camera = { scale: .6, angle: .4, translation: [220, 400] as const };
    const projection = { width: 600, height: 700, project: (point: readonly [number, number]) => toScreen(point, camera),
      pathForFeature: () => null };
    const ordinary = layoutShotOverlay(prepared, projection);
    const reserved = layoutShotOverlay(prepared, { ...projection,
      reservedRects: [{ x: 0, y: 0, width: 600, height: 700 }] });
    expect(ordinary.badges.length).toBeGreaterThan(0);
    expect(ordinary.pin).not.toBeNull();
    expect(reserved.badges).toEqual([]);
    expect(reserved.pin).toBeNull();
    expect(reserved.anchors).toEqual(ordinary.anchors);
    expect(reserved.anchors[0]!.point).toEqual(toScreen(scene.events[0]!.anchorM!, camera));
    expect(scene).toEqual(snapshot);
    expect(prepared).toEqual(preparedSnapshot);
  });

  it('rejects invalid projections rather than emitting nonfinite overlay coordinates', () => {
    const prepared = prepareShotOverlay(illustrativeScene(), 2);
    expect(layoutShotOverlay(prepared, { width: 600, height: 700,
      project: () => [NaN, Infinity], pathForFeature: () => null }))
      .toEqual({ anchors: [], badges: [], regions: [], segments: [], pin: null, illustrativePreviewTrajectories: [], illustrativePuttingTracks: [] });
    expect(layoutShotOverlay(prepared, { width: 0, height: 700,
      project: point => point, pathForFeature: () => null }))
      .toEqual({ anchors: [], badges: [], regions: [], segments: [], pin: null, illustrativePreviewTrajectories: [], illustrativePuttingTracks: [] });
  });

  it('uses the committed fairway result and remaining distance to estimate a visible fixture trail', () => {
    const shot = { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 135 };
    const base = buildHoleScene(pilotPackage, 'cacapon-07', [shot].map(normalizeLiveShot), mesh);
    const scene = addInteractivePreviewTrajectories(base, [shot]);
    const prepared = prepareShotOverlay(scene);
    const layout = layoutShotOverlay(prepared, { width: 600, height: 700, project: point => point, pathForFeature: () => null });
    expect(scene.events[0]!.anchorM).toBeNull();
    expect(scene.illustrativePreviewTrajectories).toHaveLength(1);
    expect(layout.illustrativePreviewTrajectories).toEqual([expect.objectContaining({ shotNumber: 1, active: true })]);
    const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId)!.parts[0]![0]!;
    const endpoint = layout.illustrativePreviewTrajectories[0]!.points.at(-1)!;
    expect(Math.hypot(endpoint[0] - route.at(-1)![0], endpoint[1] - route.at(-1)![1])).toBeCloseTo(135 * .9144, 1);
    expect(layout.illustrativePreviewTrajectories[0]!.points).toHaveLength(7);
    // A compact approach context may otherwise crop the tee-to-fairway path.
    const camera = contextCamera(scene, 320, 160, 'approach');
    for (const point of layout.illustrativePreviewTrajectories[0]!.points) {
      const projected = toScreen(point, camera);
      expect(projected[0]).toBeGreaterThanOrEqual(0);
      expect(projected[0]).toBeLessThanOrEqual(320);
      expect(projected[1]).toBeGreaterThanOrEqual(0);
      expect(projected[1]).toBeLessThanOrEqual(160);
    }
  });

  it('uses the selected bunker and miss side for an estimated sand finish', () => {
    const shots: ShotRecord[] = [
      { ...pilotShots[0]!, distanceToHoleBefore: 431, distanceToHoleAfter: 135 },
      { ...pilotShots[1]!, distanceToHoleBefore: 135, distanceToHoleAfter: 17, missDirection: 'right', approachMissDirection: 'right' },
    ];
    const scene = addInteractivePreviewTrajectories(
      buildHoleScene(pilotPackage, 'cacapon-07', shots.map(normalizeLiveShot), mesh), shots,
    );
    const endpoint = scene.illustrativePreviewTrajectories!.at(-1)!.pointsM.at(-1)!;
    expect(scene.features.some(feature => feature.kind === 'bunker' && inFeature(endpoint, feature))).toBe(true);
  });

  it('keeps both actual Cacapon candidate outlines legible without enlarging cells or locating the ball', () => {
    const scene = actualCacaponScene(), snapshot = structuredClone(scene);
    const prepared = prepareShotOverlay(scene, 2);
    for (const view of ['hole', 'green'] as const) {
      const camera = fitTerrainViewportCamera(scene, mesh, view, 388, 700, TERRAIN_PRESETS.terrain);
      const project = (point: PointM): PointM | null => {
        const z = terrainHeight(mesh, point);
        if (z == null) return null;
        const projected = projectTerrainPoint([point[0], point[1], z], camera);
        return [projected[0], projected[1]];
      };
      const pathForFeature = (feature: LocalFeature) => feature.parts.map(part => part.map(ring => ring.map((point, i) => {
        const p = project(point)!;
        return `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`;
      }).join(' ') + ' Z').join(' ')).join(' ');
      const layout = layoutShotOverlay(prepared, { width: 388, height: 700, project, pathForFeature,
        reservedRects: [{ x: 0, y: 0, width: 388, height: 88 }, { x: 324, y: 536, width: 64, height: 164 }] });
      expect(layout.regions.map(region => region.featureId)).toEqual(['osm-way-885719199', 'osm-way-885719200']);
      for (const region of layout.regions) expect(region.clip).toBe(pathForFeature(scene.features.find(f => f.id === region.featureId)!));
      expect(layout.regions.every(region => Boolean(region.d))).toBe(view === 'green');
      expect(layout.anchors).toEqual([]);
      expect(layout.segments).toEqual([]);
      expect(layout.badges).toEqual([]);
      expect(layout.pin).not.toBeNull();
      expect(layout.pin!.position).toEqual(project(scene.target.estimate!.positionM));
      expect(layout.pin!.glyphScale).toBe(view === 'hole' ? .8 : 1);
      const green = scene.features.find(f => f.id === scene.target.greenFeatureId)!;
      const screenGreen = { ...green, parts: green.parts.map(part => part.map(ring => ring.map(point => project(point)!))) };
      // The disclosure's full text box must sit outside the physical green.
      for (let x = -44; x <= 44; x += 2) for (let y = -10; y <= 10; y += 2) {
        expect(inFeature([layout.pin!.label[0] + x, layout.pin!.label[1] + y], screenGreen)).toBe(false);
      }
    }
    expect(scene).toEqual(snapshot);
  });
});
