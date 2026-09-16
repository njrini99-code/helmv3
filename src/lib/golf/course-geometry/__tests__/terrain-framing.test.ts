import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { contextPoints } from '../camera';
import { parseGeometryPackage } from '../schema';
import { courseFramingMetadata, fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, terrainHeight, terrainScaleAt,
  TERRAIN_PRESETS, type TerrainFitProfile, type TerrainPreset } from '../terrain';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const pkg = parseGeometryPackage(course), mesh = parseTerrainMesh(source, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);
const presets: readonly TerrainPreset[] = ['top', 'terrain', 'side'];

describe('deterministic tactical framing across the real Cacapon layout', () => {
  it('reports all 18 real outlines with both rotation directions and honest missing-terrain states', () => {
    const snapshot = JSON.stringify(pkg), offsets: number[] = [];
    expect(pkg.holes).toHaveLength(18);
    for (const hole of pkg.holes) {
      const holeScene = buildHoleScene(pkg, hole.key, []);
      for (const [width, height] of [[320, 380], [375, 580], [390, 640], [430, 700]]) {
        const report = courseFramingMetadata(holeScene, width!, height!);
        expect(report).toEqual(courseFramingMetadata(holeScene, width!, height!));
        expect(report.status).toBe('outline_only');
        expect(report.terrainHash).toBeNull();
        expect(report.presets.terrain).toBeNull(); expect(report.presets.side).toBeNull();
        expect(report.presets.top.elevation).toBe('unavailable');
        const { baselineBoundsPx: bounds, occupancy } = report.presets.top;
        expect(bounds.x).toBeGreaterThanOrEqual(24 - 1e-8);
        expect(bounds.y).toBeGreaterThanOrEqual(24 - 1e-8);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width! - 24 + 1e-8);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height! - 24 + 1e-8);
        expect(Math.max(bounds.width / (width! - 48), bounds.height / (height! - 48))).toBeCloseTo(1, 9);
        expect(occupancy.area).toBeGreaterThan(.5);
        const route = holeScene.features.find(feature => feature.id === hole.routeFeatureId)!.parts[0]![0]!;
        const first = route[0]!, last = route.at(-1)!;
        const upright = Math.PI / 2 - Math.atan2(last[1] - first[1], last[0] - first[0]);
        const heading = report.presets.top.baselineHeadingRadians;
        // Rotation changes the view, never the handedness or tee-to-green order.
        expect(Math.sin(heading) * (last[0] - first[0]) + Math.cos(heading) * (last[1] - first[1])).toBeGreaterThan(0);
        if (width === 390) offsets.push(heading - upright);
      }
      if (hole.key !== mesh.physicalHoleKey) {
        expect(courseFramingMetadata(holeScene, 390, 640, mesh).status).toBe('outline_only');
        expect(() => fitTerrainCamera(holeScene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top)).toThrow('Terrain geometry version mismatch');
      }
    }
    expect(offsets.some(offset => offset > 0)).toBe(true);
    expect(offsets.some(offset => offset < 0)).toBe(true);
    expect(JSON.stringify(pkg)).toBe(snapshot);
  });

  it('fits every tactical corner in each real-terrain preset and preserves area heading continuity', () => {
    const snapshot = [...mesh.vertices];
    for (const preset of presets) for (const [width, height] of [[320, 380], [390, 640], [980, 680]]) {
      const whole = fitTerrainCamera(scene, mesh, 'hole', width!, height!, TERRAIN_PRESETS[preset], 1, [0, 0], preset);
      for (const view of ['hole', 'approach', 'green'] as const) {
        const camera = fitTerrainCamera(scene, mesh, view, width!, height!, TERRAIN_PRESETS[preset], 1, [0, 0], preset);
        expect(camera.right).toEqual(whole.right); expect(camera.up).toEqual(whole.up);
        const screen = contextPoints(scene, view).map(point => projectTerrainPoint([point[0], point[1], terrainHeight(mesh, point)!], camera));
        const xs = screen.map(point => point[0]), ys = screen.map(point => point[1]);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(24 - 1e-7);
        expect(Math.max(...xs)).toBeLessThanOrEqual(width! - 24 + 1e-7);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(24 - 1e-7);
        expect(Math.max(...ys)).toBeLessThanOrEqual(height! - 24 + 1e-7);
        const bounds = camera.framing!.baselineBoundsPx;
        expect(bounds.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 8);
        expect(bounds.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 8);
        expect(Math.max(bounds.width / (width! - 48), bounds.height / (height! - 48))).toBeCloseTo(1, 9);
      }
    }
    const top = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top, 1, [0, 0], 'top');
    const terrain = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.terrain, 1, [0, 0], 'terrain');
    // A perspective Terrain is a closer look than Top at its near edge and
    // genuinely foreshortens toward the far edge (Meridian §3, §9).
    expect(terrain.projection).toBe('perspective');
    expect(terrain.framing!.eyeDistanceM).toBeGreaterThan(0);
    expect(terrain.framing!.targetBasis).toBe('route_green_weighted');
    const depths = contextPoints(scene, 'hole').map(point => {
      const world = [point[0], point[1], terrainHeight(mesh, point)!] as const;
      return { world, depth: projectTerrainPoint(world, terrain)[2] };
    }).sort((a, b) => a.depth - b.depth);
    const nearScale = terrainScaleAt(depths[0]!.world, terrain), farScale = terrainScaleAt(depths.at(-1)!.world, terrain);
    expect(nearScale).toBeGreaterThan(top.scale * 1.1);
    expect(farScale).toBeLessThan(nearScale * .8);
    expect(mesh.vertices).toEqual(snapshot);
  });

  it('holds the selected lens and pivot during orbit instead of fitting again for every pitch', () => {
    const first = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.terrain, 1.4, [11, -9], 'terrain');
    for (const pitch of [20, 40, 60, 90]) for (const yawOffset of [-45, 0, 45]) {
      const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 640, { pitch, yawOffset, exaggeration: 1.5 }, 1.4, [11, -9], 'terrain');
      expect(camera.scale).toBe(first.scale); expect(camera.focusM).toEqual(first.focusM);
      expect(camera.framing).toEqual(first.framing);
      const focus = projectTerrainPoint(camera.focusM, camera);
      expect(focus[0]).toBeCloseTo(206, 9); expect(focus[1]).toBeCloseTo(311, 9);
    }
  });

  it('reports unsupported tactical elevations without inventing a flat Terrain/Side or aborting a contact sheet', () => {
    const incomplete = { ...mesh, metricGrid: { originM: [0, 0] as [number, number], spacingM: 10, columns: 2, rows: 2,
      heightsM: [null, null, null, null] } };
    const report = courseFramingMetadata(scene, 390, 640, incomplete);
    expect(report.status).toBe('outline_only');
    expect(report.reason).toBe('missing_tactical_elevation');
    expect(report.terrainHash).toBe(mesh.contentHash);
    expect(report.presets.terrain).toBeNull(); expect(report.presets.side).toBeNull();
    expect(report.presets.top.elevation).toBe('unavailable');
  });

  it('blends cached presets continuously and preserves an interrupted blend as a stable gesture lens', () => {
    const start = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top, 1, [0, 0], 'top');
    const end = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.terrain, 1, [0, 0], 'terrain');
    const profile: TerrainFitProfile = { from: 'top', to: 'terrain', progress: .5 };
    const pose = { pitch: 70, yawOffset: 0, exaggeration: 1.25 };
    const middle = fitTerrainCamera(scene, mesh, 'hole', 390, 640, pose, 1, [0, 0], profile);
    expect(middle.scale).toBeCloseTo(Math.sqrt(start.scale * end.scale), 10);
    for (let i = 0; i < 3; i++) expect(middle.focusM[i]).toBeCloseTo((start.focusM[i]! + end.focusM[i]!) / 2, 10);
    const interrupted = fitTerrainCamera(scene, mesh, 'hole', 390, 640, { ...pose, pitch: 63, yawOffset: 11 }, 1, [0, 0], profile);
    expect(interrupted.scale).toBe(middle.scale); expect(interrupted.focusM).toEqual(middle.focusM);
    const next = fitTerrainCamera(scene, mesh, 'hole', 390, 640, pose, 1, [0, 0], { from: profile, to: 'side', progress: 0 });
    expect(next.scale).toBe(middle.scale); expect(next.focusM).toEqual(middle.focusM);
    expect(() => fitTerrainCamera(scene, mesh, 'hole', 390, 640, pose, 1, [0, 0], { from: 'top', to: 'side', progress: NaN })).toThrow('Invalid terrain fit profile');
  });
});
