/**
 * ============================================================================
 * CoachHelm v3 · THEMES — read-time assembler
 * ----------------------------------------------------------------------------
 * Pure, deterministic function that re-expands the THEME → DIRECT CAUSE →
 * ROOT DRIVER cascade the engine already produces but the flat read path
 * collapses (sibling dedup). NO IO, NO 'use server', NO Date.now / Math.random.
 *
 * Inputs are the SAME `EvidenceInsight[]` rows the delivery fetchers return
 * plus per-category SG (GolfStats.sg*PerRound). The contract shapes
 * (`AssembledThemes`, `ThemeNode`, `CauseNode`, `RootDriver`, `DriverLeaf`,
 * `ThemeState`) and the taxonomy (`THEME_TAXONOMY`) are LOCKED — this file
 * only produces them.
 *
 * Honesty rules (docs/fairway-coachhelm-insight-rebuild.md):
 *   - `evidence.{counterfactual,standing,source_insight_ids,composite_rule_id}`
 *     are injected at RUNTIME and are NOT on the base evidence type, so we read
 *     them via the `AssembledEvidence` cast and null-guard every access.
 *   - A suppressed/absent counterfactual contributes 0 strokes and flips
 *     `counterfactualSuppressed: true` — we NEVER fabricate a stroke number.
 *   - A composite row's `source_insight_ids` leaves are demoted out of the
 *     top level and re-attached as that cause's `drivers` (the parent→child
 *     edges the synthesis already stored).
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import {
  THEME_TAXONOMY,
  getThemeDef,
  themeScaffoldIndex,
} from '@/lib/coachhelm/v3/themes/taxonomy';
import type {
  AssembledEvidence,
  AssembledStanding,
  AssembledThemes,
  CauseNode,
  DriverLeaf,
  RootDriver,
  ThemeNode,
  ThemeState,
  ThemeTrend,
} from '@/lib/coachhelm/v3/themes/types';

/** Strokes-per-round floor below which a theme has no material leak cause. */
const LEAK_FLOOR = 0.3;

/** Below this player↔PGA span the standing has no usable orientation → fall back to the full Tour gap. */
const TEAM_FRACTION_DENOM_EPS = 1e-6;

/**
 * REALISTIC team-anchored stroke value for a cause.
 *
 * Product framing: the two honest baselines are PGA (the ceiling) and the
 * player's TEAM AVERAGE (the realistic peer target). The upstream counterfactual
 * (`tourGap`) measures the full gap to the PGA/Tour ceiling. The PRIMARY number
 * we rank/size/display is the realistic gap to TEAM AVERAGE, computed as the
 * fraction of that Tour gap that sits between the player and their team avg:
 *
 *   teamFraction = clamp( (player_value - team_avg) / (player_value - pga_value), 0, 1 )
 *   realistic    = tourGap * teamFraction
 *
 * Why this is correct and direction-agnostic: numerator and denominator share
 * the SAME orientation (both measured from `player_value`), so for a "lower is
 * better" metric (3-putts) and a "higher is better" metric (GIR%) the ratio is
 * the same positive fraction — the signs cancel. The fraction is the share of
 * the player→PGA distance the player has yet to make up just to reach their own
 * team's average.
 *
 * Guards (each → teamFraction = 1, i.e. NO team reference, fall back to the full
 * Tour gap, which the UI labels honestly as "to Tour"):
 *   - team_avg, player_value, or pga_value is null
 *   - |player_value - pga_value| < eps (player already at the ceiling → no span)
 *
 * Already-beating-team case: if the player is at or better than the team average
 * on this metric, the numerator flips sign (player→team-avg points the opposite
 * way from player→PGA), so the ratio is ≤ 0 and clamps to 0 — there is NO
 * realistic gain to be had versus peers, and PGA remains the (separate) ceiling.
 *
 * `tourGap` null/0 (suppressed/absent counterfactual) → 0, regardless of the
 * team math (we never fabricate a stroke number).
 */
