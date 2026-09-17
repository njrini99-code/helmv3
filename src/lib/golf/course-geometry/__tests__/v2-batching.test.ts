import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { compileVisualArtifactV2 } from '../compile-visual-artifact-v2';
import { parseContextLayer } from '../context-layer';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { HoleScene } from '../types';
import { forestGroupKey, heroPatchMaterialKey, planV2Batches, type ForestBatchInstance, type PlanV2BatchesInput, type StaticObjectPlacement } from '../v2-batching';
import { emptyRibbonSet, type PackedDisplayMesh, type PackedHeroPatch } from '../visual-artifact-v2';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);

/** Same loading pattern as compile-visual-artifact-v2.test.ts and
 * scripts/golf/course-geometry/compile-display-lods.mts: hole 7 (§111
 * canary), scene built with the context layer so the real forest/path
 * compilers see the same regions the precompile script reports. */
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

const baseLod = (triangleCount: number, heroRanges?: PackedDisplayMesh['heroRanges']): PlanV2BatchesInput['baseLod'] => ({ triangleCount, heroRanges });
const heroPatch = (id: string, triangles: number, kind: PackedHeroPatch['kind'] = 'green_complex'): PlanV2BatchesInput['heroPatches'][number] =>
  ({ id, kind, indices: new Uint32Array(triangles * 3) });
const forestInstance = (kind: ForestBatchInstance['kind'], featureId: string, overrides: Partial<ForestBatchInstance> = {}): ForestBatchInstance =>
  ({ kind, featureId, ...overrides });
const EMPTY_INPUT: PlanV2BatchesInput = { baseLod: baseLod(100), heroPatches: [], pathRibbon: null, forestInstances: [], staticObjects: [] };

