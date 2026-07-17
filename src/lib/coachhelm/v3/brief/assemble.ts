/**
 * ============================================================================
 * CoachHelm v3 · Brief — read-time engine-sentence assembler (Fixes #922, Phase 1)
 * ----------------------------------------------------------------------------
 * The Team Brief's hero + category-detail rows (`FairwayBrief.tsx`) render one
 * `CategoryInsight` per category — historically ALWAYS the hand-written
 * template prose from `generateCategoryInsights` in `team-category-insights.ts`
 * (team trend / attention-count / standout sentences, no real engine signal).
 *
 * Per docs/fairway-coachhelm-insight-rebuild.md ("The unlock"): every
 * `golf_coach_insights` row already carries `evidence.counterfactual` (a real
 * per-cause strokes-saved number) and `evidence.standing`. This module is a
 * PURE, read-time-only re-shaper — NO IO, NO schema change, NO new shot math —
 * that turns the team's already-ranked, already-visibility-filtered
 * `EvidenceInsight[]` (the SAME rows the Signals surfaces render, fetched via
 * `getInsightsForCoachWithMeta` — the insight-delivery read path) into ONE
 * genuine engine-backed sentence per Brief category: the category's top-ranked
 * visible row, framed with its real strokes-saved figure when the counterfactual
 * is live, or an honest "top signal" framing when it's diagnostic-only
 * (suppressed / absent counterfactual — e.g. a miss-bias metric).
 *
 * Honesty: a category with NO visible engine row for it is simply absent from
 * the returned map — the caller falls back to the existing template sentence.
 * We never fabricate a strokes number or invent a row.
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { AssembledEvidence } from '@/lib/coachhelm/v3/themes/types';
import { sanitizeProse } from '@/lib/coachhelm/v3/themes/assemble';

/** The Brief's category shape — just the two fields this module needs. */
export interface BriefCategoryDef {
  id: string;
  label: string;
}

/**
 * Genuine, engine-backed replacement for a hand-written `CategoryInsight`.
 * Structurally compatible with `team-category-insights.ts`'s `CategoryInsight`
 * (message/tone/metric) plus two presentation-only flags the UI uses to badge
 * the row as real (never re-derived downstream — set once, here).
 */
export interface BriefEngineInsight {
  id: string;
  message: string;
  tone: 'positive' | 'negative' | 'neutral';
  metric?: string;
  /** Always true — only engine-backed rows are ever returned by this module. */
  engineBacked: true;
  /** Realistic strokes-saved-per-round from `evidence.counterfactual`, when
   *  live (non-suppressed, finite, > 0). `null` when the row is diagnostic-only
   *  (no live counterfactual) — the UI must not render a stroke figure then. */
  strokesSavedPerRound: number | null;
}

/**
 * Brief category id → the `InsightCategory` the engine/Signals taxonomy uses.
 * `driving` is the one alias: the Brief calls the tee-game category "driving"
 * (its rating key + card label), but every `golf_coach_insights` row and the
 * Signals filter both file it under `tee` — mirrors `FairwayBrief.tsx`'s own
 * `signalsHref` alias so the engine lookup lands on the same rows the "Work on
 * Driving" deep-link does. Every other Brief category id matches verbatim.
 */
export const BRIEF_CATEGORY_TO_ENGINE_CATEGORY: Record<string, InsightCategory> = {
  driving: 'tee',
  approach: 'approach',
  short_game: 'short_game',
  putting: 'putting',
  scoring: 'scoring',
};

/** The distinct engine categories to fetch for the Brief's 5 category rows —
 *  the `categories` filter passed to `getInsightsForCoachWithMeta`. */
export function briefEngineCategories(): InsightCategory[] {
  return Array.from(new Set(Object.values(BRIEF_CATEGORY_TO_ENGINE_CATEGORY)));
}

/** Cast `row.evidence` to the runtime-real shape; null-safe (same convention
 *  as `themes/assemble.ts` — these fields are injected at generator runtime
 *  and are not on the base `InsightEvidence` type). */
function readEvidence(row: EvidenceInsight): AssembledEvidence {
  const ev = row.evidence as unknown as AssembledEvidence | null | undefined;
  return ev && typeof ev === 'object' ? ev : {};
}

/** One decimal above 0.1 strokes, two below (so a small-but-real leak like
 *  0.08 strokes/round doesn't round to a misleading "0.0"). */
function formatStrokes(v: number): string {
  const abs = Math.abs(v);
  return abs < 0.1 ? abs.toFixed(2) : abs.toFixed(1);
}

/**
 * Build ONE genuine engine-backed sentence per Brief category.
 *
 * `rankedRows` MUST already be the team's ranked + deduped + visibility-filtered
 * feed (i.e. `getInsightsForCoachWithMeta(...).data` — the same insight-delivery
 * read path the Signals surfaces use). Because that array is already best-first,
 * the FIRST row matching a category's mapped `InsightCategory` IS that
 * category's top signal — no re-ranking happens here.
 */
export function assembleBriefEngineInsights(
  rankedRows: readonly EvidenceInsight[],
  categories: readonly BriefCategoryDef[],
): Map<string, BriefEngineInsight> {
  const out = new Map<string, BriefEngineInsight>();

  for (const cat of categories) {
    const engineCategory = BRIEF_CATEGORY_TO_ENGINE_CATEGORY[cat.id];
    if (!engineCategory) continue; // unmapped Brief category — never fabricate a match

    const top = rankedRows.find((row) => row.category === engineCategory);
    if (!top) continue; // no visible engine row for this category — caller falls back

    const ev = readEvidence(top);
    const cf = ev.counterfactual;
    const strokesSaved =
      cf && cf.suppressed !== true && Number.isFinite(cf.strokes_saved_per_round) && cf.strokes_saved_per_round > 0
        ? cf.strokes_saved_per_round
        : null;

    const prose = sanitizeProse(top.content);
    const label = cat.label.toLowerCase();
    const message =
      strokesSaved != null
        ? `~${formatStrokes(strokesSaved)} strokes/round on the table in ${label} — ${prose}`
        : `Top signal in ${label}: ${prose}`;

    out.set(cat.id, {
      id: `engine-${top.id}`,
      message,
      tone: strokesSaved != null ? 'negative' : 'neutral',
      metric: typeof ev.metric === 'string' ? ev.metric : undefined,
      engineBacked: true,
      strokesSavedPerRound: strokesSaved,
    });
  }

  return out;
}
