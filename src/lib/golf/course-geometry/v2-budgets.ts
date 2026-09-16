/** Meridian V2 budget validator (V2 plan §10, §11, §15, Part XVII §90–96,
 * §113, §115; Task 25).
 *
 * Pure functions over the JSON a compiler already wrote (`compile-display-lods.mts`
 * per-hole report, plus the optional per-hole artifact summary Task 10 emits):
 * no file I/O here, so every rule is a plain unit test. Two tiers:
 *
 *   'phone'   the plan's "standard" tier (Part XVII "mobile performance
 *             budgets V2", calibrated on a physical iPhone in Task 27).
 *   'desktop' the plan's "high" tier (§73, Task 22 "within high-tier
 *             budget"): the plan states no numbers for it, so this table
 *             simply omits the phone-only runtime keys (`drawCalls`,
 *             `textureBytes`, `pixelBudgetMP`) rather than guessing —
 *             `undefined`, not a fabricated limit.
 *
 * This is a separate axis from `MeridianRenderQuality = 'low'|'standard'|'high'`
 * in render-quality.ts, which is a device-capability tier for the V1
 * renderer; nothing here reads or writes that type.
 *
 * Two kinds of rule:
 *   - geometry/topology (§10, §11, §15, §113, §115) apply at every tier: the
 *     plan states one number regardless of device.
 *   - runtime/bytes (§93–96) are phone-only, per the plan's own text.
 *
 * Severity follows what the plan itself calls hard vs advisory:
 *   error  a hard gate — topology (§113), the compiler's own `gate` verdict,
 *          a Hausdorff class over its §15 tolerance, a hero patch over its
 *          own assigned budget (mirrors green-display-mesh.ts
 *          `assertHeroPatch`), a hero seam over §115, the close-frame
 *          *visible* triangle count over §11's ~90k, or a draw-call count
 *          over §93's hard budget (180).
 *   warn   §10 base LOD triangle counts are "advisory and only reported"
 *          (display-mesh-v2.ts); §11's close-frame envelope is a
 *          conservative double-count (see `closeFrameTriangles`); §93's
 *          target (160, before the hard 180); §94/§95 texture bytes, which
 *          the plan states only as a "target", never a hard ceiling.
 *
 * Three-free, no `@/components` (lib boundary, visual-boundary.test.ts). */
import type { DisplayLodName, HausdorffReport, LodReport, TopologyReport } from './display-mesh-v2';
import { DISPLAY_LOD_BUDGETS, HAUSDORFF_TOLERANCES_M } from './display-mesh-v2';
import { GREEN_COMPLEX_BUDGET_CAP, HERO_BUDGETS } from './hero-patches';

export type V2BudgetTier = 'phone' | 'desktop';

export interface RangeBudget { min: number; max: number; section: string; severity: 'warn' | 'error' }
export interface CeilingBudget { max: number; section: string; severity: 'warn' | 'error' }

