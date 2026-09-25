/**
 * Player root map: stored v3 insights → {@link RootMapModel}.
 *
 * Split from `build-root-map.ts` because it needs the delivery ranking
 * helpers (`dedupeBySubject`, `collapseParScoring`), which pull in the
 * ranking module; the page calls this server-side and hands the finished,
 * plain-JSON model to the client map.
 */

import {
  collapseParScoring,
  dedupeBySubject,
  type RankableEvidenceInsight,
} from '@/app/golf/actions/insight-delivery-ranking';
import {
  causalityOf,
  confidenceTier,
  diagnosisOf,
  isoDay,
  isRootArea,
  layoutRootMap,
  rootStyleFor,
  strokesPerRound,
  type CauseSeed,
  type OtherRead,
  type RootArea,
  type RootMapAreaInput,
  type RootMapModel,
  type UnsizedCause,
} from './build-root-map';

export interface RootMapInput<T extends RankableEvidenceInsight = RankableEvidenceInsight> {
  areas: RootMapAreaInput[];
  insights: T[];
  /** Date-only; insights first detected on/after it are marked new. */
  newSinceDate?: string | null;
}

function labelOf(insight: RankableEvidenceInsight): string {
  const l = insight.evidence?.metric_label;
  return typeof l === 'string' && l.trim().length > 0 ? l.trim() : insight.title;
}

function isNewSince(insight: RankableEvidenceInsight, since: string | null | undefined): boolean {
  if (!since) return false;
  const day = isoDay(insight.created_at);
  return day !== null && day >= since;
}

export function buildRootMap<T extends RankableEvidenceInsight>(input: RootMapInput<T>): RootMapModel {
  const since = input.newSinceDate ?? null;
  const losing = new Set<RootArea>(
    input.areas
      .filter((a) => typeof a.sgPerRound === 'number' && Number.isFinite(a.sgPerRound) && a.sgPerRound < 0)
      .map((a) => a.area),
  );

  // One card per issue: collapse par-scoring rows, then dedupe by subject,
  // the same helpers every delivery surface uses. Idempotent on rows that
  // were already deduped upstream.
  const insights = dedupeBySubject(collapseParScoring(input.insights));

  const sized: CauseSeed[] = [];
  const unsized: UnsizedCause[] = [];
  const other: OtherRead[] = [];
  for (const insight of insights) {
    const category = insight.category;
    const isNew = isNewSince(insight, since);
    const tier = confidenceTier(insight.evidence?.confidence);
    if (isRootArea(category) && losing.has(category)) {
      const strokes = strokesPerRound(insight.evidence);
      if (strokes !== null) {
        sized.push({
          id: insight.id,
          area: category,
          title: insight.title,
          label: labelOf(insight),
          strokes,
          style: rootStyleFor(insight.evidence),
          tier,
          causality: causalityOf(insight.evidence),
          rootCause: diagnosisOf(insight.evidence)?.root_cause ?? null,
          isNew,
        });
      } else {
        unsized.push({
          id: insight.id,
          area: category,
          title: insight.title,
          label: labelOf(insight),
          style: rootStyleFor(insight.evidence),
          tier,
          isNew,
        });
      }
    } else {
      other.push({ id: insight.id, title: insight.title, category: category ?? null, tier, isNew });
    }
  }

  return layoutRootMap({
    areas: input.areas,
    sized,
    unsized,
    other,
    newCount: insights.filter((i) => isNewSince(i, since)).length,
  });
}
