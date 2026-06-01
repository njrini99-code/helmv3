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
  AssembledThemes,
  CauseNode,
  DriverLeaf,
  RootDriver,
  ThemeNode,
  ThemeState,
} from '@/lib/coachhelm/v3/themes/types';

/** Strokes-per-round floor below which a theme has no material leak cause. */
const LEAK_FLOOR = 0.3;

/**
 * COLLEGE-REALISM RE-SCALE FACTORS — the fraction of the raw vs-PGA-Tour gap a
 * college player can realistically close, applied at READ TIME per category.
 *
 * WHY this exists: every upstream `counterfactual.strokes_saved_per_round` is
 * computed against the raw PGA-Tour ceiling. For a college player that gap
 * overstates realistically-closable strokes ~1.5–3×: a D1/D2 player who "fixes"
 * a leak lands at a college-good level, not Tour level. Showing the full Tour
 * gap as "strokes to gain" is quantitatively untrustworthy.
 *
 * EMPIRICAL ANCHOR: `baseline-registry.ts` carries REAL D2-vs-PGA putting
 * make-% ratios (e.g. 6–10ft D2 0.48 / PGA 0.55 ≈ 0.87; 10–15ft 0.28 / 0.31 ≈
 * 0.90). Those make-% RATIOS, however, UNDERSTATE the stroke realism: a college
 * player only closes PART of the Tour stroke gap even where the make-% gap is
 * narrow, because (a) the make-% ratio is not a stroke ratio, and (b) realistic
 * coachable improvement over a season is partial, not full convergence to the
 * better population. We therefore use CONSERVATIVE fractions BELOW the raw
 * make-% ratios — putting anchored a touch lower than its ~0.87–0.90 make-%
 * ratio to reflect that stroke convergence lags make-% convergence, and the
 * non-putting categories (no registry ratio yet) set to a uniform conservative
 * 0.6.
 *
 * This is a TRANSPARENT read-time approximation. It is explicitly a placeholder
 * pending the upstream DIVISION-baseline wiring (compute the counterfactual
 * against the player's actual division ceiling, not PGA) — that work is
 * deferred. Until then this constant is the single, documented knob, and the
 * honest raw Tour gap is preserved alongside every realistic value
 * (`tourGapPerRound`) so nothing is hidden.
 */
const COLLEGE_REALISM_FACTOR: Record<InsightCategory, number> = {
  putting: 0.55,
  approach: 0.6,
  short_game: 0.6,
  tee: 0.6,
  scoring: 0.6,
  course_management: 0.6,
  pressure: 0.6,
};

/**
 * Safe lookup of the realism factor (strict `noUncheckedIndexedAccess`). An
 * unexpected category falls back to the most conservative table value so we
 * never over-state, and never read `undefined`.
 */
function realismFactor(category: InsightCategory): number {
  return COLLEGE_REALISM_FACTOR[category] ?? 0.55;
}

export interface AssembleThemesInput {
  playerId: string;
  rows: EvidenceInsight[];
  sgByCategory: Partial<Record<InsightCategory, number | null>>;
}

/**
 * Re-expand the hierarchical theme tree from flat insight rows + per-category
 * SG. Pure and deterministic: identical input → identical output.
 */
export function assembleThemes(input: AssembleThemesInput): AssembledThemes {
  const { playerId, rows, sgByCategory } = input;

  // 1. Index every row by id.
  const byId = new Map<string, EvidenceInsight>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }

  // 2. Classify composites + collect every leaf id any composite claims.
  const claimedLeafIds = new Set<string>();
  for (const row of rows) {
    const ev = readEvidence(row);
    if (isComposite(ev)) {
      for (const leafId of ev.source_insight_ids ?? []) {
        if (typeof leafId === 'string' && leafId.length > 0) {
          claimedLeafIds.add(leafId);
        }
      }
    }
  }

  // 3. Top-level rows = rows NOT demoted to a driver of some composite. Build a
  //    CauseNode for each; resolve composite drivers via byId.
  const causesByCategory = new Map<InsightCategory, CauseNode[]>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (claimedLeafIds.has(row.id)) continue; // demoted leaf — not top level
    if (!row.category) continue; // null/unknown category → skip (don't invent a theme)
    if (!getThemeDef(row.category)) continue; // unknown category → skip

    const cause = buildCause(row, byId, row.category);
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

/** Build a CauseNode (with composite drivers threaded in) from a top-level row. */
function buildCause(
  row: EvidenceInsight,
  byId: Map<string, EvidenceInsight>,
  category: InsightCategory,
): CauseNode {
  const ev = readEvidence(row);
  const metric = typeof ev.metric === 'string' ? ev.metric : null;

  const counterfactualSuppressed = !ev.counterfactual || ev.counterfactual.suppressed === true;
  // Honest raw gap to the PGA-Tour ceiling (null when suppressed/absent), and
  // the college-realistic re-scale used for ranking/sizing/display. We do NOT
  // re-apply the 0.3 stat-noise floor here — upstream already applied it on the
  // raw Tour value; re-suppressing the (smaller) realistic value would over-thin.
  const tourGapPerRound = tourGapOf(ev);
  const strokesSavedPerRound =
    tourGapPerRound != null ? tourGapPerRound * realismFactor(category) : 0;

  // Composite drivers: resolve each claimed leaf via byId; tolerate dangling refs.
  let drivers: RootDriver[] = [];
  if (isComposite(ev)) {
    const ruleId = typeof ev.composite_rule_id === 'string' ? ev.composite_rule_id : undefined;
    drivers = (ev.source_insight_ids ?? [])
      .map((leafId): RootDriver | null => {
        const leaf = byId.get(leafId);
        if (!leaf) return null; // dangling ref — skip honestly
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

  return {
    insight_id: row.id,
    metric,
    title: row.title,
    content: row.content,
    strokesSavedPerRound,
    tourGapPerRound,
    counterfactualSuppressed,
    standingPlayerValue: ev.standing?.player_value ?? null,
    standingPgaValue: ev.standing?.pga_value ?? null,
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
