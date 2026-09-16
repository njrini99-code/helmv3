import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTreeAssetAtlas } from './tree-assets';

function fingerprint(geometry: THREE.BufferGeometry): number {
  let hash = 2166136261;
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name);
    const words = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength / 4);
    for (const word of words) hash = Math.imul(hash ^ word, 16777619);
  }
  return hash >>> 0;
}

describe('authored canopy asset atlas', () => {
  it('provides distinct deterministic multi-lobed assets within the shared source-safe size and triangle budgets', () => {
    const atlas = createTreeAssetAtlas(), repeat = createTreeAssetAtlas();
    expect(atlas.variants).toHaveLength(8);
    expect(new Set(atlas.variants.map(asset => asset.id)).size).toBe(8);
    expect(new Set(atlas.variants.map(asset => fingerprint(asset.near))).size).toBe(8);
    for (const [index, asset] of atlas.variants.entries()) {
      expect(asset.basis).toBe('authored_canopy_art');
      expect(asset.lobeCount.near).toBeGreaterThanOrEqual(6);
      expect(asset.lobeCount.distant).toBe(asset.lobeCount.near);
      expect(asset.lobeCount.far).toBe(asset.lobeCount.near);
      expect(asset.triangleCounts.near).toBeLessThanOrEqual(1500);
      expect(asset.triangleCounts.distant).toBeGreaterThanOrEqual(250);
      expect(asset.triangleCounts.distant).toBeLessThanOrEqual(500);
      expect(asset.triangleCounts.distant).toBeLessThan(asset.triangleCounts.near);
      expect(asset.triangleCounts.far).toBe(asset.lobeCount.far * 20);
      expect(asset.triangleCounts.far).toBeLessThan(asset.triangleCounts.distant);
      for (const lod of ['near', 'distant', 'far'] as const) {
        const positions = asset[lod].getAttribute('position');
        expect(fingerprint(asset[lod])).toBe(fingerprint(repeat.variants[index]![lod]));
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
          expect([x, y, z].every(Number.isFinite)).toBe(true);
          expect(Math.hypot(x, y)).toBeLessThanOrEqual(1);
          expect(z).toBeGreaterThanOrEqual(-.500001);
          expect(z).toBeLessThanOrEqual(.500001);
        }
      }
    }
    atlas.dispose(); repeat.dispose();
  });

  it('keeps all LODs in the same frame and retains their asymmetric crown outline', () => {
    const atlas = createTreeAssetAtlas();
    for (const asset of atlas.variants) {
      const near = asset.near.boundingBox!;
      for (const coarse of [asset.distant.boundingBox!, asset.far.boundingBox!]) {
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(Math.abs(near.min[axis] - coarse.min[axis])).toBeLessThan(.2);
          expect(Math.abs(near.max[axis] - coarse.max[axis])).toBeLessThan(.2);
        }
      }
      // An irregular crown has materially different horizontal extent around
      // its anchor; it cannot collapse into the old unit-sphere silhouette.
      const positions = asset.near.getAttribute('position'), support: number[] = [];
      for (let sample = 0; sample < 32; sample++) {
        const angle = sample * Math.PI / 16;
        let maximum = -Infinity;
        for (let vertex = 0; vertex < positions.count; vertex++) maximum = Math.max(maximum,
          positions.getX(vertex) * Math.cos(angle) + positions.getY(vertex) * Math.sin(angle));
        support.push(maximum);
      }
      expect(Math.max(...support) - Math.min(...support)).toBeGreaterThan(.1);
    }
    atlas.dispose();
  });

  it('supplies finite outward lighting normals and closed opaque lobe surfaces', () => {
    const atlas = createTreeAssetAtlas();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const asset of atlas.variants) for (const geometry of [asset.near, asset.distant]) {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      const edges = new Map<string, number>();
      const key = (vertex: number) => [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)].map(value => Math.round(value * 1e6)).join(',');
      for (let vertex = 0; vertex < positions.count; vertex += 3) {
        a.fromBufferAttribute(positions, vertex); b.fromBufferAttribute(positions, vertex + 1); c.fromBufferAttribute(positions, vertex + 2);
        face.crossVectors(b.sub(a), c.sub(a)).normalize();
        expect(face.length()).toBeGreaterThan(.99);
        for (let corner = 0; corner < 3; corner++) {
          normal.fromBufferAttribute(normals, vertex + corner);
          expect(normal.length()).toBeCloseTo(1, 5);
          expect(normal.dot(face)).toBeGreaterThan(.3);
          const edge = [key(vertex + corner), key(vertex + (corner + 1) % 3)].sort().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every(count => count === 2)).toBe(true);
    }
    atlas.dispose();
  });

  it('releases all owned meshes once and does not share mutable buffers between atlas owners', () => {
    const atlas = createTreeAssetAtlas(), other = createTreeAssetAtlas();
    const disposals = atlas.variants.flatMap(asset => [asset.near, asset.distant]).map(geometry => vi.spyOn(geometry, 'dispose'));
    for (const [index, asset] of atlas.variants.entries()) {
      expect(asset.near.getAttribute('position').array).not.toBe(other.variants[index]!.near.getAttribute('position').array);
      expect(asset.near.getAttribute('position').array).not.toBe(asset.distant.getAttribute('position').array);
    }
    atlas.dispose(); atlas.dispose();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalledTimes(1);
    other.dispose();
  });
});