export interface V2TierBudgets {
  /** §10 starting triangle ranges per base LOD (display-mesh-v2.ts DISPLAY_LOD_BUDGETS). */
  lod: Record<DisplayLodName, RangeBudget>;
  /** §11 per-kind hero patch upper targets (hero-patches.ts HERO_BUDGETS), reference only:
   * the per-region/per-patch `budgetTriangles` already carried by a report is the
   * number this validator checks against (it is HERO_BUDGETS already shared by area). */
  heroKindBudgets: Readonly<Record<string, number>>;
  /** §11: a compiled hero patch must not exceed the budget its own region was
   * assigned. Already a hard throw in green-display-mesh.ts `assertHeroPatch`;
   * checked again here as an independent gate over the report JSON. */
  heroPatchOverBudget: { section: string; severity: 'error' };
  /** §11 green-complex hard cap (hero-patches.ts GREEN_COMPLEX_BUDGET_CAP):
   * a green_complex patch's own assigned budget must never exceed it. Should
   * never fire (the compiler clamps to it); a regression guard. */
  greenComplexCap: { max: number; section: string; severity: 'error' };
  /** §11 "a close Green frame may reach ~55k–90k visible terrain triangles."
   * No floor is stated — a cheap hole legitimately renders far fewer — so
   * only the 90k ceiling is enforced, on two readings of "visible" triangles
   * (see `closeFrameTriangles`): the de-duplicated estimate (error, this is
   * what §11 means by "visible") and the conservative envelope that adds the
   * full hero budget on top of LOD0 without removing the base placeholder it
   * replaces (warn — an early signal before a real patch compiler exists for
   * every hero kind). */
  closeFrameVisible: CeilingBudget;
  closeFrameEnvelope: CeilingBudget;
  /** §15 (display-mesh-v2.ts HAUSDORFF_TOLERANCES_M) per-class boundary
   * displacement, recomputed from `distancesM` rather than trusting a
   * report's own `pass` bit. */
  hausdorff: { section: string; severity: 'error' };
  /** §113 automated topology gates (degenerate/flipped/non-finite
   * normal/non-manifold edge), plus the compiler's own `gate` verdict, which
   * also covers hero-region-plan and hero-patch assertions §113 does not
   * itself enumerate but that fail the same way (see `compile-display-lods.mts`). */
  topology: { section: string; severity: 'error' };
  /** §115 hero seam height. A `HeroPatchReport` does not expose the patch's
   * `basis`, so every patch is checked against the stricter
   * visually-continuous rule (0 m); `sourceBackedMaxM` is recorded for when
   * a source-backed basis becomes visible to this validator. */
  seam: { visualM: number; sourceBackedMaxM: number; section: string; severity: 'error' };
  /** §93 draw calls. Phone tier only: the plan gives no number for "high". */
  drawCalls?: { target: number; hard: number; section: string };
  /** §94 field textures (target only) + §95 asset textures (target range),
   * summed because an artifact reports one combined `textureBytesEstimate`.
   * Both are a stated "target", never a hard ceiling, so a miss only warns. */
  textureBytes?: { fieldTargetBytes: number; assetTargetMaxBytes: number; section: string; severity: 'warn' };
  /** §96 back-buffer pixel budget. Informational: the plan states no failure
   * mode, only "measure physical iPhone" — never gated, only reported when present. */
  pixelBudgetMP?: { target: number; section: string };
}

const MB = 1_000_000;
const lodRule = (lod: DisplayLodName): RangeBudget => { const [min, max] = DISPLAY_LOD_BUDGETS[lod]; return { min, max, section: '§10', severity: 'warn' }; };

const PHONE: V2TierBudgets = {
  lod: { lod0: lodRule('lod0'), lod1: lodRule('lod1'), lod2: lodRule('lod2') },
  heroKindBudgets: HERO_BUDGETS,
  heroPatchOverBudget: { section: '§11', severity: 'error' },
  greenComplexCap: { max: GREEN_COMPLEX_BUDGET_CAP, section: '§11', severity: 'error' },
  closeFrameVisible: { max: 90_000, section: '§11', severity: 'error' },
  closeFrameEnvelope: { max: 90_000, section: '§11', severity: 'warn' },
  hausdorff: { section: '§15', severity: 'error' },
  topology: { section: '§113', severity: 'error' },
  seam: { visualM: 0, sourceBackedMaxM: 0.05, section: '§115', severity: 'error' },
  drawCalls: { target: 160, hard: 180, section: '§93' },
  textureBytes: { fieldTargetBytes: 10 * MB, assetTargetMaxBytes: 16 * MB, section: '§94/§95', severity: 'warn' },
  pixelBudgetMP: { target: 4, section: '§96' },
};
/** Everything geometry/topology is tier-independent, shared by reference
 * (never duplicated numbers to drift out of sync); the phone-only runtime
 * keys are simply absent — see the module comment. */
const DESKTOP: V2TierBudgets = {
  lod: PHONE.lod, heroKindBudgets: PHONE.heroKindBudgets, heroPatchOverBudget: PHONE.heroPatchOverBudget, greenComplexCap: PHONE.greenComplexCap,
  closeFrameVisible: PHONE.closeFrameVisible, closeFrameEnvelope: PHONE.closeFrameEnvelope, hausdorff: PHONE.hausdorff, topology: PHONE.topology, seam: PHONE.seam,
};
export const V2_BUDGETS: Readonly<Record<V2BudgetTier, V2TierBudgets>> = Object.freeze({ phone: Object.freeze(PHONE), desktop: Object.freeze(DESKTOP) });

/** Minimal read shape of `<hole>.display-lods.json` (compile-display-lods.mts):
 * only the fields this validator uses, structurally compatible with the real report. */
