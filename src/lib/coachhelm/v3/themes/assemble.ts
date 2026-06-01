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

    const cause = buildCause(row, byId);
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

  // 4-7. Build one ThemeNode per taxonomy entry (ALWAYS all 7).
  const themes: ThemeNode[] = THEME_TAXONOMY.map((def) => {
    const causes = (causesByCategory.get(def.category) ?? []).slice();

    // 5. Rank causes: strokesSavedPerRound desc → |strokes_impact| desc → title.
    causes.sort((a, b) => rankCauses(a, b, impactById));

    // 6. Theme sizing.
    const sgPerRound = sgByCategory[def.category] ?? null;
    const childSum = causes.reduce((acc, c) => acc + c.strokesSavedPerRound, 0);
    const themeStrokesPerRound = Math.max(Math.abs(sgPerRound ?? 0), childSum);

    // 7. Theme state.
    const state = deriveState(causes, sgPerRound);

    return {
      category: def.category,
      sgMetricId: def.sgMetricId,
      displayLabel: def.displayLabel,
      isOutcomeTheme: def.isOutcomeTheme,
      themeStrokesPerRound,
      sgPerRound,
      causes,
      state,
    };
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

/** Strokes-saved for a cause: 0 unless a non-suppressed counterfactual exists. */
function strokesSavedOf(ev: AssembledEvidence): number {
  const cf = ev.counterfactual;
  if (cf && cf.suppressed !== true) {
    const v = cf.strokes_saved_per_round;
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
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
): CauseNode {
  const ev = readEvidence(row);
  const metric = typeof ev.metric === 'string' ? ev.metric : null;

  const counterfactualSuppressed = !ev.counterfactual || ev.counterfactual.suppressed === true;
  const strokesSavedPerRound = strokesSavedOf(ev);

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
    counterfactualSuppressed,
    standingPlayerValue: ev.standing?.player_value ?? null,
    standingPgaValue: ev.standing?.pga_value ?? null,
    drivers,
    drills: toDriverLeaves(row),
    canMakePlan: metric != null,
  };
}

/** Cause comparator: strokes desc → |strokes_impact| desc → title asc. */
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
 * Theme state (honest, never-blank):
 *   - `thin`     : no causes AND (sg null OR |sg| < 0.3)
 *   - `strength` : sg != null && sg > 0.3 (green, gaining vs baseline) AND no
 *                  cause with strokesSavedPerRound >= 0.3
 *   - `leak`     : otherwise (a material cause or a negative/large sg)
 */
function deriveState(causes: CauseNode[], sgPerRound: number | null): ThemeState {
  const hasLeakCause = causes.some((c) => c.strokesSavedPerRound >= LEAK_FLOOR);

  if (causes.length === 0 && (sgPerRound == null || Math.abs(sgPerRound) < LEAK_FLOOR)) {
    return 'thin';
  }
  if (sgPerRound != null && sgPerRound > LEAK_FLOOR && !hasLeakCause) {
    return 'strength';
  }
  return 'leak';
}
