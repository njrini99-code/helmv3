/** Meridian V2 draw-call/triangle accounting for §93 ("Task 18 (library
 * half)" per this dispatch's own task text).
 *
 * DISCLAIMER, read before trusting a "Task 18" label anywhere near this file:
 * this module is NOT the master plan's actual Task 18. The plan
 * (docs/plans/2026-09-16-meridian-v2-master-plan.md:2693-2705) defines
 * "Task 18 — InstancedMesh/BatchedMesh allocation": create a new
 * `static-object-batches.ts` that builds real THREE.InstancedMesh for
 * identical assets and THREE.BatchedMesh for heterogeneous same-material
 * candidates, measures actual draw calls on a render, and keeps only a
 * measured win, then commits. That file does not exist anywhere in this
 * repo. This module never allocates a THREE.BufferGeometry or InstancedMesh
 * (three is forbidden in this directory — Ruling R12) and never measures a
 * real render (capture/render harnesses are out of scope for this
 * dispatch); it only counts, deterministically, what a renderer *would*
 * draw from input shape. No ruling in progress.md authorizes repurposing
 * "Task 18" this way (contrast Ruling R7's explicit, recorded 11a/11b
 * split) — the real Task 18 checklist (identical assets -> InstancedMesh,
 * heterogeneous same-material -> BatchedMesh, measure draw calls, keep only
 * measured win, commit) is unimplemented. docs/plans/2026-09-16-meridian-v2-status.md:40
 * should stay "pending" for Task 18 until an agent scoped to the component
 * layer (three-world-v2.ts's neighbourhood, which this dispatch is
 * forbidden to touch) writes and measures it.
 *
 * What this module actually does: plans, never builds. It counts and groups
 * what a renderer would draw for one hole at one tier, from the same
 * compiled V2 pieces compile-visual-artifact-v2.ts already assembles — base
 * LOD with hero ranges, hero patches, the whole-hole path ribbon
 * (path-ribbon.ts), forest-edge-v2 instances and static object placements.
 * "merged into one draw" here means "counted as one draw" — the actual
 * buffer merge, and any InstancedMesh/BatchedMesh decision, belongs in the
 * file described above. Three-free; deterministic: grouping and ordering
 * never depend on input array order, only on the ids/keys the V2 compilers
 * already assign.
 *
 * §93's rules, as implemented here:
 *   - hero patches share Meridian's one ground material (§76 "keep one
 *     semantic ground program" — the ground shader classifies a patch
 *     fragment from the field atlas, not a per-kind material) and merge
 *     into one draw (`heroPatchMaterialKey`).
 *   - the whole-hole path ribbon is already one merged buffer (path-ribbon.ts;
 *     progress.md note for Tasks 14/18: never one ribbon per run) and draws
 *     once regardless of how many zones fed it.
 *   - forest instances draw once per (kind, variant) group actually present
 *     (`forestGroupKey`): §61-62's hero/standard branch split is the one
 *     LOD-relevant fact this data model carries without a camera; a caller
 *     that has already resolved a per-instance LOD by distance can tag one
 *     directly (`lodVariant`).
 *   - static objects draw once per caller-supplied `batchKey` (identical
 *     assets -> one InstancedMesh, echoing the real Task 18's own checklist
 *     text, which this module counts towards but does not itself build).
 *
 * Per-instance/per-object triangle costs that live only in the THREE layer
 * (tree-assets.ts, a GLB's own geometry) are never guessed here: a caller
 * supplies them (`forestTriangleCostByGroup`, `StaticObjectPlacement.triangleCount`)
 * and a group with instances but no supplied cost reports 0 triangles, not
 * an invented number (constraint 15/"nothing invented") — the draw *count*
 * is exact either way, since it only depends on which groups exist. */
import type { ForestInstanceKind } from './forest-edge-v2';
import type { PathRibbonRun } from './path-ribbon';
import { V2_BUDGETS, type V2BudgetTier, type V2TierBudgets } from './v2-budgets';
import type { HeroPatchKind, PackedDisplayMesh, PackedHeroPatch } from './visual-artifact-v2';