describe('V2 batching planner — §93 draw-call/triangle accounting (NOT plan Task 18; see the module header for the disclaimer and master-plan.md:2693-2705)', () => {
  it('counts the base LOD as one draw, with hero footprints excluded when heroRanges are present', () => {
    const noPatches = planV2Batches({ ...EMPTY_INPUT, baseLod: baseLod(100) }, 'phone');
    expect(noPatches.batches).toEqual([{ kind: 'base_lod', draws: 1, triangles: 100, sources: ['base_lod'] }]);
    const withPatches = planV2Batches({ ...EMPTY_INPUT, baseLod: baseLod(100, [{ id: 'green_complex:g1', start: 70, count: 30 }]) }, 'phone');
    expect(withPatches.batches[0]).toEqual({ kind: 'base_lod', draws: 1, triangles: 70, sources: ['base_lod'] });
  });

  it('merges every hero patch into one draw because every kind shares the ground material', () => {
    expect(heroPatchMaterialKey('green_complex')).toBe('ground');
    expect(heroPatchMaterialKey('bunker')).toBe('ground');
    const plan = planV2Batches({ ...EMPTY_INPUT, heroPatches: [heroPatch('bunker:b1', 200, 'bunker'), heroPatch('green_complex:g1', 500), heroPatch('bunker:b2', 100, 'bunker')] }, 'phone');
    const heroBatch = plan.batches.find(batch => batch.kind === 'hero_patches:ground')!;
    expect(heroBatch).toEqual({ kind: 'hero_patches:ground', draws: 1, triangles: 800, sources: ['bunker:b1', 'bunker:b2', 'green_complex:g1'] });
    expect(plan.batches.filter(batch => batch.kind.startsWith('hero_patches')).length).toBe(1);
  });

  it('draws the cart-path ribbon exactly once no matter how many zone runs fed it, and treats a run-less ribbon as none', () => {
    const manyRuns = { runs: Array.from({ length: 14 }, (_, i) => ({ zoneId: `z${i}`, start: i, count: 1 })), triangleCount: 4000 };
    const plan = planV2Batches({ ...EMPTY_INPUT, pathRibbon: manyRuns }, 'phone');
    const ribbonBatch = plan.batches.find(batch => batch.kind === 'cart_paths')!;
    expect(ribbonBatch.draws).toBe(1);
    expect(ribbonBatch.triangles).toBe(4000);
    expect(ribbonBatch.sources.length).toBe(14);
    expect(ribbonBatch.sources).toEqual([...ribbonBatch.sources].sort());
    expect(planV2Batches({ ...EMPTY_INPUT, pathRibbon: null }, 'phone').batches.some(batch => batch.kind === 'cart_paths')).toBe(false);
    expect(planV2Batches({ ...EMPTY_INPUT, pathRibbon: emptyRibbonSet() }, 'phone').batches.some(batch => batch.kind === 'cart_paths')).toBe(false);
  });

  it('groups forest instances by kind and the hero/standard branch split by default, one instanced draw per group', () => {
    const instances: ForestBatchInstance[] = [
      ...Array.from({ length: 3 }, () => forestInstance('crown', 'woods-1', { hero: true })),
      ...Array.from({ length: 2 }, () => forestInstance('crown', 'woods-2', { hero: true })),
      ...Array.from({ length: 20 }, () => forestInstance('crown', 'woods-1')),
      ...Array.from({ length: 8 }, () => forestInstance('shrub', 'woods-1')),
      ...Array.from({ length: 12 }, () => forestInstance('mass', 'woods-2')),
    ];
    expect(forestGroupKey({ kind: 'crown', featureId: 'x', hero: true })).toBe('crown:hero');
    expect(forestGroupKey({ kind: 'crown', featureId: 'x' })).toBe('crown:standard');
    expect(forestGroupKey({ kind: 'shrub', featureId: 'x' })).toBe('shrub:standard');
    const plan = planV2Batches({ ...EMPTY_INPUT, forestInstances: instances, forestTriangleCostByGroup: { 'crown:standard': 460, 'mass:standard': 400 } }, 'phone');
    const forestBatches = plan.batches.filter(batch => batch.kind.startsWith('forest:'));
    // Fixed kind order (crown, shrub, mass) then variant order within a kind.
    expect(forestBatches.map(batch => batch.kind)).toEqual(['forest:crown:hero', 'forest:crown:standard', 'forest:shrub:standard', 'forest:mass:standard']);
    expect(forestBatches.find(batch => batch.kind === 'forest:crown:hero')).toMatchObject({ draws: 1, triangles: 0, sources: ['woods-1', 'woods-2'] }); // No cited cost supplied for hero crowns: 0, not guessed.
    expect(forestBatches.find(batch => batch.kind === 'forest:crown:standard')).toMatchObject({ draws: 1, triangles: 20 * 460, sources: ['woods-1'] });
    expect(forestBatches.find(batch => batch.kind === 'forest:shrub:standard')).toMatchObject({ draws: 1, triangles: 0, sources: ['woods-1'] });
    expect(forestBatches.find(batch => batch.kind === 'forest:mass:standard')).toMatchObject({ draws: 1, triangles: 12 * 400, sources: ['woods-2'] });
  });

  it('groups by a caller-supplied lodVariant instead, for a renderer that has already resolved per-instance LOD by distance', () => {
    const instances: ForestBatchInstance[] = [
      ...Array.from({ length: 4 }, () => forestInstance('crown', 'woods-1', { lodVariant: 'near' })),
      ...Array.from({ length: 6 }, () => forestInstance('crown', 'woods-1', { lodVariant: 'distant' })),
      ...Array.from({ length: 9 }, () => forestInstance('crown', 'woods-1', { lodVariant: 'far' })),
    ];
    const plan = planV2Batches({ ...EMPTY_INPUT, forestInstances: instances }, 'phone');
    const kinds = plan.batches.filter(batch => batch.kind.startsWith('forest:')).map(batch => batch.kind);
    expect(kinds).toEqual(['forest:crown:distant', 'forest:crown:far', 'forest:crown:near']); // variant sorts lexically within a kind.
    expect(kinds.length).toBe(3); // Worst-case fanout: three draws for one kind when every LOD is present.
  });

  it('groups static object placements by batchKey, summing triangles per group', () => {
    const placements: StaticObjectPlacement[] = [
      { id: 's-1', batchKey: 'clubhouse-v1', triangleCount: 4000 }, { id: 's-2', batchKey: 'clubhouse-v1', triangleCount: 4000 },
      { id: 's-3', batchKey: 'maintenance-v1', triangleCount: 1200 },
    ];
    const plan = planV2Batches({ ...EMPTY_INPUT, staticObjects: placements }, 'phone');
    const structureBatches = plan.batches.filter(batch => batch.kind.startsWith('structures:'));
    expect(structureBatches).toEqual([
      { kind: 'structures:clubhouse-v1', draws: 1, triangles: 8000, sources: ['s-1', 's-2'] },
      { kind: 'structures:maintenance-v1', draws: 1, triangles: 1200, sources: ['s-3'] },
    ]);
  });

  it('orders batches and each batch\'s sources deterministically, independent of input array order', () => {
    const input: PlanV2BatchesInput = {
      baseLod: baseLod(100), pathRibbon: null,
      heroPatches: [heroPatch('bunker:z', 10, 'bunker'), heroPatch('green_complex:a', 20)],
      forestInstances: [forestInstance('mass', 'w2'), forestInstance('crown', 'w1'), forestInstance('shrub', 'w1')],
      staticObjects: [{ id: 'b', batchKey: 'k2', triangleCount: 1 }, { id: 'a', batchKey: 'k1', triangleCount: 1 }],
    };
    const reversed: PlanV2BatchesInput = {
      ...input, heroPatches: [...input.heroPatches].reverse(), forestInstances: [...input.forestInstances].reverse(), staticObjects: [...input.staticObjects].reverse(),
    };
    expect(planV2Batches(reversed, 'phone')).toEqual(planV2Batches(input, 'phone'));
  });

  it('reports the phone draw-call budget and flags a plan that exceeds its hard ceiling', () => {
    const withinBudget = planV2Batches(EMPTY_INPUT, 'phone');
    expect(withinBudget.budget).toEqual({ target: 160, hard: 180, section: '§93' });
    expect(withinBudget.withinBudget).toBe(true);
    const tooManyStructures: StaticObjectPlacement[] = Array.from({ length: 200 }, (_, i) => ({ id: `obj-${i}`, batchKey: `key-${i}`, triangleCount: 10 }));
    const overBudget = planV2Batches({ ...EMPTY_INPUT, staticObjects: tooManyStructures }, 'phone');
    expect(overBudget.draws).toBeGreaterThan(180);
    expect(overBudget.withinBudget).toBe(false);
  });

  it('states no draw-call ceiling for the desktop tier (v2-budgets.ts states no number for "high"), so it is always within budget', () => {
    const plan = planV2Batches(EMPTY_INPUT, 'desktop');
    expect(plan.budget).toBeNull();
    expect(plan.withinBudget).toBe(true);
  });

  it('plans hole 7 (§111 canary) within the phone draw-call budget, deterministically', () => {
    const { mesh, scene } = loadHole7();
    const artifact = compileVisualArtifactV2(scene, mesh);
    const input: PlanV2BatchesInput = {
      baseLod: artifact.meshes.base.lod0, heroPatches: artifact.meshes.heroPatches, pathRibbon: artifact.objects.ribbons,
      forestInstances: artifact.objects.vegetation.instances, staticObjects: [],
    };
    const plan = planV2Batches(input, 'phone');
    expect(plan.withinBudget).toBe(true);
    expect(plan.draws).toBeLessThanOrEqual(plan.budget!.hard);
    // Hole 7 has real green/bunker patches, a real cart-path ribbon and real woods (probed: 4 hero patches, 15 ribbon runs, 921 forest instances across all three kinds).
    expect(plan.batches.some(batch => batch.kind === 'hero_patches:ground')).toBe(true);
    expect(plan.batches.some(batch => batch.kind === 'cart_paths')).toBe(true);
    expect(plan.batches.some(batch => batch.kind === 'forest:crown:hero')).toBe(true);
    expect(plan.batches.some(batch => batch.kind === 'forest:shrub:standard')).toBe(true);
    expect(plan.batches.some(batch => batch.kind === 'forest:mass:standard')).toBe(true);
    expect(planV2Batches(input, 'phone')).toEqual(plan); // Determinism across two calls on the same real hole.
  }, 15_000);
});
