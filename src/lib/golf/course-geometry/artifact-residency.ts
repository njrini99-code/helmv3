/** Meridian V2 artifact residency policy (V2 plan Part XVI §86-89; Task 19).
 *
 * Decides, for one course round in progress, which holes' compiled V2
 * artifacts (`compile-visual-artifact-v2.ts` — base LOD0-2 meshes, hero
 * patches, the whole-hole field atlas) stay resident at full detail versus
 * the coarse LOD2-only footprint every hole keeps at all times.
 *
 * Default window (§86 "maximum detail resident: current hole"; §89 "dispose
 * previous-hole hero geometry after transition"; Task 19 checklist "previous
 * resources disposed"):
 *
 *   full detail   current hole, next hole.
 *   LOD2 only     every other hole, INCLUDING previous — disposed right
 *                 after the transition away from it, keeping only the
 *                 "compact canonical package, base adjacent-hole context"
 *                 §89 names.
 *
 * `options.keepPreviousResident` widens the window to current + next +
 * previous — §89's own exception ("...and sync review requirements
 * permit"), matching §86's "prefetch: next hole, previous hole if review
 * likely" (e.g. an active scorecard/round-review screen looking back at the
 * hole just played). Default `false`; a caller flips it on only while that
 * condition actually holds and back off once it no longer does — this
 * module has no UI/state input to infer the condition from itself. (This
 * task's own dispatch describes the design point as "current hole + next +
 * previous, LOD2-only for the rest": that is the *candidate* window this
 * option reaches, not an unconditional default — the plan's explicit
 * checklist item and §89's default clause both call for disposal absent a
 * reason to keep previous around, so disposal is what happens unless a
 * caller asks otherwise.)
 *
 * §87 "active focal residency" (within the current hole: whole-hole base
 * field + one active hero field, changing among tee/landing, approach,
 * green): `HoleArtifactBytes.heroFieldBytes` lets a caller report the
 * marginal cost of each of the current hole's hero sub-regions separately
 * from its shared whole-hole base field; `options.activeFocalRegion` then
 * charges the current hole for its base field plus only the active region,
 * instead of every region's hero cost at once. Applies to the current hole
 * only — §87 is explicitly scoped "within current hole"; a fully-resident
 * next or previous hole is still charged its whole `fullExtraBytes` lump,
 * unrestricted by focal region (§86's whole-hole prefetch, not §87).
 *
 * Pure and three-free: no fetching, no disposal, no GPU calls — this module
 * only computes the plan. The caller (the concrete runtime that implements
 * `TerrainRuntimeController`, reached through the pure call in
 * `runtime-controller.ts`) already owns load/dispose lifecycle; it decides
 * when to re-run this policy (hole transition, camera transition, idle —
 * §88) and how to act on the plan.
 *
 * Byte sizes are supplied by the caller, not read from disk here — they can
 * come from a compiled `output/course-geometry/visual-v2/<course>/summary.json`
 * when present, or from a `MeridianVisualArtifactV2.budget` directly.
 * `HoleArtifactBytes` splits each hole's LOD2 mesh from everything a full
 * hole adds on top, because `compile-visual-artifacts-v2.mts` today reports
 * only a combined `lodsBytes` for all three LODs together — a real
 * `bytesPerHole` caller must estimate `lod2Bytes` until that script splits
 * it out (a small, separately-scoped change to that script).
 *
 * Budget: `V2_BUDGETS.phone.textureBytes` (v2-budgets.ts §94/§95) is a
 * *per-hole target*, not a hard ceiling, and desktop carries no runtime
 * byte numbers at all (the plan states none for "high" tier). This module
 * reuses that same per-hole sum as the basis for a *default* total
 * residency ceiling: the sum (`fieldTargetBytes + assetTargetMaxBytes`) is
 * v2-budgets' own number, but multiplying it by the largest the window ever
 * gets (`NOMINAL_RESIDENT_WINDOW` = 3: current + next + previous, only with
 * `keepPreviousResident` set) to get a device-wide ceiling is this module's
 * own policy assumption, not a plan-stated figure — the default window
 * itself normally fills only two of these three slots. A caller with a
 * measured number (Task 27 device calibration) overrides it via
 * `maxResidentBytes`; desktop stays ungated unless the caller supplies one —
 * mirroring v2-budgets.ts leaving desktop's runtime keys `undefined`.
 *
 * Eviction priority (`evictionOrder`, and the demotion loop inside
 * `planArtifactResidency`) is fixed — previous before next — because §86
 * ranks next over previous ("if review likely" is the conditional,
 * secondary case; next is required for forward progress), not because it
 * minimizes bytes evicted. It can therefore drop a cheap previous *and* a
 * costlier next when neither alone would fit, even where evicting next
 * alone would have fit and kept a cheaper previous resident too — see the
 * "priority, not byte-optimal" test below. That is intentional per §86's
 * ranking, not a defect to fix by searching for the byte-minimal
 * combination. (An earlier version of this module's report claimed the
 * demotion loop "never drops more than necessary" — that optimality claim
 * was false, per that test, and is withdrawn here.)
 *
 * File name: this task's own file list names this module
 * `artifact-residency.ts`; the plan's Task 19 "Files" section and the SDD
 * ledger's Task 19 ruling both say `visual-residency.ts`. Kept as
 * dispatched, not renamed. */