function realisticTeamGap(
  tourGap: number | null,
  standing: AssembledStanding | null | undefined,
): number {
  if (tourGap == null || !Number.isFinite(tourGap)) return 0;

  const playerValue = standing?.player_value ?? null;
  const teamAvg = standing?.team_avg ?? null;
  const pgaValue = standing?.pga_value ?? null;

  // No usable team reference → fall back to the full Tour gap (teamFraction = 1).
  if (playerValue == null || teamAvg == null || pgaValue == null) return tourGap;
  const denom = playerValue - pgaValue;
  if (Math.abs(denom) < TEAM_FRACTION_DENOM_EPS) return tourGap;

  const teamFraction = clamp01((playerValue - teamAvg) / denom);
  return tourGap * teamFraction;
}

/** Clamp to [0, 1] (NaN-safe → 0). */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export interface AssembleThemesInput {
  playerId: string;
  rows: EvidenceInsight[];
  sgByCategory: Partial<Record<InsightCategory, number | null>>;
  /**
   * OPTIONAL shot-level root drivers per category (PLAY C). Built read-time by
   * `buildShotDrivers` from already-fetched raw shot rows. When present, the
   * drivers for a category are appended to the TOP-RANKED cause of that category
   * (after any composite drivers) so a standalone cause's expand surfaces a real
   * shot pattern. Attached ONLY when the category has ≥1 cause — a category with
   * shot drivers but no cause attaches to nothing (we never invent a cause).
   *
   * DEFAULT (omitted) → behavior is identical to before this field existed; the
   * function stays pure and deterministic.
   */
  shotDriversByCategory?: Partial<Record<InsightCategory, RootDriver[]>>;
  /**
   * OPTIONAL per-category SG TREND (PLAY G). Built read-time by `computeSgTrends`
   * from the player's per-round `golf_rounds.strokes_gained_*` series. When a
   * category has a trend AND it matches a theme, the trend is attached to that
   * `ThemeNode.trend`. Only the 4 SG categories ever carry a trend (outcome
   * themes get none). Honest: a category with too-few rounds in either window is
   * absent here, so its theme gets no trend (never a fabricated direction).
   *
   * DEFAULT (omitted) → behavior is identical to before this field existed; the
   * function stays pure, deterministic, and byte-identical in output.
   */
  trendByCategory?: Partial<Record<InsightCategory, ThemeTrend>>;
}

/**
 * Re-expand the hierarchical theme tree from flat insight rows + per-category
 * SG. Pure and deterministic: identical input → identical output.
 */
