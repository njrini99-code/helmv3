'use client';

/**
 * V2ReviewSummary — post-round insight-delivery entry point.
 *
 * Design contract:
 *   docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * This component replaces the four parallel insight boxes (CausalInsights,
 * PatternsSection, PredictionCard, plus legacy prose summary) with:
 *
 *   1. ONE hero <RoundTakeaway /> at the top
 *   2. The existing AI-summary prose (kept — it adds context the hero can't)
 *   3. A collapsed <details> disclosure listing SUPPORTING insights as
 *      compact InsightCards
 *
 * Back-compat: `RoundReviewViewer.tsx` (outside Round-Review ownership) still
 * composes this component with just a `review` prop. When `takeawayInsight`
 * and `supportingInsights` are absent, the component still renders the
 * legacy prose block so that surface keeps working. When the new props are
 * present, we render the hero + disclosure layout.
 */
import { useCallback, useTransition } from 'react';
import { m } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { IconSparkles, IconTarget, IconChartBar } from '@/components/icons';
import type { IntelligentRoundReview } from '@/lib/coachhelm/v2/types';
import { cn } from '@/lib/utils';
import { InsightCard, type InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { RoundTakeaway } from './RoundTakeaway';

interface V2ReviewSummaryProps {
  review: IntelligentRoundReview;
  /** Hero takeaway — when present, the new layout renders it at the top. */
  takeawayInsight?: EvidenceInsight | null;
  /** Supporting insights rendered under a "See more analysis" disclosure. */
  supportingInsights?: EvidenceInsight[];
  /** Round id for RoundTakeaway's deep links + fallback copy. */
  roundId?: string;
  /** Round-level score-to-par used for the RoundTakeaway framing line. */
  roundScore?: number | null;
}

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Strip NaN artifacts from generated text */
function sanitizeNaN(text: string): string {
  return text
    .replace(/This occurs in NaN% of rounds with NaN% reliability\.?\s*/gi, '')
    .replace(/\bNaN%/g, '')
    .replace(/\bNaN\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function V2ReviewSummary({
  review,
  takeawayInsight,
  supportingInsights,
  roundId,
  roundScore,
}: V2ReviewSummaryProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { composedReview, reasoning, focusAreas, practicePriority } = review;
  const rawConfidence = reasoning.calibratedConfidence ?? reasoning.confidence;
  const calibratedConfidence = Number.isFinite(rawConfidence) ? rawConfidence : 0;

  const headline = composedReview?.headline ? sanitizeNaN(composedReview.headline) : '';
  const body = composedReview?.body ? sanitizeNaN(composedReview.body) : '';
  const takeaway = review.primaryTakeaway ? sanitizeNaN(review.primaryTakeaway) : '';

  // Deduplicate supporting insights against the hero so we don't render the
  // same row twice. We cap the list at 5 — past five the disclosure becomes a
  // syllabus, which is the anti-pattern this whole layout fights.
  const filteredSupporting = (supportingInsights ?? [])
    .filter((i) => !takeawayInsight || i.id !== takeawayInsight.id)
    .slice(0, 5);

  const handleSupportingAction = useCallback(
    async (action: InsightAction, insightId: string) => {
      switch (action) {
        case 'rate_helpful':
        case 'rate_not_helpful':
        case 'acknowledged':
        case 'dismissed': {
          const rating =
            action === 'rate_helpful'
              ? 'helpful'
              : action === 'rate_not_helpful'
                ? 'not_helpful'
                : action === 'acknowledged'
                  ? 'acknowledged'
                  : 'dismissed';
          try {
            await rateInsightAsPlayer({ insightId, rating });
          } catch {
            // Already logged via `logServerError` server-side.
          }
          startTransition(() => {
            router.refresh();
          });
          return;
        }
        case 'open_details':
          router.push(`/golf/dashboard/coachhelm?focus=${insightId}`);
          return;
        case 'view_drill':
        case 'create_focus_area':
          // view_drill handled inside DrillChips. create_focus_area is a
          // coach-only action on the player surface.
          return;
      }
    },
    [router],
  );

  // Decide which layout we're in. The new layout requires either a takeaway
  // OR supporting insights — without both, we have no new content to render
  // and fall back to the legacy prose block.
  const hasNewLayout =
    takeawayInsight !== undefined ||
    (supportingInsights !== undefined && supportingInsights.length > 0);

  // Legacy block is skipped when both headline + body are empty (the old
  // component bailed with `return null` in that case — preserve it).
  const hasLegacyProse = !!headline && !!body;

  if (!hasNewLayout && !hasLegacyProse) return null;

  return (
    <div className="space-y-6">
      {/* HERO: round takeaway (only in the new layout). */}
      {hasNewLayout && takeawayInsight !== undefined && (
        <RoundTakeaway
          insight={takeawayInsight}
          roundScore={roundScore ?? null}
          roundId={roundId ?? ''}
        />
      )}

      {/* AI-summary prose — kept because it gives round-level narrative the
          hero card can't replicate. When the new layout is in play we still
          render it, but subordinated below the hero. */}
      {hasLegacyProse && (
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          {/* AI Summary Card */}
          <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-warm-200 overflow-clip shadow-sm">
            <div className="px-5 py-3.5 bg-gradient-to-r from-primary-50 to-primary-50 border-b border-primary-100/60 flex items-center gap-3">
              <div className="p-1.5 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg shadow-sm shadow-primary-500/20">
                <IconSparkles size={14} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-warm-900">AI Round Analysis</h3>
              <div className="ml-auto flex items-center gap-2.5">
                <div className="h-1.5 w-20 bg-primary-200/50 rounded-full overflow-hidden">
                  <m.div
                    initial={{ width: 0 }}
                    animate={{ width: `${calibratedConfidence * 100}%` }}
                    transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'h-full rounded-full',
                      calibratedConfidence >= 0.75 ? 'bg-primary-500' :
                      calibratedConfidence >= 0.5 ? 'bg-amber-500' :
                      'bg-warm-400'
                    )}
                  />
                </div>
                <span className="text-label font-semibold text-warm-500 tabular-nums">
                  {Math.round(calibratedConfidence * 100)}%
                </span>
              </div>
            </div>

            <div className="p-6">
              <m.h4
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="text-base font-semibold text-warm-900 mb-2"
              >
                {headline}
              </m.h4>
              <m.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.4 }}
                className="text-sm text-warm-600 leading-relaxed"
              >
                {body}
              </m.p>
            </div>
          </div>

          {/* Key Takeaway + Practice Priority row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {takeaway && (
              <m.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl bg-primary-50/70 border border-primary-200/50 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 bg-primary-100 rounded-md">
                    <IconTarget size={12} className="text-primary-600" />
                  </div>
                  <span className="text-label font-semibold text-primary-700 uppercase tracking-wider">Key Takeaway</span>
                </div>
                <p className="text-sm font-medium text-primary-900 leading-relaxed">
                  {takeaway}
                </p>
              </m.div>
            )}

            {practicePriority && (
              <m.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl bg-amber-50/70 border border-amber-200/50 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 bg-amber-100 rounded-md">
                    <IconTarget size={12} className="text-amber-600" />
                  </div>
                  <span className="text-label font-semibold text-amber-700 uppercase tracking-wider">Practice Priority</span>
                </div>
                <p className="text-sm font-medium text-amber-900 leading-relaxed">
                  {practicePriority}
                </p>
              </m.div>
            )}
          </div>

          {focusAreas.length > 0 && (
            <m.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.35 }}
              className="flex items-center gap-2 flex-wrap"
            >
              <div className="flex items-center gap-1.5 text-label font-medium text-warm-500">
                <IconChartBar size={12} />
                Focus:
              </div>
              {focusAreas.map((area, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 bg-warm-100/80 text-warm-700 rounded-full font-medium border border-warm-200/50"
                >
                  {formatLabel(area)}
                </span>
              ))}
            </m.div>
          )}

          {reasoning.evidence && reasoning.evidence.length > 0 && (
            <details className="group">
              <summary className="text-label text-warm-400 cursor-pointer hover:text-warm-600 transition-colors select-none">
                Supporting evidence ({reasoning.evidence.length})
              </summary>
              <div className="mt-2 pl-3 border-l-2 border-warm-100 space-y-1.5">
                {reasoning.evidence.slice(0, 5).map((item: string, i: number) => (
                  <div key={i} className="text-label text-warm-500 leading-relaxed">
                    {item}
                  </div>
                ))}
              </div>
            </details>
          )}
        </m.div>
      )}

      {/* SUPPORTING insights — collapsed. Native <details> keeps this
          accessible without extra JS state. Coaches never see this layout —
          the round-review surface is player-only. */}
      {hasNewLayout && filteredSupporting.length > 0 && (
        <details className="group" data-testid="round-supporting-insights">
          <summary className="cursor-pointer list-none text-sm font-medium text-warm-700 hover:text-warm-900 inline-flex items-center gap-1.5">
            <span className="transition-transform group-open:rotate-90" aria-hidden>
              &rsaquo;
            </span>
            See more analysis
            <span className="text-warm-400 tabular-nums">({filteredSupporting.length})</span>
          </summary>
          <div className="mt-3 space-y-3">
            {filteredSupporting.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                density="default"
                audience="player"
                onAction={handleSupportingAction}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