import { V2_BUDGETS, type V2BudgetTier } from './v2-budgets';

/** §87's three hero sub-regions within one hole. */
export type HeroFocalRegion = 'tee-landing' | 'approach' | 'green';

const HERO_FOCAL_REGIONS: readonly HeroFocalRegion[] = ['tee-landing', 'approach', 'green'];

/** One hole's artifact size, split so the policy can price "LOD2 only"
 * (kept resident for every hole in the round) separately from "everything a
 * full hole adds on top" (LOD0 + LOD1 base meshes, hero patches, and the
 * whole-hole field atlas). Missing entries are treated as zero bytes. */
export interface HoleArtifactBytes {
  lod2Bytes: number;
  fullExtraBytes: number;
  /** §87 breakdown of `fullExtraBytes` by hero sub-region, for a caller
   * that also supplies `activeFocalRegion` (`ArtifactResidencyOptions`).
   * Entries are each region's OWN marginal bytes; they need not, and
   * normally will not, sum to `fullExtraBytes` — the remainder is the
   * whole-hole base field kept resident regardless of which region is
   * active. Their sum must not exceed `fullExtraBytes` (checked, and
   * thrown on, only when `activeFocalRegion` actually selects an entry
   * present here). Omit entirely, or omit the requested region, to fall
   * back to charging the whole `fullExtraBytes` lump for that hole —
   * always correct for every non-current hole, and for a caller that has
   * not measured a per-region split yet. */
  heroFieldBytes?: Partial<Record<HeroFocalRegion, number>>;
}

const EMPTY_BYTES: HoleArtifactBytes = { lod2Bytes: 0, fullExtraBytes: 0 };

/** The largest the §86 residency window ever gets: current + next +
 * previous, with `keepPreviousResident` set. Fixed regardless of how many
 * holes actually exist either side of the current one at the edges of a
 * round — the default ceiling below budgets for this worst case, not the
 * average, even though the default policy (previous disposed) usually
 * needs less. */
export const NOMINAL_RESIDENT_WINDOW = 3;

export interface ArtifactResidencyOptions {
  /** Overrides the tier default with a caller-measured ceiling, in bytes.
   * Applies to either tier; unset means "use the tier default" for phone,
   * or "no ceiling" for desktop (see the module comment). */
  maxResidentBytes?: number;
  /** Widen the window to include the previous hole at full detail instead
   * of disposing it to LOD2-only. Default `false` (§89 "dispose
   * previous-hole hero geometry after transition"; Task 19 checklist
   * "previous resources disposed"). Set `true` only while §89's own
   * exception holds — "sync review requirements permit" / §86 "previous
   * hole if review likely" — such as an active scorecard/round-review view
   * of the hole just played; this module has no state to infer that from. */
  keepPreviousResident?: boolean;
  /** §87 "within current hole: whole-hole base field + one active hero
   * field": which of the current hole's hero sub-regions is active right
   * now. Takes effect only where `bytesPerHole[currentHole].heroFieldBytes`
   * also has a matching entry; otherwise the current hole is charged its
   * full `fullExtraBytes` lump, same as when this option is omitted. Never
   * affects any hole other than `currentHole` — a fully-resident next or
   * previous hole is always charged its whole lump (§86, not §87). */
  activeFocalRegion?: HeroFocalRegion;
}