export function assembleThemes(input: AssembleThemesInput): AssembledThemes {
  const { playerId, rows, sgByCategory } = input;
  const shotDriversByCategory = input.shotDriversByCategory ?? {};
  const trendByCategory = input.trendByCategory ?? {};

  // 1. Index every row by id.
  const byId = new Map<string, EvidenceInsight>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }

  // 2. Classify composites + decide which claimed leaves get DEMOTED.
  //    PER-CATEGORY STROKE CONSERVATION (Change 2): a composite only OWNS (demotes
  //    and absorbs the strokes of) the leaves whose category EQUALS the composite's
  //    own category. A claimed leaf in a DIFFERENT category is NOT demoted — it
  //    stays a top-level cause in its OWN theme (its strokes stay there, never
  //    deleted, never double-counted) and is merely REFERENCED by the composite as
  //    a cross-theme driver link. This is what keeps strokes conserved per category
  //    and stops a cross-category composite from silently deleting a leaf's strokes.
  //
  //    `demotedLeafOwner` maps a demoted leaf id → the FIRST composite id that
  //    claimed it (same-category). A leaf is demoted at most once, and its strokes
  //    are absorbed by exactly that one owning composite — so even if two
  //    same-category composites both claim a leaf, its strokes are NOT double-counted.
  //    `claimedLeafIds` = every leaf any composite references (for driver threading).
  const demotedLeafOwner = new Map<string, string>();
  const claimedLeafIds = new Set<string>();
  for (const row of rows) {
    if (!row?.id) continue;
    const ev = readEvidence(row);
    if (!isComposite(ev)) continue;
    const compositeCategory = row.category ?? null;
    for (const leafId of ev.source_insight_ids ?? []) {
      if (typeof leafId !== 'string' || leafId.length === 0) continue;
      claimedLeafIds.add(leafId);
      const leaf = byId.get(leafId);
      // Demote ONLY a same-category leaf (a real, resolvable row). A dangling or
      // cross-category leaf is never demoted. First claimant wins ownership.
      if (
        leaf &&
        leaf.category != null &&
        leaf.category === compositeCategory &&
        !demotedLeafOwner.has(leafId)
      ) {
        demotedLeafOwner.set(leafId, row.id);
      }
    }
  }
  const demotedLeafIds: ReadonlySet<string> = new Set(demotedLeafOwner.keys());

  // 3. Top-level rows = rows NOT demoted into a composite. Build a CauseNode for
  //    each; resolve composite drivers (same- AND cross-category) via byId. The
  //    realistic team-anchored strokes are computed inside buildCause; a composite
  //    additionally sums the realistic strokes of its DEMOTED (same-category) leaves
  //    so the cascade carries real weight without double-counting (those leaves are
  //    no longer top-level, so their strokes live only on the composite now).
  const causesByCategory = new Map<InsightCategory, CauseNode[]>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (demotedLeafIds.has(row.id)) continue; // demoted same-category leaf — not top level
    if (!row.category) continue; // null/unknown category → skip (don't invent a theme)
    if (!getThemeDef(row.category)) continue; // unknown category → skip

    const cause = buildCause(row, byId, row.category, demotedLeafOwner);
    const bucket = causesByCategory.get(row.category);
    if (bucket) bucket.push(cause);
    else causesByCategory.set(row.category, [cause]);
  }

  // Per-cause |strokes_impact| for the ranking tiebreak (kept off the contract
  // CauseNode shape, so we capture it here from the source row's evidence).
  const impactById = new Map<string, number>();
  for (const row of rows) {
    if (!row?.id) continue;
    const ev = readEvidence(row);
    impactById.set(row.id, Math.abs(Number(ev.strokes_impact ?? 0)));
  }

  // 4-7. Build one ThemeNode per taxonomy entry, then gate empty outcome themes.
  const themes: ThemeNode[] = THEME_TAXONOMY.flatMap((def): ThemeNode[] => {
    const causes = (causesByCategory.get(def.category) ?? []).slice();

    // 5. Rank causes: strokesSavedPerRound (realistic) desc → |strokes_impact| desc → title.
    causes.sort((a, b) => rankCauses(a, b, impactById));

    // 5b. PLAY C — attach shot-level drivers to the MOST RELEVANT cause (the
    //     now top-ranked cause), APPENDED after any composite drivers. Only when
    //     the category actually has a cause to anchor on (we never invent one).
    //     Pure: the input shot-drivers are precomputed deterministically upstream.
    const shotDrivers = shotDriversByCategory[def.category];
    const topCause = causes[0];
    if (shotDrivers && shotDrivers.length > 0 && topCause) {
      topCause.drivers = [...topCause.drivers, ...shotDrivers];
    }

    // 6. SIGN-AWARE, SINGLE-SOURCE theme sizing on the REALISTIC cause values.
    //    `themeStrokesPerRound` is a college-realistic LEAK magnitude — 0 for a
    //    strength (positive SG is never a "cost"); when SG is a real loss it is
    //    the authoritative ceiling causes enumerate WITHIN (never exceed); when
    //    SG is unknown we take the DOMINANT single cause rather than free-summing
    //    overlapping sub-metric counterfactuals (which double-counts).
    const sgPerRound = sgByCategory[def.category] ?? null;
    const realisticChildSum = causes.reduce((acc, c) => acc + c.strokesSavedPerRound, 0);
    const dominantCause = causes.reduce((max, c) => Math.max(max, c.strokesSavedPerRound), 0);

    let themeStrokesPerRound: number;
    if (sgPerRound != null && sgPerRound > 0) {
      // STRENGTH — gaining vs baseline; never a cost.
      themeStrokesPerRound = 0;
    } else if (sgPerRound != null) {
      // Real category loss (sg ≤ 0): SG/round is the authoritative ceiling.
      themeStrokesPerRound = Math.min(realisticChildSum, Math.abs(sgPerRound));
    } else {
      // SG unknown (outcome themes, or SG theme with no SG data): the dominant
      // single cause, not the sum, to avoid over-summing overlapping metrics.
      themeStrokesPerRound = dominantCause;
    }

    // Theme-level honest "gap to Tour ceiling" = Σ causes' raw Tour gaps.
    const tourGapPerRound = causes.reduce((acc, c) => acc + (c.tourGapPerRound ?? 0), 0);

    // 7. Theme state (reconciled to the same realistic basis).
    const state = deriveState(causes, sgPerRound);

    const theme: ThemeNode = {
      category: def.category,
      sgMetricId: def.sgMetricId,
      displayLabel: def.displayLabel,
      isOutcomeTheme: def.isOutcomeTheme,
      themeStrokesPerRound,
      tourGapPerRound,
      sgPerRound,
      causes,
      state,
    };

    // PLAY G — attach the per-category SG trend when one was supplied for this
    // category. We only SET the key when a trend exists, so the default
    // (omitted input) leaves the output object byte-identical to before. Only
    // the 4 SG categories ever appear in `trendByCategory`; outcome themes get
    // none. Honest: a category absent from the map (too-few rounds) gets no trend.
    const trend = trendByCategory[def.category];
    if (trend) theme.trend = trend;

    // ITEM 5 — gate empty outcome themes. The 3 outcome themes (scoring /
    // course_management / pressure) have no SG metric and would otherwise be
    // permanent thin stubs; only emit them when they carry ≥1 cause. The 4 SG
    // themes are ALWAYS emitted (they carry SG context even with no causes).
    if (def.isOutcomeTheme && causes.length === 0) return [];
    return [theme];
  });

  // 8. Sort themes by magnitude desc, tiebreak by stable scaffold index asc.
  themes.sort((a, b) => {
    if (b.themeStrokesPerRound !== a.themeStrokesPerRound) {
      return b.themeStrokesPerRound - a.themeStrokesPerRound;
    }
    return themeScaffoldIndex(a.category) - themeScaffoldIndex(b.category);
  });

  const totalStrokesPerRound = themes.reduce(
    (acc, t) => acc + t.themeStrokesPerRound,
    0,
  );

  return { playerId, themes, totalStrokesPerRound };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Private helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Cast `row.evidence` to the runtime-real shape; null-safe. */
