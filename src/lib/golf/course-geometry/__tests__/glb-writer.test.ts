import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlb, writeGlb, type GlbDocument } from '../glb-writer';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const repoRoot = join(__dirname, '..', '..', '..', '..', '..');

describe('glb-writer', () => {
  it('round-trips a tiny synthetic mesh through writeGlb/parseGlb', () => {
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]); // a unit quad, z = 0
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
    const bytes = writeGlb({ meshes: [{ name: 'quad', positions, indices }] });

    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(header.getUint32(0, true)).toBe(GLB_MAGIC);
    expect(header.getUint32(4, true)).toBe(2);
    expect(header.getUint32(8, true)).toBe(bytes.byteLength);

    const { json, bin } = parseGlb(bytes);
    expect(bin).not.toBeNull();
    expect((json.asset as { version: string }).version).toBe('2.0');
    const meshes = json.meshes as { name: string; primitives: { attributes: Record<string, number>; indices: number }[] }[];
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.primitives).toHaveLength(1);
    expect(json.nodes).toEqual([{ name: 'quad', mesh: 0, rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] }]);

    const accessors = json.accessors as { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[];
    const bufferViews = json.bufferViews as { byteOffset: number; byteLength: number }[];
    const positionAccessor = accessors[meshes[0]!.primitives[0]!.attributes.POSITION!]!;
    expect(positionAccessor).toMatchObject({ componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] });
    const positionView = bufferViews[positionAccessor.bufferView]!;
    const readPositions = new Float32Array(bin!.buffer, bin!.byteOffset + positionView.byteOffset, 12);
    expect(Array.from(readPositions)).toEqual(Array.from(positions));

    const indexAccessor = accessors[meshes[0]!.primitives[0]!.indices]!;
    expect(indexAccessor).toMatchObject({ componentType: 5125, count: 6, type: 'SCALAR' });
    const indexView = bufferViews[indexAccessor.bufferView]!;
    const readIndices = new Uint32Array(bin!.buffer, bin!.byteOffset + indexView.byteOffset, 6);
    expect(Array.from(readIndices)).toEqual(Array.from(indices));
  });

  it('aligns every bufferView to 4 bytes and preserves odd-length / mixed-type attributes exactly', () => {
    const vertexCount = 7; // odd, so a 1-byte-per-vertex attribute does not itself end 4-aligned
    const positions = Float32Array.from({ length: vertexCount * 3 }, (_, i) => i * 0.5);
    const indices = Uint32Array.from([0, 1, 2, 2, 3, 4, 4, 5, 6]);
    const surfaceClass = Uint8Array.from([0, 1, 2, 3, 4, 5, 6]);
    const visualOffsetMm = Int16Array.from([-300, -150, 0, 150, 300, -1, 1]);
    const document: GlbDocument = {
      meshes: [{
        name: 'mixed', positions, indices,
        attributes: [
          { name: '_SURFACE_CLASS', array: surfaceClass, components: 1 },
          { name: '_VISUAL_OFFSET_MM', array: visualOffsetMm, components: 1 },
        ],
      }],
    };
    const { json, bin } = parseGlb(writeGlb(document));
    const bufferViews = json.bufferViews as { byteOffset: number; byteLength: number }[];
    expect(bufferViews.length).toBeGreaterThan(0);
    for (const view of bufferViews) expect(view.byteOffset % 4).toBe(0);
    expect(bin!.byteLength % 4).toBe(0);

    const meshes = json.meshes as { primitives: { attributes: Record<string, number> }[] }[];
    const accessors = json.accessors as { bufferView: number; componentType: number; count: number; normalized?: boolean }[];
    const attrs = meshes[0]!.primitives[0]!.attributes;

    const classAccessor = accessors[attrs._SURFACE_CLASS!]!;
    expect(classAccessor).toMatchObject({ componentType: 5121, count: 7 }); // UNSIGNED_BYTE
    expect(classAccessor.normalized).toBeUndefined();
    const classView = bufferViews[classAccessor.bufferView]!;
    expect(classView.byteLength).toBe(7); // exact, unpadded — padding lives between views, not inside one
    const readClass = new Uint8Array(bin!.buffer, bin!.byteOffset + classView.byteOffset, 7);
    expect(Array.from(readClass)).toEqual(Array.from(surfaceClass));

    const offsetAccessor = accessors[attrs._VISUAL_OFFSET_MM!]!;
    expect(offsetAccessor).toMatchObject({ componentType: 5122, count: 7 }); // SHORT
    const offsetView = bufferViews[offsetAccessor.bufferView]!;
    const readOffsets = new Int16Array(bin!.buffer, bin!.byteOffset + offsetView.byteOffset, 7);
    expect(Array.from(readOffsets)).toEqual(Array.from(visualOffsetMm));
  });

  it('writes one glTF primitive per group, sharing vertex accessors and slicing the shared index buffer', () => {
    const positions = Float32Array.from({ length: 5 * 3 }, (_, i) => i);
    const indices = Uint32Array.from([0, 1, 2, /* base */ 1, 2, 3, 2, 3, 4 /* hero range */]);
    const document: GlbDocument = {
      meshes: [{
        name: 'lod0', positions, indices,
        primitiveGroups: [{ name: 'base', start: 0, count: 3 }, { name: 'hero-1', start: 3, count: 6 }],
      }],
    };
    const { json, bin } = parseGlb(writeGlb(document));
    const meshes = json.meshes as { primitives: { attributes: Record<string, number>; indices: number; extras?: { name: string } }[] }[];
    expect(meshes[0]!.primitives).toHaveLength(2);
    const [base, hero] = meshes[0]!.primitives;
    expect(base!.attributes).toEqual(hero!.attributes); // shared POSITION accessor
    expect(base!.extras?.name).toBe('base');
    expect(hero!.extras?.name).toBe('hero-1');

    const accessors = json.accessors as { bufferView: number; byteOffset?: number; count: number }[];
    const bufferViews = json.bufferViews as { byteOffset: number }[];
    const baseIndexAccessor = accessors[base!.indices]!, heroIndexAccessor = accessors[hero!.indices]!;
    expect(baseIndexAccessor.bufferView).toBe(heroIndexAccessor.bufferView); // one shared index bufferView
    const indexViewOffset = bufferViews[baseIndexAccessor.bufferView]!.byteOffset;
    const readSlice = (accessor: { byteOffset?: number; count: number }) => Array.from(new Uint32Array(bin!.buffer, bin!.byteOffset + indexViewOffset + (accessor.byteOffset ?? 0), accessor.count));
    expect(readSlice(baseIndexAccessor)).toEqual([0, 1, 2]);
    expect(readSlice(heroIndexAccessor)).toEqual([1, 2, 3, 2, 3, 4]);
  });

  it('parseGlb rejects a buffer with the wrong magic number', () => {
    expect(() => parseGlb(new Uint8Array(20))).toThrow(/magic/);
  });

  it('exports hole 7 deterministically and structurally validly', () => {
    const tsx = join(repoRoot, 'node_modules/.bin/tsx');
    const script = 'scripts/golf/course-geometry/export-v2-glb.mts';
    const outA = mkdtempSync(join(tmpdir(), 'meridian-glb-a-'));
    const outB = mkdtempSync(join(tmpdir(), 'meridian-glb-b-'));
    try {
      execFileSync(tsx, [script, '--course', 'peek-n-peak-upper', '--holes', '7', '--out', outA], { cwd: repoRoot, stdio: 'pipe' });
      execFileSync(tsx, [script, '--course', 'peek-n-peak-upper', '--holes', '7', '--out', outB], { cwd: repoRoot, stdio: 'pipe' });
      const fileA = readFileSync(join(outA, 'peek-n-peak-upper', 'peek-n-peak-upper-07.glb'));
      const fileB = readFileSync(join(outB, 'peek-n-peak-upper', 'peek-n-peak-upper-07.glb'));
      expect(Buffer.compare(fileA, fileB)).toBe(0); // two independent full compiles, byte-identical

      const header = new DataView(fileA.buffer, fileA.byteOffset, fileA.byteLength);
      expect(header.getUint32(0, true)).toBe(GLB_MAGIC);
      expect(header.getUint32(4, true)).toBe(2);
      expect(header.getUint32(8, true)).toBe(fileA.byteLength); // declared length matches the actual file

      const { json, bin } = parseGlb(fileA);
      expect(bin).not.toBeNull();
      const meshes = json.meshes as { name: string; primitives: { attributes: Record<string, number> }[] }[];
      expect(meshes.length).toBeGreaterThanOrEqual(3); // at least lod0/lod1/lod2
      expect(meshes.slice(0, 3).map(m => m.name)).toEqual(['peek-n-peak-upper-07-lod0', 'peek-n-peak-upper-07-lod1', 'peek-n-peak-upper-07-lod2']);

      const bufferViews = json.bufferViews as { byteOffset: number }[];
      for (const view of bufferViews) expect(view.byteOffset % 4).toBe(0);

      // Every mesh's primitives share one attribute set plus one indices
      // accessor per primitive — recomputed independently of glb-writer.ts.
      const accessors = json.accessors as { bufferView: number; count: number; min?: number[]; max?: number[] }[];
      const expectedAccessors = meshes.reduce((sum, mesh) => sum + Object.keys(mesh.primitives[0]!.attributes).length + mesh.primitives.length, 0);
      expect(accessors.length).toBe(expectedAccessors);

      // POSITION min/max on the first mesh, recomputed from the raw bytes via
      // DataView (alignment-agnostic — a file Buffer is not guaranteed to sit
      // at a 4-byte offset in its own ArrayBuffer).
      const positionAccessor = accessors[meshes[0]!.primitives[0]!.attributes.POSITION!]!;
      const positionView = bufferViews[positionAccessor.bufferView]!;
      const raw = new DataView(bin!.buffer, bin!.byteOffset + positionView.byteOffset, positionAccessor.count * 12);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positionAccessor.count; i++) for (let c = 0; c < 3; c++) {
        const v = raw.getFloat32((i * 3 + c) * 4, true);
        min[c] = Math.min(min[c]!, v); max[c] = Math.max(max[c]!, v);
      }
      expect(positionAccessor.min).toEqual(min);
      expect(positionAccessor.max).toEqual(max);
    } finally {
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  }, 60_000);
});