/** One statically placed object ready to batch (a structure, or any other
 * one-off asset): its own triangle count, already known from its source
 * geometry (a GLB's own accessor counts — never guessed), and a `batchKey`
 * naming what it can share a draw with. This module invents no grouping key
 * itself, only groups by whatever key it is given (original Task 18 text:
 * "identical assets -> InstancedMesh"); once Task 17's structure pipeline
 * has a stable per-item shape, a caller maps it to this one. */
export interface StaticObjectPlacement {
  id: string;
  batchKey: string;
  triangleCount: number;
}

/** The forest-instance facts this planner groups draws by. `lodVariant` lets
 * a caller that has already resolved a per-instance LOD (near/distant/far,
 * tree-assets.ts) by camera distance tag it directly — "one instanced draw
 * per tree kind/LOD variant". This three-free, camera-free planner cannot
 * resolve an LOD itself, so when `lodVariant` is absent, the only
 * LOD-relevant fact forest-edge-v2.ts's data already carries (§61-62's hero/
 * standard branch split) is used instead. */
export interface ForestBatchInstance {
  kind: ForestInstanceKind;
  featureId: string;
  hero?: true;
  lodVariant?: string;
}
export function forestGroupKey(instance: ForestBatchInstance): string {
  const variant = instance.lodVariant ?? (instance.kind === 'crown' && instance.hero ? 'hero' : 'standard');
  return `${instance.kind}:${variant}`;
}
const FOREST_KIND_ORDER: readonly ForestInstanceKind[] = ['crown', 'shrub', 'mass'];
function parseForestGroupKey(key: string): { kind: ForestInstanceKind; variant: string } {
  const at = key.indexOf(':');
  return { kind: key.slice(0, at) as ForestInstanceKind, variant: key.slice(at + 1) };
}

/** Every hero patch kind shades through Meridian's one ground program
 * (§76 "keep one semantic ground program"), so every kind maps to the same
 * key today. If a kind ever needs its own material, only this function
 * changes — the batching logic itself stays kind-agnostic. */
export function heroPatchMaterialKey(_kind: HeroPatchKind): string { return 'ground'; }

export interface PlanV2BatchesInput {
  /** The base display LOD the caller has already chosen for this render;
   * hero footprints are excluded from its own draw via `heroRanges[0].start`
   * — the same convention `compile-visual-artifact-v2.ts`'s `budgetOf` uses. */
  baseLod: Pick<PackedDisplayMesh, 'triangleCount' | 'heroRanges'>;
  heroPatches: readonly Pick<PackedHeroPatch, 'id' | 'kind' | 'indices'>[];
  /** `null`, or a ribbon with no runs (e.g. `emptyRibbonSet()`), both mean
   * no cart paths on this hole. */
  pathRibbon: { runs: readonly PathRibbonRun[]; triangleCount: number } | null;
  forestInstances: readonly ForestBatchInstance[];
  /** Per-`forestGroupKey` triangle cost, sourced by the caller from the real
   * asset (see the module header); a group with instances but no entry here
   * reports 0 triangles rather than a guessed number. */
  forestTriangleCostByGroup?: Readonly<Partial<Record<string, number>>>;
  staticObjects: readonly StaticObjectPlacement[];
}