export interface ArtifactResidencyPlan {
  currentHole: string;
  /** Holes kept at full detail, highest-priority first: current, then next,
   * then previous (previous only with `keepPreviousResident`). Fewer at the
   * edges of a round; never more than three. Current is never removed, even
   * when `withinBudget` ends up `false`. */
  fullyResident: string[];
  /** Every other hole in `holesInOrder`, LOD2 only — in `holesInOrder`
   * order, not insertion/iteration order of any byte-size map. Includes the
   * previous hole whenever `keepPreviousResident` is not set (the default —
   * §89). */
  lod2Only: string[];
  /** Holes to bring to full residency, most urgent first: next before
   * previous (§88 "at hole transition" outranks "if review likely"; only
   * reachable when `keepPreviousResident` is set — previous is never
   * prefetched otherwise). Current is excluded — it is required
   * immediately, not prefetched. Only lists holes this plan actually keeps
   * in `fullyResident`; a real caller still must diff this against what it
   * has already loaded on the device — this list reflects only what the
   * policy wants resident, not what is already there. */
  prefetchOrder: string[];
  /** Of the holes still fully resident besides current, which to demote to
   * LOD2 first under further memory pressure: previous before next — a
   * fixed priority order (§86's next-outranks-previous ranking), not a
   * byte-optimal choice (see the module comment). "Demote" means full →
   * LOD2, never lower — every hole always keeps its LOD2 mesh, unlike
   * `terrain-residency.ts`'s `evictTerrain`, which drops a key entirely.
   * Only lists holes this plan actually keeps resident. */
  evictionOrder: string[];
  /** §87 sub-region charged for the current hole's hero cost, or `null`
   * when `activeFocalRegion` was not given, or the current hole has no
   * matching `heroFieldBytes` entry for it (the whole hero field is charged
   * as one unit instead — legacy/whole-hero behavior). */
  activeHeroField: HeroFocalRegion | null;
  /** Σ `lod2Bytes` over every hole in `holesInOrder`, plus Σ
   * `fullExtraBytes` (or, for the current hole with an active focal
   * region, its base-field-plus-one-region charge) over `fullyResident` —
   * the plan's "memory counter". */
  totalBytes: number;
  /** The ceiling this plan was checked against, or `null` when the tier
   * (desktop, absent an override) carries no residency ceiling. */
  budgetBytes: number | null;
  /** `budgetBytes === null || totalBytes <= budgetBytes`. `false` only when
   * even current-only-full still exceeds a real ceiling: the plan reports
   * that honestly rather than evicting the current hole to force `true`. */
  withinBudget: boolean;
}

/** The tier's default residency ceiling — see the module comment for why
 * this multiplies a v2-budgets.ts *per-hole* target by the window size
 * rather than quoting a plan-stated total. `null` when the tier has no
 * runtime byte numbers to build one from (desktop). */
export function defaultResidentBudgetBytes(tier: V2BudgetTier): number | null {
  const textureBytes = V2_BUDGETS[tier].textureBytes;
  return textureBytes ? (textureBytes.fieldTargetBytes + textureBytes.assetTargetMaxBytes) * NOMINAL_RESIDENT_WINDOW : null;
}

const bytesOf = (bytesPerHole: Readonly<Record<string, HoleArtifactBytes>>, hole: string): HoleArtifactBytes => bytesPerHole[hole] ?? EMPTY_BYTES;