export interface HoleHeroRegionSummary { id: string; kind: string; triangles: number; budgetTriangles: number }
export interface HoleHeroPatchSummary {
  id: string; triangles: number; budgetTriangles: number; seamHeightMaxM: number; topology: TopologyReport;
}
export interface HoleDisplayLodsReport {
  physicalHoleKey: string;
  canonicalTriangles: number;
  /** The compiler's own hard-gate verdict: 'pass', or the assertion message that failed it. */
  gate: string;
  heroRegions: HoleHeroRegionSummary[];
  heroPatches: HoleHeroPatchSummary[];
  report: {
    lods: Record<DisplayLodName, Pick<LodReport, 'triangles' | 'withinBudget' | 'budget'>>;
    hausdorff: HausdorffReport[];
    topology: TopologyReport[];
    pass: boolean;
  };
}

/** Per-hole row of the artifact summary Task 10 (`compile-visual-artifacts-v2.mts`,
 * not yet landed) is expected to emit under output/course-geometry/visual-v2/<course>/summary.json.
 * `expectedDrawCalls`/`textureBytesEstimate` are not in that summary's planned
 * shape yet (it mirrors `MeridianVisualArtifactV2.budget` in visual-artifact-v2.ts,
 * which does carry them) — optional here so the §93/§94/§95 rules have
 * somewhere to plug in once a caller supplies them, without requiring them today. */
export interface HoleArtifactSummary {
  hole: string;
  bytes: number;
  parts: { lods: number; patches: number; atlas: number };
  triangles: number;
  patches: number;
  expectedDrawCalls?: number;
  textureBytesEstimate?: number;
}

export interface Violation { hole: string; rule: string; value: number | string; limit: number | string; severity: 'error' | 'warn'; section: string }

export interface CloseFrameTriangles { visible: number; envelope: number; heroBudgetTotal: number }
/** §11 "close Green frame" triangle count, two readings:
 *  - `envelope` = lod0.triangles + Σ heroRegions[].budgetTriangles: the
 *    brief's conservative estimate. It double-counts the base placeholder
 *    triangles a compiled patch replaces (they are frozen, unrefined, inside
 *    lod0 already — see display-mesh-v2.ts buildEdgeTable), so it overstates
 *    the true visible count; useful as an early warning before every hero
 *    kind has a patch compiler (water_edge, path today: Tasks 14/18).
 *  - `visible` = lod0.triangles, minus the placeholder triangles of regions
 *    that *do* have a compiled patch, plus those patches' real triangle
 *    counts, plus the budget ceiling of regions that don't yet have one
 *    (the best estimate available for a kind with no compiler yet). This is
 *    what actually renders and what §11's "visible terrain triangles" means. */
export function closeFrameTriangles(report: HoleDisplayLodsReport): CloseFrameTriangles {
  const lod0 = report.report.lods.lod0.triangles;
  const heroBudgetTotal = report.heroRegions.reduce((sum, r) => sum + r.budgetTriangles, 0);
  const patchedIds = new Set(report.heroPatches.map(p => p.id));
  const replacedPlaceholders = report.heroRegions.filter(r => patchedIds.has(r.id)).reduce((sum, r) => sum + r.triangles, 0);
  const unpatchedBudget = report.heroRegions.filter(r => !patchedIds.has(r.id)).reduce((sum, r) => sum + r.budgetTriangles, 0);
  const patchedTriangles = report.heroPatches.reduce((sum, p) => sum + p.triangles, 0);
  return { visible: lod0 - replacedPlaceholders + patchedTriangles + unpatchedBudget, envelope: lod0 + heroBudgetTotal, heroBudgetTotal };
}

export interface ValidateOptions {
  /** Task 10's per-hole artifact summary row, when the artifact compile has run. */
  artifact?: HoleArtifactSummary;
  /** Operator-supplied per-hole download-byte ceiling (e.g. CLI `--max-bytes`).
   * The plan and rulings name `downloadBytes` as "a gate for Task 25"
   * (visual-artifact-v2.ts budget field comment; progress.md:76) but state no
   * number anywhere — only the canonical-terrain fact "hole 7: 3.1 MB raw /
   * 650 KB gzip for 27k triangles", which is not a ceiling. Unset by default,
   * so the rule never fires on a fabricated limit. */
  maxDownloadBytes?: number;
}