function readEvidence(row: EvidenceInsight | undefined): AssembledEvidence {
  const ev = row?.evidence as unknown as AssembledEvidence | null | undefined;
  return ev && typeof ev === 'object' ? ev : {};
}

/** A row is a composite when it claims leaves OR carries a composite rule id. */
function isComposite(ev: AssembledEvidence): boolean {
  const ids = ev.source_insight_ids;
  const hasLeaves = Array.isArray(ids) && ids.length > 0;
  const hasRule = typeof ev.composite_rule_id === 'string' && ev.composite_rule_id.length > 0;
  return hasLeaves || hasRule;
}

/**
 * RAW vs-Tour gap for a cause: the un-discounted upstream
 * `counterfactual.strokes_saved_per_round` (gap to the PGA-Tour ceiling), or
 * null when there is no usable counterfactual (suppressed / absent / NaN). This
 * is the honest "gap to Tour ceiling" number — NEVER framed as strokes lost.
 */
function tourGapOf(ev: AssembledEvidence): number | null {
  const cf = ev.counterfactual;
  if (cf && cf.suppressed !== true) {
    const v = cf.strokes_saved_per_round;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Map an insight's attached drills to plan-leaf shape (already ≤3 from delivery). */
function toDriverLeaves(row: EvidenceInsight | undefined): DriverLeaf[] {
  const drills = row?.drills ?? [];
  return drills.map((d) => ({ drill_id: d.id, slug: d.slug, title: d.title }));
}

/**
 * Build a CauseNode (with composite drivers threaded in) from a top-level row.
 *
 * `demotedLeafOwner` maps each demoted (same-category) leaf id → the id of the
 * single composite that OWNS it. It is used here to size a composite's realistic
 * weight: a composite's `strokesSavedPerRound` = Σ realistic strokes of the
 * leaves IT owns — see Change 2 in the file header. Ownership is unique, so a
 * leaf claimed by two composites contributes its strokes only once. A
 * non-composite cause sizes to its own team-anchored realistic gap.
 */
function buildCause(
  row: EvidenceInsight,
  byId: Map<string, EvidenceInsight>,
  category: InsightCategory,
  demotedLeafOwner: ReadonlyMap<string, string>,
): CauseNode {
  const ev = readEvidence(row);
  const metric = typeof ev.metric === 'string' ? ev.metric : null;
  const standing = ev.standing ?? null;

  const counterfactualSuppressed = !ev.counterfactual || ev.counterfactual.suppressed === true;
  // Honest raw gap to the PGA/Tour ceiling (null when suppressed/absent), and the
  // REALISTIC gap to TEAM AVERAGE used for ranking/sizing/display. We do NOT
  // re-apply the 0.3 stat-noise floor here — upstream already applied it on the
  // raw Tour value; re-suppressing the (smaller) realistic value would over-thin.
  const tourGapPerRound = tourGapOf(ev);
  const ownRealistic = realisticTeamGap(tourGapPerRound, standing);

  // Composite drivers: resolve each CLAIMED leaf via byId; tolerate dangling refs.
  // Both same-category (demoted) and cross-category (still top-level elsewhere)
  // leaves render as driver links so the THEME→CAUSE→DRIVER cascade stays visible.
  const composite = isComposite(ev);
  let drivers: RootDriver[] = [];
  // Composite weight: sum the realistic strokes of the SAME-CATEGORY leaves THIS
  // composite demoted. Those leaves are no longer top-level, so their strokes are
  // conserved here with no double-count. Cross-category leaves are excluded — they
  // keep their strokes in their own theme. If a composite has no same-category
  // leaves this stays 0 and the composite renders as a pure narrative link.
  let compositeSameCategoryStrokes = 0;
  let compositeSameCategoryTourGap = 0;
  let compositeOwnedLeafCount = 0;
  if (composite) {
    const ruleId = typeof ev.composite_rule_id === 'string' ? ev.composite_rule_id : undefined;
    drivers = (ev.source_insight_ids ?? [])
      .map((leafId): RootDriver | null => {
        const leaf = byId.get(leafId);
        if (!leaf) return null; // dangling ref — skip honestly
        // Accrue weight only from the leaves THIS composite OWNS (same category and
        // this row is the unique owner). Ownership is unique per leaf, so a leaf
        // claimed by two composites is counted exactly once, on its owner. We sum
        // BOTH the realistic team-gap AND the raw Tour gap from the SAME leaves, so
        // the composite's "to Tour ceiling" is the conserved sum of its leaves'
        // Tour gaps — never its own (usually absent) counterfactual. This keeps the
        // realistic ≤ Tour invariant intact (each leaf's realistic ≤ its Tour gap).
        if (leaf.category === category && demotedLeafOwner.get(leaf.id) === row.id) {
          const leafEv = readEvidence(leaf);
          const leafTourGap = tourGapOf(leafEv);
          compositeSameCategoryStrokes += realisticTeamGap(leafTourGap, leafEv.standing ?? null);
          compositeSameCategoryTourGap += leafTourGap ?? 0;
          compositeOwnedLeafCount += 1;
        }
        return {
          source: 'composite',
          composite_rule_id: ruleId,
          source_insight_ids: [leaf.id],
          title: leaf.title,
          prose: leaf.content,
          drills: toDriverLeaves(leaf),
        };
      })
      .filter((d): d is RootDriver => d !== null);
  }

  // A composite's display/ranking weight AND its Tour-ceiling number are the
  // conserved sums of its demoted same-category leaves (NOT its own often-absent
  // counterfactual), so the realistic ≤ Tour invariant holds. A normal cause uses
  // its own realistic team gap + own Tour gap. A composite that owns no
  // same-category leaves falls back to its own values (both typically 0/null).
  const ownsLeaves = composite && compositeOwnedLeafCount > 0;
  const strokesSavedPerRound = ownsLeaves ? compositeSameCategoryStrokes : ownRealistic;
  const finalTourGapPerRound = ownsLeaves ? compositeSameCategoryTourGap : tourGapPerRound;

  return {
    insight_id: row.id,
    metric,
    title: row.title,
    content: row.content,
    strokesSavedPerRound,
    tourGapPerRound: finalTourGapPerRound,
    counterfactualSuppressed,
    standingPlayerValue: standing?.player_value ?? null,
    standingPgaValue: standing?.pga_value ?? null,
    standingTeamAvgValue: standing?.team_avg ?? null,
    drivers,
    drills: toDriverLeaves(row),
    canMakePlan: metric != null,
  };
}

/** Cause comparator: realistic strokesSavedPerRound desc → |strokes_impact| desc → title asc. */
function rankCauses(
  a: CauseNode,
  b: CauseNode,
  impactById: Map<string, number>,
): number {
  if (b.strokesSavedPerRound !== a.strokesSavedPerRound) {
    return b.strokesSavedPerRound - a.strokesSavedPerRound;
  }
  // tiebreak on the (frequently-zero) base impact magnitude
  const aImpact = impactById.get(a.insight_id) ?? 0;
  const bImpact = impactById.get(b.insight_id) ?? 0;
  if (bImpact !== aImpact) return bImpact - aImpact;
  // final stability tiebreak
  return a.title.localeCompare(b.title);
}

/**
 * Theme state (honest, never-blank), reconciled to the SAME realistic basis as
 * `themeStrokesPerRound`. `LEAK_FLOOR` (0.3 strokes/round) is the materiality
 * threshold throughout: signals below it are real-but-immaterial, so we don't
 * shout about them, but we also don't mislabel them as a strength.
 *
 *   - `strength` : positive SG (> LEAK_FLOOR, a real gain vs baseline) AND no
 *                  realistic leak cause. A positive-SG category NEVER reads as a
 *                  leak. (`themeStrokesPerRound` is 0 in this branch.)
 *   - `leak`     : a material realistic magnitude (`themeStrokesPerRound >=
 *                  LEAK_FLOOR`) OR a material SG loss (`sgPerRound < -LEAK_FLOOR`).
 *   - `thin`     : everything else — no material signal either way (incl. a
 *                  small-but-real <LEAK_FLOOR signal, which is shown as a stub
 *                  rather than over-claimed as a strength or a leak).
 */
function deriveState(causes: CauseNode[], sgPerRound: number | null): ThemeState {
  const hasCauses = causes.length > 0;

  // `thin` ONLY when there is genuinely nothing to show: NO surfaced cause AND no
  // material SG signal. A theme that HAS causes is NEVER thin — the thin branch
  // hides the cause cascade, so a surfaced cause must never be routed here. (This
  // was the conflicting-signal bug: a net-positive-SG category with a real
  // sub-leak cause, and any causes-bearing theme whose realistic magnitude fell
  // below the floor, dropped to `thin` and its causes vanished.)
  if (!hasCauses && (sgPerRound == null || Math.abs(sgPerRound) < LEAK_FLOOR)) {
    return 'thin';
  }
  // A material net gain → `strength`. Positive SG never renders as a cost; any
  // causes still render beneath as "sharpen-further" items (ThemeCard shows the
  // cascade in EVERY non-thin state) — they are simply not framed as leaks.
  if (sgPerRound != null && sgPerRound > LEAK_FLOOR) {
    return 'strength';
  }
  // Otherwise — a material SG loss, or a surfaced cause to address → `leak`.
  // Causes are always visible; the ThemeCard headline stays neutral (no "to
  // gain" claim) when themeStrokesPerRound is 0.
  return 'leak';
}