/** The deterministic residency plan for `currentHole` within one round.
 * Pure: identical inputs always produce an identical plan, independent of
 * `bytesPerHole`'s own key order. Throws if `currentHole` is not present in
 * `holesInOrder` — the caller's hole list and current hole disagree, which
 * this module cannot resolve on its own. Also throws if `activeFocalRegion`
 * selects a `heroFieldBytes` entry whose sibling entries sum to more than
 * the current hole's own `fullExtraBytes` — a caller-supplied measurement
 * that cannot be true (see `HoleArtifactBytes.heroFieldBytes`). */
export function planArtifactResidency(
  currentHole: string,
  holesInOrder: readonly string[],
  bytesPerHole: Readonly<Record<string, HoleArtifactBytes>>,
  tier: V2BudgetTier,
  options: ArtifactResidencyOptions = {},
): ArtifactResidencyPlan {
  const index = holesInOrder.indexOf(currentHole);
  if (index < 0) throw new Error(`planArtifactResidency: currentHole "${currentHole}" is not in holesInOrder`);

  const next = holesInOrder[index + 1];
  const previous = index > 0 ? holesInOrder[index - 1] : undefined;
  const keepPrevious = options.keepPreviousResident ?? false;
  const resident = new Set<string>([currentHole, ...(next !== undefined ? [next] : []), ...(keepPrevious && previous !== undefined ? [previous] : [])]);

  // §87: within the current hole only, one active hero sub-region replaces
  // the whole hero-cost lump with "base field + that region" (module
  // comment). Every other hole is always charged its whole lump.
  const currentEntry = bytesOf(bytesPerHole, currentHole);
  let activeHeroField: HeroFocalRegion | null = null;
  let currentHoleCharge = currentEntry.fullExtraBytes;
  const requestedRegion = options.activeFocalRegion;
  const heroFieldBytes = currentEntry.heroFieldBytes;
  if (requestedRegion !== undefined && heroFieldBytes !== undefined) {
    const requestedRegionBytes = heroFieldBytes[requestedRegion];
    if (requestedRegionBytes !== undefined) {
      const allRegionsBytes = HERO_FOCAL_REGIONS.reduce((sum, region) => sum + (heroFieldBytes[region] ?? 0), 0);
      if (allRegionsBytes > currentEntry.fullExtraBytes) {
        throw new Error(`planArtifactResidency: "${currentHole}".heroFieldBytes sums to more than fullExtraBytes`);
      }
      activeHeroField = requestedRegion;
      currentHoleCharge = currentEntry.fullExtraBytes - allRegionsBytes + requestedRegionBytes;
    }
  }
  const fullExtra = (hole: string): number => (hole === currentHole ? currentHoleCharge : bytesOf(bytesPerHole, hole).fullExtraBytes);

  const lod2Total = holesInOrder.reduce((sum, hole) => sum + bytesOf(bytesPerHole, hole).lod2Bytes, 0);
  let totalBytes = lod2Total + [...resident].reduce((sum, hole) => sum + fullExtra(hole), 0);

  const budgetBytes = options.maxResidentBytes ?? defaultResidentBudgetBytes(tier);
  // Demote previous before next (§86 ranks next over previous); current is never a candidate.
  for (const candidate of [previous, next]) {
    if (budgetBytes == null || totalBytes <= budgetBytes) break;
    if (candidate === undefined || !resident.has(candidate)) continue;
    resident.delete(candidate);
    totalBytes -= fullExtra(candidate);
  }

  const fullyResident = [currentHole, next, previous].filter((hole): hole is string => hole !== undefined && resident.has(hole));
  const lod2Only = holesInOrder.filter(hole => !resident.has(hole));
  const notCurrentResident = (hole: string | undefined): hole is string => hole !== undefined && hole !== currentHole && resident.has(hole);
  const prefetchOrder = [next, previous].filter(notCurrentResident);
  const evictionOrder = [previous, next].filter(notCurrentResident);

  return {
    currentHole, fullyResident, lod2Only, prefetchOrder, evictionOrder, activeHeroField, totalBytes,
    budgetBytes: budgetBytes ?? null, withinBudget: budgetBytes == null || totalBytes <= budgetBytes,
  };
}
