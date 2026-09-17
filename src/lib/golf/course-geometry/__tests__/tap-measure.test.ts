/**
 * Tap-to-measure (on-course ask, 2026-09-17: "enter the 3D, tap an area on
 * the fairway and it tells you how many yards it is from where you are").
 */
import { describe, expect, it } from 'vitest';
import { illustrativeScene, pilotPackage, pilotScene } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh, terrainHeight } from '../terrain';
import { MEASURE_LINK_KEY, MEASURE_MARKER_KEY, measureCaption, measureMarkers, measureOrigin, measureTap } from '../tap-measure';
import type { SceneMarkers } from '../scene-markers';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const mesh = parseTerrainMesh(source, pilotPackage);
const scene = { ...pilotScene('cacapon-07', false), terrain: mesh };
const tee = scene.features.find(f => f.id === scene.hole.routeFeatureId)!.parts[0]![0]![0]!;
const you: SceneMarkers = { markers: [{ key: 'player', kind: 'player', pointM: [tee[0] + 30, tee[1] + 40], sigmaM: 3, label: 'YOU' }], links: [] };

describe('measureOrigin: the best position the round actually holds', () => {
  it('prefers the live device, then the newest mark, then the last resolved shot, then the tee', () => {
    const ball: SceneMarkers = { markers: [
      { key: 'shot-1', kind: 'anchor', pointM: [tee[0] + 100, tee[1]], sigmaM: 4 },
      { key: 'ball', kind: 'ball', pointM: [tee[0] + 200, tee[1]], sigmaM: 4, label: 'BALL' },
    ], links: [] };
    expect(measureOrigin(scene, { ...you, markers: [...ball.markers, ...you.markers] })).toEqual({ pointM: you.markers[0]!.pointM, basis: 'you', sigmaM: 3 });
    expect(measureOrigin(scene, ball)).toEqual({ pointM: [tee[0] + 200, tee[1]], basis: 'ball', sigmaM: 4 });
    const typed = illustrativeScene();
    expect(measureOrigin(typed, null)).toEqual({ pointM: typed.events[1]!.anchorM, basis: 'last_shot', sigmaM: 0 });
    expect(measureOrigin(scene, null)).toEqual({ pointM: [tee[0], tee[1]], basis: 'tee', sigmaM: 0 });
    expect(measureOrigin(null, null)).toBeNull();
    // No fresh fix: YOU is dimmed where it last was, and the ruler says so instead of "from you".
    const stale: SceneMarkers = { markers: [{ ...you.markers[0]!, dimmed: true }], links: [] };
    expect(measureOrigin(scene, stale)).toEqual({ pointM: you.markers[0]!.pointM, basis: 'last_fix', sigmaM: 3 });
  });
});

describe('measureTap: horizontal yards, ground rise, nothing recorded', () => {
  it('measures the flat distance from YOU to the tapped ground point and reports the rise', () => {
    const at = you.markers[0]!.pointM;
    const target: [number, number] = [at[0] + 120, at[1] + 160]; // 200 m away
    const z = terrainHeight(mesh, target)!;
    const m = measureTap(scene, you, [target[0], target[1], z])!;
    expect(m.origin.basis).toBe('you');
    expect(m.distanceM).toBeCloseTo(200, 9);
    expect(m.yards).toBe(219); // 200 m × 1.0936
    expect(m.elevationDeltaM).toBeCloseTo(z - terrainHeight(mesh, at)!, 9);
    expect(m.pointM).toEqual(target);
  });
  it('a point off the course frame or a scene without a route measures nothing', () => {
    expect(measureTap(scene, you, [Number.NaN, 0, 0])).toBeNull();
    expect(measureTap({ ...scene, hole: { ...scene.hole, routeFeatureId: null } }, null, [0, 0, 0])).toBeNull();
  });
  it('has no rise without terrain under the origin', () => {
    const flat = { ...scene, terrain: undefined };
    expect(measureTap(flat, you, [tee[0], tee[1], 300])!.elevationDeltaM).toBeNull();
  });
});

describe('measureMarkers and the caption', () => {
  it('adds one labelled measure marker and a dashed ground ruler from the origin, leaving the round\'s markers alone', () => {
    const target: [number, number] = [tee[0] + 120, tee[1] + 160];
    const m = measureTap(scene, you, [target[0], target[1], terrainHeight(mesh, target)!])!;
    const drawn = measureMarkers(you, m)!;
    expect(drawn.markers.slice(0, -1)).toEqual(you.markers);
    expect(drawn.markers.at(-1)).toMatchObject({ key: MEASURE_MARKER_KEY, kind: 'measure', pointM: target, sigmaM: 0, label: `${m.yards} yd` });
    expect(drawn.links).toEqual([{ key: MEASURE_LINK_KEY, fromM: you.markers[0]!.pointM, toM: target, basis: 'surface_connector', dashed: true, opacity: .9 }]);
    expect(measureMarkers(you, null)).toBe(you);
    expect(measureMarkers(null, null)).toBeNull();
  });
  it('captions the yards, the rise when there is one, and where the ruler starts', () => {
    const base = { pointM: [0, 0] as [number, number], origin: { pointM: [0, 0] as [number, number], basis: 'you' as const, sigmaM: 0 }, distanceM: 100, yards: 109 };
    expect(measureCaption({ ...base, elevationDeltaM: 4 })).toBe('109 yd · ↑ 13 ft · from you');
    expect(measureCaption({ ...base, elevationDeltaM: -2.5 })).toBe('109 yd · ↓ 8 ft · from you');
    expect(measureCaption({ ...base, elevationDeltaM: .1 })).toBe('109 yd · from you');
    // The origin's own radius rides along, as the readout's ± does; a typed position has none.
    expect(measureCaption({ ...base, elevationDeltaM: 4, origin: { pointM: [0, 0], basis: 'you', sigmaM: 4 } })).toBe('109 yd · ±4 yd · ↑ 13 ft · from you');
    expect(measureCaption({ ...base, elevationDeltaM: null, origin: { pointM: [0, 0], basis: 'last_fix', sigmaM: 3 } })).toBe('109 yd · ±3 yd · from your last fix');
    expect(measureCaption({ ...base, elevationDeltaM: null, origin: { pointM: [0, 0], basis: 'tee', sigmaM: 0 } })).toBe('109 yd · from the tee');
    expect(measureCaption({ ...base, elevationDeltaM: null, origin: { pointM: [0, 0], basis: 'ball', sigmaM: .3 } })).toBe('109 yd · from your ball');
    expect(measureCaption({ ...base, elevationDeltaM: null, origin: { pointM: [0, 0], basis: 'last_shot', sigmaM: 0 } })).toBe('109 yd · from your last shot');
  });
});
