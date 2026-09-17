import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { compileVisualArtifactV2 } from '../compile-visual-artifact-v2';
import { parseContextLayer } from '../context-layer';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { HoleScene } from '../types';
import { planV2Batches } from '../v2-batching';
import { parseVisualArtifactV2, serializeVisualArtifactV2, visualArtifactV2ContentHash, type MeridianVisualArtifactV2 } from '../visual-artifact-v2';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);

/** Hole 7 (§111 canary: water/woods/green/live UI), scene built with the
 * context layer like scripts/golf/course-geometry/compile-display-lods.mts,
 * so the hero region plan includes the same path regions the script reports. */
function loadHole7(): { mesh: TerrainMesh; scene: HoleScene } {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
  const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], mesh, context);
  return { mesh, scene };
}

describe('V2 artifact compiler (§105–108; Ruling R6; Task 10)', () => {
  // Compiled once and shared: hole 7's own compile is the expensive part
  // (base LODs + hero patches + field atlas); every assertion below except
  // the determinism check reads this same artifact without mutating it.
  let mesh: TerrainMesh, scene: HoleScene, artifact: MeridianVisualArtifactV2;
  beforeAll(() => { ({ mesh, scene } = loadHole7()); artifact = compileVisualArtifactV2(scene, mesh); }, 15_000);

  it('passes the contract structural check and every LOD carries hero ranges naming the compiled patches', () => {
    expect(artifact.schemaVersion).toBe(2);
    expect(artifact.kind).toBe('meridian_visual_artifact_v2');
    for (const lod of [artifact.meshes.base.lod0, artifact.meshes.base.lod1, artifact.meshes.base.lod2]) {
      expect(lod.heroRanges?.length ?? 0).toBeGreaterThan(0);
      const ids = new Set(lod.heroRanges!.map(r => r.id));
      for (const patch of artifact.meshes.heroPatches) expect(ids.has(patch.id)).toBe(true);
    }
  });

  it('compiles exactly the green complex and standalone bunker regions into hero patches (hole 7: 1 green complex + 3 bunkers)', () => {
    expect(artifact.meshes.heroPatches.length).toBe(4);
    expect(artifact.meshes.heroPatches.filter(p => p.kind === 'green_complex').length).toBe(1);
    expect(artifact.meshes.heroPatches.filter(p => p.kind === 'bunker').length).toBe(3);
  });

  it('leaves hero field atlases and structures as documented placeholders, and fills vegetation/ribbons from Tasks 15/14', () => {
    expect(artifact.fields.heroes).toEqual([]);
    expect(artifact.fields.wholeHole.sdfLayers?.layerNames.length).toBe(5);
    expect(artifact.objects.structures).toEqual({ basis: 'unfilled_task17', count: 0, contentHash: expect.any(String), items: [] });
    expect(artifact.provenance.highResolutionTerrainSources).toEqual([]); // §8 S2 unavailable for Peek'n Peak.
    // Task 18b: hole 7 carries both real woods and real cart paths.
    const vegetation = artifact.objects.vegetation;
    expect(vegetation.basis).toBe('canonical_woods_and_context');
    expect(vegetation.count).toBe(vegetation.instances.length);
    expect(vegetation.count).toBeGreaterThan(0);
    expect(vegetation.edges.length).toBeGreaterThan(0);
    expect(vegetation.budget.hero.used).toBeGreaterThan(0);
    expect(vegetation.budget.hero.used).toBeLessThanOrEqual(vegetation.budget.hero.cap);
    const ribbons = artifact.objects.ribbons;
    expect(ribbons.count).toBe(ribbons.runs.length);
    expect(ribbons.count).toBeGreaterThan(0);
    expect(ribbons.triangleCount).toBeGreaterThan(0);
    expect(ribbons.positions.length).toBe(ribbons.vertexCount * 3);
  });

  it('reports a nonzero, self-consistent budget whose draw count matches planV2Batches at the phone tier', () => {
    expect(artifact.budget.downloadBytes).toBeGreaterThan(0);
    expect(artifact.budget.geometryBytes).toBeGreaterThan(0);
    expect(artifact.budget.textureBytesEstimate).toBeGreaterThan(0);
    expect(artifact.budget.gzipBytesEstimate).toBeNull();
    expect(Object.values(artifact.budget.trianglesByClass).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    const plan = planV2Batches({
      baseLod: artifact.meshes.base.lod0, heroPatches: artifact.meshes.heroPatches, pathRibbon: artifact.objects.ribbons,
      forestInstances: artifact.objects.vegetation.instances, staticObjects: [],
    }, 'phone');
    expect(artifact.budget.expectedDrawCalls).toBe(plan.draws);
    expect(plan.withinBudget).toBe(true);
  });

  it('round-trips serialize -> parse byte-identical', () => {
    const text = serializeVisualArtifactV2(artifact);
    const parsed = parseVisualArtifactV2(text);
    expect(serializeVisualArtifactV2(parsed)).toBe(text);
  });

  it('changes the content hash when a packed typed array is tampered', () => {
    const relief = artifact.fields.wholeHole.reliefRGBA16F.slice();
    relief[0] = (relief[0]! + 1) % 65536;
    const tampered: MeridianVisualArtifactV2 = { ...artifact, fields: { ...artifact.fields, wholeHole: { ...artifact.fields.wholeHole, reliefRGBA16F: relief } } };
    expect(visualArtifactV2ContentHash(tampered)).not.toBe(artifact.contentHash);
  });

  it('is deterministic across two compiles', () => {
    const again = compileVisualArtifactV2(scene, mesh);
    expect(again.contentHash).toBe(artifact.contentHash);
    // contentHash covers meshes/fields only (Ruling R1); vegetation and
    // ribbons carry their own digest, so a full serialize compares those too.
    expect(again.objects.vegetation.contentHash).toBe(artifact.objects.vegetation.contentHash);
    expect(again.objects.ribbons.contentHash).toBe(artifact.objects.ribbons.contentHash);
    expect(serializeVisualArtifactV2(again)).toBe(serializeVisualArtifactV2(artifact));
  }, 15_000);
});
