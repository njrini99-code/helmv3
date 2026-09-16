import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { extrusion, ribbon, ribbonVertexHeight, roofArchetype, roundCorners } from './three-context';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { MERIDIAN_STYLE } from '@/lib/golf/course-geometry/visual-style';

describe('context ribbon corner fillets', () => {
  it('rounds sharp bends within the fillet reach and keeps gentle bends and end points exact', () => {
    const line: [number, number][] = [[0, 0], [20, 0], [20, 20], [21, 40]];
    const out = roundCorners(line, 2);
    expect(out[0]).toEqual([0, 0]); expect(out[out.length - 1]).toEqual([21, 40]);
    // The right angle at (20, 0) is replaced by a fillet that never passes through the corner …
    expect(out.some(([x, y]) => x === 20 && y === 0)).toBe(false);
    // … and stays within 2 m of it; the gentle bend at (20, 20) is kept as is.
    const nearCorner = out.filter(([x, y]) => Math.hypot(x - 20, y - 0) <= 2.0001);
    expect(nearCorner.length).toBeGreaterThanOrEqual(5);
    expect(out.some(([x, y]) => x === 20 && y === 20)).toBe(true);
    // Consecutive directions never reverse, so a strip built on it cannot fold.
    for (let i = 2; i < out.length; i++) {
      const [ax, ay] = out[i - 2]!, [bx, by] = out[i - 1]!, [cx, cy] = out[i]!;
      expect((bx - ax) * (cx - bx) + (by - ay) * (cy - by)).toBeGreaterThanOrEqual(0);
    }
    // Two-point lines are untouched.
    expect(roundCorners([[0, 0], [5, 5]], 2)).toEqual([[0, 0], [5, 5]]);
  });
});

describe('context ribbon draping (redesign 12, context-contact-v3)', () => {
  // A plane rising 1 m per metre in y: a 4 m wide strip along x crosses a 2 m
  // drop from one shoulder to the other, more than the 1.2 m cut/fill cap.
  const grid = { originM: [-10, -10] as [number, number], spacingM: 10, columns: 5, rows: 5,
    heightsM: Array.from({ length: 25 }, (_, i) => 100 + Math.floor(i / 5) * 10 - 10) };
  const mesh = { metricGrid: grid, vertices: [], triangleFeatures: [], featureKinds: [], featureIds: [] } as unknown as TerrainMesh;
  const { cutFillMaxM } = MERIDIAN_STYLE.contextContact;

  it('caps a vertex at cutFillMaxM from the canonical ground under it', () => {
    expect(ribbonVertexHeight(mesh, [0, 0], 100)).toBe(100);
    expect(ribbonVertexHeight(mesh, [0, .5], 100)).toBeCloseTo(100, 6);
    expect(ribbonVertexHeight(mesh, [0, 2], 100)).toBeCloseTo(102 - cutFillMaxM, 6);
    expect(ribbonVertexHeight(mesh, [0, -2], 100)).toBeCloseTo(98 + cutFillMaxM, 6);
    expect(ribbonVertexHeight(mesh, [0, 2], 100, 0)).toBe(100);
    expect(ribbonVertexHeight(mesh, [1000, 1000], 100)).toBe(100);
  });

  it('keeps every strip vertex on the displayed ground across a bank', () => {
    const positions: number[] = [], colors: number[] = [], groundZ: number[] = [], indices: number[] = [];
    ribbon(mesh, [[0, 0], [12, 0]], 4, new THREE.Color('#888'), new THREE.Color('#777'), positions, colors, groundZ, indices);
    expect(positions.length / 3).toBe(5 * 4);
    for (let v = 0; v < positions.length / 3; v++) {
      const y = positions[v * 3 + 1]!, z = positions[v * 3 + 2]!, ground = 100 + y;
      expect(Math.abs(z - ground)).toBeLessThanOrEqual(cutFillMaxM + 1e-6);
      expect(Math.abs(z - 100)).toBeLessThanOrEqual(Math.abs(y) + 1e-6);
      expect(groundZ[v]).toBe(z);
    }
    // The outer shoulders sit 2 m across the slope: capped, not at the centreline.
    const shoulderZ = positions.filter((_, i) => i % 3 === 2).filter((_, v) => v % 4 === 3);
    for (const z of shoulderZ) expect(z).toBeCloseTo(102 - cutFillMaxM, 6);
  });
});

describe('roof archetype by footprint (master §55, Layer C)', () => {
  const rect: [number, number][] = [[0, 0], [12, 0], [12, 10], [0, 10]];
  it('hips a small convex footprint with an inset ring that stays inside it', () => {
    const roof = roofArchetype(rect);
    expect(roof.kind).toBe('hip');
    if (roof.kind !== 'hip') return;
    expect(roof.inset).toBeCloseTo(1.75, 6);
    expect(roof.rise).toBeCloseTo(1.4, 6);
    expect(roof.top).toHaveLength(4);
    for (const [x, y] of roof.top) { expect(x).toBeGreaterThan(1.7); expect(x).toBeLessThan(10.3); expect(y).toBeGreaterThan(1.7); expect(y).toBeLessThan(8.3); }
    // Same answer for the clockwise ring.
    expect(roofArchetype([...rect].reverse())).toMatchObject({ kind: 'hip', inset: roof.inset });
  });
  it('keeps large, concave, detailed or tiny footprints flat', () => {
    expect(roofArchetype([[0, 0], [30, 0], [30, 30], [0, 30]]).kind).toBe('flat');
    expect(roofArchetype([[0, 0], [12, 0], [12, 4], [6, 4], [6, 10], [0, 10]]).kind).toBe('flat');
    expect(roofArchetype([[0, 0], [4, 0], [8, 1], [12, 3], [12, 10], [6, 11], [0, 10]]).kind).toBe('flat');
    expect(roofArchetype([[0, 0], [1, 0], [1, 1], [0, 1]]).kind).toBe('flat');
    expect(roofArchetype([[0, 0], [12, 0]]).kind).toBe('flat');
  });
  it('builds sloped faces up to the eave plus the rise and returns the archetype used', () => {
    const grid = { originM: [-10, -10] as [number, number], spacingM: 20, columns: 3, rows: 3, heightsM: Array(9).fill(100) as number[] };
    const mesh = { metricGrid: grid, vertices: [], triangleFeatures: [], featureKinds: [], featureIds: [] } as unknown as TerrainMesh;
    const positions: number[] = [], colors: number[] = [], groundZ: number[] = [], lift: number[] = [], indices: number[] = [];
    const wall = new THREE.Color('#ccc'), roof = new THREE.Color('#777');
    expect(extrusion(mesh, [...rect, rect[0]!], 5, wall, roof, positions, colors, groundZ, lift, indices)).toBe('hip');
    expect(positions.length / 3).toBe(16 + 16 + 4);
    expect(Math.max(...lift)).toBeCloseTo(5.3 + 1.4, 6);
    expect(lift.filter(l => l === 0).length).toBe(8);
    expect(indices.length / 3).toBe(8 + 8 + 2);
    const flat: number[] = [], f2: number[] = [], f3: number[] = [], flatLift: number[] = [], f5: number[] = [];
    expect(extrusion(mesh, [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]], 5, wall, roof, flat, f2, f3, flatLift, f5)).toBe('flat');
    expect(flat.length / 3).toBe(16 + 4);
    expect(Math.max(...flatLift)).toBeCloseTo(5.3, 6);
  });
});