export interface PlannedBatch { kind: string; draws: number; triangles: number; sources: string[] }
export type DrawCallBudget = NonNullable<V2TierBudgets['drawCalls']>;
export interface V2BatchPlan {
  batches: PlannedBatch[];
  draws: number;
  triangles: number;
  /** `V2_BUDGETS[tier].drawCalls`, or `null` on a tier the plan states no
   * number for (desktop/"high" — v2-budgets.ts's own documented gap, never a
   * fabricated ceiling). */
  budget: DrawCallBudget | null;
  /** `true` when `budget` is `null` (nothing to violate) or `draws` is at or
   * under the hard ceiling — the same pass/fail line `assertPathRibbon` and
   * `validateHoleBudgets` use; a value between `target` and `hard` still
   * counts as within budget (a caller wanting the warn line compares `draws`
   * to `budget.target` itself). */
  withinBudget: boolean;
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Plans the draw list for one hole at one tier (§93). Deterministic: two
 * calls with the same input in any array order produce an identical plan —
 * batches are emitted in a fixed category order (base, hero patches, cart
 * paths, forest, structures) and `sources` is always sorted. */
export function planV2Batches(input: PlanV2BatchesInput, tier: V2BudgetTier): V2BatchPlan {
  const batches: PlannedBatch[] = [];

  // Base LOD: one draw; hero footprints are excluded here (they draw as the hero-patch batch below).
  const prefix = input.baseLod.heroRanges?.[0]?.start ?? input.baseLod.triangleCount;
  batches.push({ kind: 'base_lod', draws: 1, triangles: prefix, sources: ['base_lod'] });

  // Hero patches: merge every patch that shares a material into one draw.
  const byMaterial = new Map<string, { triangles: number; sources: string[] }>();
  for (const patch of [...input.heroPatches].sort(byId)) {
    const key = heroPatchMaterialKey(patch.kind);
    const entry = byMaterial.get(key) ?? { triangles: 0, sources: [] };
    entry.triangles += patch.indices.length / 3;
    entry.sources.push(patch.id);
    byMaterial.set(key, entry);
  }
  for (const key of [...byMaterial.keys()].sort()) {
    const entry = byMaterial.get(key)!;
    batches.push({ kind: `hero_patches:${key}`, draws: 1, triangles: entry.triangles, sources: entry.sources });
  }

  // Cart paths: already one merged buffer per hole; one draw whenever it actually carries a run.
  if (input.pathRibbon && input.pathRibbon.runs.length > 0) {
    batches.push({ kind: 'cart_paths', draws: 1, triangles: input.pathRibbon.triangleCount, sources: [...input.pathRibbon.runs].map(run => run.zoneId).sort() });
  }

  // Forest: one instanced draw per (kind, variant) group actually present.
  const forestGroups = new Map<string, { count: number; featureIds: Set<string> }>();
  for (const instance of input.forestInstances) {
    const key = forestGroupKey(instance);
    const entry = forestGroups.get(key) ?? { count: 0, featureIds: new Set<string>() };
    entry.count += 1; entry.featureIds.add(instance.featureId);
    forestGroups.set(key, entry);
  }
  const forestKeys = [...forestGroups.keys()].sort((a, b) => {
    const pa = parseForestGroupKey(a), pb = parseForestGroupKey(b);
    const orderA = FOREST_KIND_ORDER.indexOf(pa.kind), orderB = FOREST_KIND_ORDER.indexOf(pb.kind);
    return orderA !== orderB ? orderA - orderB : (pa.variant < pb.variant ? -1 : pa.variant > pb.variant ? 1 : 0);
  });
  for (const key of forestKeys) {
    const entry = forestGroups.get(key)!;
    const perInstance = input.forestTriangleCostByGroup?.[key] ?? 0;
    batches.push({ kind: `forest:${key}`, draws: 1, triangles: perInstance * entry.count, sources: [...entry.featureIds].sort() });
  }

  // Static objects: one draw per distinct batch key.
  const byBatchKey = new Map<string, { triangles: number; sources: string[] }>();
  for (const object of [...input.staticObjects].sort(byId)) {
    const entry = byBatchKey.get(object.batchKey) ?? { triangles: 0, sources: [] };
    entry.triangles += object.triangleCount;
    entry.sources.push(object.id);
    byBatchKey.set(object.batchKey, entry);
  }
  for (const key of [...byBatchKey.keys()].sort()) {
    const entry = byBatchKey.get(key)!;
    batches.push({ kind: `structures:${key}`, draws: 1, triangles: entry.triangles, sources: entry.sources });
  }

  const draws = batches.reduce((sum, batch) => sum + batch.draws, 0);
  const triangles = batches.reduce((sum, batch) => sum + batch.triangles, 0);
  const drawCalls = V2_BUDGETS[tier].drawCalls;
  const budget: DrawCallBudget | null = drawCalls ? { target: drawCalls.target, hard: drawCalls.hard, section: drawCalls.section } : null;
  const withinBudget = budget == null || draws <= budget.hard;

  return { batches, draws, triangles, budget, withinBudget };
}
