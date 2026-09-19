import { describe, expect, it } from 'vitest';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { sampleTerrain, terrainDeltaM } from '../terrain-sampler';

// SYNTHETIC TEST VECTOR: a tilted plane z = 100 + 0.1·E + 0.2·N on a 2 m grid.
function planeMesh(spacingM = 2): TerrainMesh {
  const columns = 21, rows = 21, heightsM: (number | null)[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) heightsM.push(100 + .1 * c * spacingM + .2 * r * spacingM);
  return { metricGrid: { originM: [0, 0], spacingM, columns, rows, heightsM }, vertices: [0, 0, 100, 40, 0, 104, 0, 40, 108] } as unknown as TerrainMesh;
}
describe('one-tap terrain sampler', () => {
  it('uses central differences at max(cell, 0.5 m) and reports slope, aspect and normal', () => {
    const mesh = planeMesh();
    expect(terrainDeltaM(mesh)).toBe(2);
    const s = sampleTerrain(mesh, [20, 20])!;
    expect(s.elevationM).toBeCloseTo(106, 9);
    expect(s.gradient![0]).toBeCloseTo(.1, 9);
    expect(s.gradient![1]).toBeCloseTo(.2, 9);
    expect(s.slopeDegrees).toBeCloseTo(Math.atan(Math.hypot(.1, .2)) * 180 / Math.PI, 9);
    // Downhill points toward −E/−N: bearing 180° + atan(0.1/0.2).
    expect(s.aspectDegrees).toBeCloseTo(180 + Math.atan2(.1, .2) * 180 / Math.PI, 9);
    expect(s.normal![2]).toBeCloseTo(1 / Math.hypot(.1, .2, 1), 9);
    expect(s.elevationQuality).toBe('LIDAR');
    expect(s.basis).toBe('central_differences_metric_grid');
  });
  it('falls to one-sided differences at the grid edge and returns null outside', () => {
    const mesh = planeMesh();
    const edge = sampleTerrain(mesh, [0, 20])!;
    expect(edge.gradient![0]).toBeCloseTo(.1, 9);
    expect(sampleTerrain(mesh, [-5, 20])).toBeNull();
    expect(sampleTerrain(mesh, [Number.NaN, 20])).toBeNull();
  });
  it('never asks a finer step than 0.5 m', () => {
    expect(terrainDeltaM({ metricGrid: { originM: [0, 0], spacingM: .25, columns: 2, rows: 2, heightsM: [0, 0, 0, 0] } })).toBe(.5);
  });
});
