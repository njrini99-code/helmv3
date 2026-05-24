'use client';

/**
 * RoundTakeaway — the hero card on the post-round review screen.
 *
 * Design contract:
 *   docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * Purpose:
 *   Post-round, the player wants ONE clear takeaway — not a syllabus.
 *   This component wraps `<HeroInsightCard>` with round-specific framing:
 *     - A pre-header that reads "Today's biggest leak" for negative-tone
 *       insights and "Today's bright spot" for celebratory / encouraging tones.
 *     - A single sentence ranking the insight's strokes-impact against the
 *       round's actual score-to-par.
 *     - Round-specific action affordances: an "Add focus area" button and
 *       an "Open in CoachHelm" deep link.
 *
 *   When no takeaway insight exists (`insight === null`), we render a calm
 *   fallback — a small card that reassures the player rather than a blank
 *   space where an analysis would normally be.
 *
 * Ownership: parent (`review/page.tsx`) fetches the insight via
 * `getRoundTakeawayInsight(playerId, roundId)` and passes it in.
 */
import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  HeroInsightCard,
  deriveTone,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { IconSparkles, IconArrowRight, IconTarget } from '@/components/icons';
import { cn } from '@/lib/utils';

export interface RoundTakeawayProps {
  /** Top insight tied to this round (or null when the round produced none). */
  insight: EvidenceInsight | null;
  /** `round.total_score - sumOf(holes.par)` — used only for the framing line.
   *  Pass `null` when the round is missing par totals. */
  roundScore: number | null;
  /** Round id — used to deep-link "Open in CoachHelm" and for the fallback copy. */
  roundId: string;
}

/**
 * Returns the framing sentence printed below the hero insight. Answers: "What
 * would closing this gap have meant for today's round?"
 */
function buildFramingLine(
  impactStrokes: number,
  roundScore: number | null,
): string {
  const abs = Math.abs(impactStrokes);
  const rounded = abs >= 1 ? Math.round(abs) : abs.toFixed(1);

  if (roundScore === null || !Number.isFinite(roundScore)) {
    return `Closing this gap would be worth ~${rounded} strokes per round.`;
  }

  // If the player shot under par, pivot to "locking in" framing. Otherwise
  // reference the scoreline the leak costed.
  if (roundScore <= 0) {
    return `Locking this in keeps ~${rounded} strokes on your scorecard.`;
  }

  return `Closing this gap would have shaved ~${rounded} strokes off today's ${roundScore > 0 ? `+${roundScore}` : roundScore}.`;
}

/**
 * Picks a pre-header ("Today's biggest leak" vs "Today's bright spot") based on
 * the insight's derived tone. Matches Rule 7 tonal mapping from the contract.
 */
function buildPreheader(
  insight: EvidenceInsight,
): { label: string; bright: boolean } {
  const tone = deriveTone(insight);
  if (tone === 'celebratory' || tone === 'encouraging') {
    return { label: "Today's bright spot", bright: true };
  }
  return { label: "Today's biggest leak", bright: false };
}

export function RoundTakeaway({ insight, roundScore, roundId }: RoundTakeawayProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleAction = useCallback(
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
            // `rateInsightAsPlayer` already routes failures through
            // `logServerError`. Swallow so a failing rating never crashes
            // the round review.
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
          // `view_drill` is handled inside DrillChips' bottom sheet. The
          // round-review uses a dedicated "Add focus area" button (below)
          // rather than the primitive's coach-only flow, so we ignore the
          // `create_focus_area` event coming from InsightCard.
          return;
      }
    },
    [router],
  );

  // ---------------------------------------------------------------------
  // Fallback — no evidence-backed takeaway for this round.
  // ---------------------------------------------------------------------
  if (!insight) {
    return (
      <section
        data-testid="round-takeaway-empty"
        aria-label="No standout takeaway from this round"
        className="rounded-2xl border border-warm-200 bg-cream-100/75 backdrop-blur-xl p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0 text-warm-500">
            <IconSparkles size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-warm-900">
              No standout takeaway from this round
            </h3>
            <p className="mt-1 text-sm text-warm-600 leading-relaxed">
              Your performance was within your usual range. Keep logging —
              the engine learns from every round.
            </p>
            <a
              href={`/golf/dashboard/rounds/${roundId}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-warm-600 hover:text-warm-900"
            >
              View round stats
              <IconArrowRight size={12} aria-hidden />
            </a>
          </div>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------
  // Hero — one takeaway, rendered large, with round-level framing.
  // ---------------------------------------------------------------------
  const preheader = buildPreheader(insight);
  const impactStrokes = Number(insight.evidence?.strokes_impact ?? 0);
  const framingLine = buildFramingLine(impactStrokes, roundScore);

  // RoundTakeaway always renders for the player audience (HeroInsightCard
  // below is hardcoded audience="player"). Point the focus-area CTA at
  // /my-development (player view) rather than /development/new (coach-only
  // route, which previously bounced the player with a "coach-only" redirect).
  const focusAreaHref = `/golf/dashboard/my-development?suggested-insight=${insight.id}`;
  const coachHelmHref = `/golf/dashboard/coachhelm?focus=${insight.id}`;

  return (
    <section
      data-testid="round-takeaway"
      data-tone={deriveTone(insight)}
      aria-label={preheader.label}
      className="space-y-3"
    >
      {/* Pre-header: frames tone of the takeaway without fighting the hero. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconSparkles
            size={14}
            className={cn(preheader.bright ? 'text-primary-600' : 'text-amber-500')}
            aria-hidden
          />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500 border-b border-warm-200/60 pb-0.5">
            {preheader.label}
          </h2>
        </div>
      </div>

      <HeroInsightCard
        insight={insight}
        audience="player"
        onAction={handleAction}
        onClick={(id) => router.push(`/golf/dashboard/coachhelm?focus=${id}`)}
      />

      {/* Framing line: what closing this gap would have meant for today. */}
      <p
        data-testid="round-takeaway-framing"
        className="px-1 text-sm italic text-warm-600 leading-relaxed"
      >
        {framingLine}
      </p>

      {/* Action row: focus area + deep link. Kept low-visual-weight so the
          primary drill chips inside HeroInsightCard stay the hero CTA. */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          data-testid="round-takeaway-add-focus"
          href={focusAreaHref}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <IconTarget size={12} aria-hidden />
          Add focus area
        </a>
        <a
          data-testid="round-takeaway-open-coachhelm"
          href={coachHelmHref}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-warm-100 text-warm-700 text-xs font-medium hover:bg-warm-200 active:scale-[0.98] transition-all"
        >
          Open in CoachHelm
          <IconArrowRight size={12} aria-hidden />
        </a>
      </div>
    </section>
  );
}