const topologySummary = (t: Pick<TopologyReport, 'degenerate' | 'flipped' | 'nonFiniteNormals' | 'nonManifoldEdges'>): string =>
  `${t.degenerate}d/${t.flipped}f/${t.nonFiniteNormals}n/${t.nonManifoldEdges}m`;

/** Every §-cited rule this module knows, over one hole's already-compiled
 * report. Pure: no file I/O, no randomness, safe to call per hole per tier. */
export function validateHoleBudgets(report: HoleDisplayLodsReport, tier: V2BudgetTier, options: ValidateOptions = {}): Violation[] {
  const budgets = V2_BUDGETS[tier], hole = report.physicalHoleKey, out: Violation[] = [];
  const push = (rule: string, value: number | string, limit: number | string, severity: Violation['severity'], section: string) => { out.push({ hole, rule, value, limit, severity, section }); };

  if (report.gate !== 'pass') push('gate', report.gate, 'pass', 'error', budgets.topology.section);
  for (const t of report.report.topology) if (!t.pass) push(`topology:${t.lod}`, topologySummary(t), '0d/0f/0n/0m', 'error', budgets.topology.section);
  for (const h of report.report.hausdorff) {
    const tolerance = HAUSDORFF_TOLERANCES_M[h.class] ?? HAUSDORFF_TOLERANCES_M.other!;
    const worst = Math.max(h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2);
    if (worst > tolerance) push(`hausdorff:${h.class}`, Number(worst.toFixed(4)), tolerance, budgets.hausdorff.severity, budgets.hausdorff.section);
  }
  for (const lod of ['lod0', 'lod1', 'lod2'] as const) {
    const rule = budgets.lod[lod], triangles = report.report.lods[lod].triangles;
    if (triangles < rule.min || triangles > rule.max) push(`lod-range:${lod}`, triangles, `${rule.min}-${rule.max}`, rule.severity, rule.section);
  }
  for (const patch of report.heroPatches) {
    if (patch.triangles > patch.budgetTriangles) push(`hero-patch-budget:${patch.id}`, patch.triangles, patch.budgetTriangles, budgets.heroPatchOverBudget.severity, budgets.heroPatchOverBudget.section);
    if (!patch.topology.pass) push(`patch-topology:${patch.id}`, topologySummary(patch.topology), '0d/0f/0n/0m', 'error', budgets.topology.section);
    if (patch.seamHeightMaxM > budgets.seam.visualM) push(`seam:${patch.id}`, patch.seamHeightMaxM, budgets.seam.visualM, budgets.seam.severity, budgets.seam.section);
    if (patch.id.startsWith('green_complex:') && patch.budgetTriangles > budgets.greenComplexCap.max) push(`green-cap:${patch.id}`, patch.budgetTriangles, budgets.greenComplexCap.max, budgets.greenComplexCap.severity, budgets.greenComplexCap.section);
  }
  const frame = closeFrameTriangles(report);
  if (frame.visible > budgets.closeFrameVisible.max) push('close-frame-visible', frame.visible, budgets.closeFrameVisible.max, budgets.closeFrameVisible.severity, budgets.closeFrameVisible.section);
  if (frame.envelope > budgets.closeFrameEnvelope.max) push('close-frame-envelope', frame.envelope, budgets.closeFrameEnvelope.max, budgets.closeFrameEnvelope.severity, budgets.closeFrameEnvelope.section);

  const artifact = options.artifact;
  if (artifact?.expectedDrawCalls != null && budgets.drawCalls) {
    const { target, hard, section } = budgets.drawCalls;
    if (artifact.expectedDrawCalls > hard) push('draw-calls', artifact.expectedDrawCalls, hard, 'error', section);
    else if (artifact.expectedDrawCalls > target) push('draw-calls', artifact.expectedDrawCalls, target, 'warn', section);
  }
  if (artifact?.textureBytesEstimate != null && budgets.textureBytes) {
    const limit = budgets.textureBytes.fieldTargetBytes + budgets.textureBytes.assetTargetMaxBytes;
    if (artifact.textureBytesEstimate > limit) push('texture-bytes', artifact.textureBytesEstimate, limit, budgets.textureBytes.severity, budgets.textureBytes.section);
  }
  if (artifact?.bytes != null && options.maxDownloadBytes != null && artifact.bytes > options.maxDownloadBytes) push('download-bytes', artifact.bytes, options.maxDownloadBytes, 'error', '§106');

  return out;
}
