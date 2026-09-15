import { describe, expect, it } from 'vitest';
import winchester from '@/test/fixtures/course-geometry/winchester.json';
import terrain from '@/test/fixtures/course-geometry/winchester-07-terrain.json';
import cardinal from '@/test/fixtures/course-geometry/cardinal-study.json';
import { parseGeometryPackage } from '../schema';
import { buildHoleScene } from '../build-scene';
import { parseTerrainMesh, fitTerrainCamera, TERRAIN_PRESETS } from '../terrain';

describe('non-demo course trial boundaries', () => {
  it('preserves the recorded Winchester scorecard independently of terrain cameras', () => {
    const pkg = parseGeometryPackage(winchester);
    const mesh = parseTerrainMesh(terrain, pkg);
    const original = JSON.stringify(pkg);
    const scene = buildHoleScene(pkg, 'winchester-07', [], mesh);
    expect(pkg.holes).toHaveLength(18);
    expect(pkg.features.filter(f => f.id.startsWith('osm-relation-'))).toHaveLength(2);
    expect(pkg.features.filter(f => f.id.startsWith('osm-relation-')).every(f => f.geometryWgs84.type === 'Polygon' && f.geometryWgs84.coordinates.length > 1)).toBe(true);
    expect(scene.hole.scorecardYards).toBe(355);
    expect(mesh.source.acquisitionStart).toBe('2020-11-29');
    expect(mesh.source.acquisitionEnd).toBe('2021-01-12');
    for (const pose of Object.values(TERRAIN_PRESETS)) fitTerrainCamera(scene, mesh, 'hole', 390, 310, pose);
    expect(JSON.stringify(pkg)).toBe(original);
    expect(scene.events).toHaveLength(0);
  });
  it('supports an explicitly unassigned green study without manufacturing a route or pin', () => {
    const pkg = parseGeometryPackage(cardinal);
    const scene = buildHoleScene(pkg, pkg.holes[0]!.key);
    expect(scene.features.some(f => f.kind === 'route')).toBe(false);
    expect(scene.hole.nominalTargetWgs84).toBeNull();
    expect(scene.orientationRadians).toBe(0);
    expect(scene.hole.scorecardYards).toBeNull();
    expect(scene.target.kind).toBe('unknown_pin');
  });
  it('rejects an unrouted study relabelled as a reviewed package or without disclosure', () => {
    expect(() => parseGeometryPackage({ ...cardinal, status: 'reviewed_draft' })).toThrow('Unlabelled unrouted study');
    const data = structuredClone(cardinal);
    delete (data.holes[0] as { displayLabel?: string }).displayLabel;
    expect(() => parseGeometryPackage(data)).toThrow('Unlabelled unrouted study');
  });
});
