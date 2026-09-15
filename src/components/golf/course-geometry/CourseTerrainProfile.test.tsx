import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCourseTerrainProfile, CourseTerrainProfile } from './CourseTerrainProfile';
import { illustrativeScene, pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const mesh = parseTerrainMesh(source, pilotPackage);
/** Analytic test plane only, not an imported or accepted course elevation. */
function plane(): HoleScene {
  const base = illustrativeScene();
  return { ...base, hole: { ...base.hole, routeFeatureId: 'analytic-route' }, events: [],
    features: [{ id: 'analytic-route', kind: 'route', type: 'LineString', reviewed: true, parts: [[[[0, 0], [50, 0], [50, 50]]]] }],
    terrain: { ...mesh, metricGrid: { originM: [0, 0], spacingM: 5, columns: 11, rows: 11,
      heightsM: Array.from({ length: 121 }, (_, i) => 100 + i % 11 * .5 + Math.floor(i / 11)) } } };
}
const render = (scene: HoleScene, distanceUnit: 'yards' | 'meters' = 'yards') => new DOMParser().parseFromString(
  renderToStaticMarkup(<CourseTerrainProfile scene={scene} width={390} height={420} distanceUnit={distanceUnit} />), 'text/html');

describe('quantified terrain section', () => {
  it('uses actual route chainage through its dogleg and real source elevation, preserving scorecard values', () => {
    const scene = plane(), snapshot = structuredClone(scene);
    const result = buildCourseTerrainProfile(scene);
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('Missing analytic profile');
    expect(result.basis).toBe('mapped_route');
    expect(result.distanceM).toBe(100);
    expect(result.samples.find(sample => sample.distanceM === 50)?.positionM).toEqual([50, 0]);
    expect(result.samples[0]!.elevationM).toBe(100);
    expect(result.samples.at(-1)!.elevationM).toBe(115);
    expect(result.changeM).toBe(15);
    expect(result.hasGaps).toBe(false);
    expect(scene).toEqual(snapshot);
    expect(result.distanceM).not.toBe(scene.hole.scorecardYards! * .9144);
  });

  it('splits the curve at source nodata without joining across or replacing missing elevations', () => {
    const scene = plane();
    scene.terrain!.metricGrid!.heightsM[5] = null;
    const result = buildCourseTerrainProfile(scene);
    if (result.status !== 'available') throw new Error('Expected partially covered analytic profile');
    expect(result.hasGaps).toBe(true);
    expect(result.samples.some(sample => sample.elevationM == null)).toBe(true);
    const document = render(scene);
    expect(document.querySelectorAll('[data-profile-run]')).toHaveLength(2);
    expect(document.body.textContent).toContain('Gaps show missing terrain.');
    for (const path of document.querySelectorAll('[data-profile-run]')) expect(path.getAttribute('d')).not.toMatch(/NaN|null|undefined/);
  });

  it('labels independently scaled chart axes and converts explicit units without altering the profile', () => {
    const scene = plane(), before = buildCourseTerrainProfile(scene);
    const yards = render(scene), meters = render(scene, 'meters');
    expect(yards.body.textContent).toContain('Horizontal distance (yd)');
    expect(yards.body.textContent).toContain('Elevation (ft)');
    expect(yards.body.textContent).toContain('109 yd');
    expect(meters.body.textContent).toContain('Horizontal distance (m)');
    expect(meters.body.textContent).toContain('Elevation (m)');
    expect(meters.body.textContent).toContain('100 m');
    expect(yards.body.textContent).toContain('Axes scaled independently; elevation values are unexaggerated.');
    expect(buildCourseTerrainProfile(scene)).toEqual(before);
  });

  it('uses a supported estimated segment, then falls back explicitly to the route after penalty invalidation', () => {
    const scene = illustrativeScene(); scene.terrain = mesh;
    const fromM = scene.events[0]!.anchorM!, toM = scene.events[1]!.anchorM!;
    const distanceM = Math.hypot(fromM[0] - toM[0], fromM[1] - toM[1]);
    scene.events[1]!.connection = { fromM, toM, distanceM, basis: 'inferred_endpoint_separation' };
    const result = buildCourseTerrainProfile(scene, 2);
    if (result.status !== 'available') throw new Error('Missing supported segment');
    expect(result.basis).toBe('estimated_segment'); expect(result.shotNumber).toBe(2);
    expect(result.distanceM).toBeCloseTo(distanceM, 10);
    scene.events[1]!.evidence.penalty = { type: 'drop', nextLie: null, nextDistance: scene.events[1]!.evidence.after };
    const invalidated = buildCourseTerrainProfile(scene, 2);
    expect(invalidated.status === 'available' && invalidated.basis).toBe('mapped_route');
  });

  it('keeps absent terrain, missing routes and wholly unsupported elevation explicit', () => {
    const scene = plane();
    const missingTerrain = { ...scene, terrain: undefined };
    expect(buildCourseTerrainProfile(missingTerrain)).toEqual({ status: 'unavailable', reason: 'terrain_missing' });
    expect(render(missingTerrain).body.textContent).toContain('Terrain profile unavailable');
    const missingRoute = { ...scene, features: [] };
    expect(buildCourseTerrainProfile(missingRoute)).toEqual({ status: 'unavailable', reason: 'route_missing' });
    scene.terrain!.metricGrid!.heightsM.fill(null);
    expect(buildCourseTerrainProfile(scene)).toEqual({ status: 'unavailable', reason: 'no_elevation' });
  });
});
