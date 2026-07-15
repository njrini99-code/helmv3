'use client';

// =============================================================================
// src/components/baseball/practice-effectiveness/PracticeEffectivenessClient.tsx
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// The Practice Effectiveness surface: "is practice working?" — measured what was
// practiced against later game/scrimmage/practice movement, with HONEST sample +
// confidence language. A READ surface (data fetched server-side, capability-gated
// on can_manage_practice) plus two coach actions: re-run the engine, and dispose
// of a review.
//
// HONESTY IS THE PRODUCT (V7). Every review states its direction AND its
// confidence tier in plain words — "associated with improvement", "not enough
// sample", "too early", "correlated, not proven". A review NEVER reads as a
// proven causal claim, and the after-scope (games vs scrimmages vs practice vs
// mixed) is always labeled. Stations with no evidence of transfer are surfaced as
// honestly as winners. DIRECTION_META / TIER_LABEL / SCOPE_LABEL / VERDICT_LABEL
// below are that honesty vocabulary — kept VERBATIM through this redesign; only
// the presentation (which ink, which atom) changed.
//
// DESIGN (P4.10 — "The Living Annual" migration): re-skinned onto the shared
// living-annual kit (docs/baseball/design-system-living-annual.md). Server-side
// data flow, the capability gate, and every action call are untouched.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PaperCard,
  Reveal,
  HairlineRule,
  SectionMasthead,
  InkBadge,
  EditorsLetter,
  StatReadout,
  KPIContentsStrip,
} from '@/components/baseball/living-annual';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconClock,
  IconInfo,
  IconSparkles,
  IconCheckCircle2,
  IconXCircle,
} from '@/components/icons';

import {
  runPracticeEffectiveness,
  setReviewDisposition,
} from '@/app/baseball/actions/practice-effectiveness';
import type {
  EffectivenessReviewView,
  EffectivenessFocusRollupView,
  EffectivenessSummary,
} from '@/lib/baseball/read-models/practice-effectiveness';
import type {
  BaseballEffectivenessDirection,
  BaseballEffectivenessConfidenceTier,
  BaseballEffectivenessAfterScope,
  BaseballEffectivenessVerdict,
} from '@/lib/types/baseball-practice-effectiveness';

interface Props {
  reviews: EffectivenessReviewView[];
  focusRollup: EffectivenessFocusRollupView[];
  summary: EffectivenessSummary;
}

type ReviewFilter = 'all' | 'measured' | 'needs_more' | 'attention';

// -----------------------------------------------------------------------------
// Honesty vocabulary — the single place direction/tier map to words + tone.
// VERBATIM (labels, keys, icons unchanged by the redesign).
// -----------------------------------------------------------------------------

const DIRECTION_META: Record<
  BaseballEffectivenessDirection,
  { label: string; tone: 'success' | 'danger' | 'warning' | 'secondary'; icon: React.ReactNode }
> = {
  improved: { label: 'Associated with improvement', tone: 'success', icon: <IconTrendingUp size={14} /> },
  worse: { label: 'Moved the wrong way', tone: 'danger', icon: <IconTrendingDown size={14} /> },
  stable: { label: 'No clear movement', tone: 'secondary', icon: <IconMinus size={14} /> },
  too_early: { label: 'Too early to read', tone: 'warning', icon: <IconClock size={14} /> },
  insufficient_sample: { label: 'Not enough sample', tone: 'secondary', icon: <IconInfo size={14} /> },
  not_tracked: { label: 'Not tracked', tone: 'secondary', icon: <IconInfo size={14} /> },
};

const TIER_LABEL: Record<BaseballEffectivenessConfidenceTier, string> = {
  too_early: 'Too early',
  not_enough_sample: 'Not enough sample',
  correlated_not_proven: 'Correlated — not proven',
  no_signal: 'No signal yet',
};

const SCOPE_LABEL: Record<BaseballEffectivenessAfterScope, string> = {
  official_game: 'Official games',
  scrimmage: 'Scrimmages',
  practice: 'Practice',
  mixed: 'Mixed scopes',
  unknown: 'Later sessions',
};

const VERDICT_LABEL: Record<BaseballEffectivenessVerdict, string> = {
  worked: 'Worked',
  needs_more_time: 'Needs more time',
  not_enough_data: 'Not enough data',
};

// Presentation-only ink for DIRECTION_META's `tone` field, in the kit's two-ink
// + neutral-graphite language (spec §4.2 — no amber, no red alert badges). The
// label + icon above already carry the honest distinction; this only decides
// which ink renders them in. `--grade-low` is the kit's existing "muted
// clay-red" band (the 20-80 ramp's below-average color), reused here for a
// "moved the wrong way" read instead of inventing a new alarm color.
const TONE_INK: Record<'success' | 'danger' | 'warning' | 'secondary', string> = {
  success: 'text-grade-plus',
  danger: 'text-grade-low',
  warning: 'text-text-secondary',
  secondary: 'text-text-secondary',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < 3_600_000) return 'just now';
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// -----------------------------------------------------------------------------

export function PracticeEffectivenessClient({ reviews, focusRollup, summary }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [isPending, startTransition] = useTransition();
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [runFailed, setRunFailed] = useState(false);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filter === 'measured') return r.confidence_tier === 'correlated_not_proven';
      if (filter === 'attention') return r.direction === 'worse';
      if (filter === 'needs_more')
        return (
          r.direction === 'too_early' ||
          r.direction === 'insufficient_sample' ||
          r.direction === 'not_tracked'
        );
      return true;
    });
  }, [reviews, filter]);

  const handleRun = () => {
    setRunMsg(null);
    setRunFailed(false);
    startTransition(async () => {
      const res = await runPracticeEffectiveness();
      if (!res.success) {
        setRunFailed(true);
        setRunMsg(res.error ?? 'Could not run the engine. Try again.');
        return;
      }
      setRunMsg(
        res.measured + res.improved + res.worse + res.tooEarly + res.insufficient === 0
          ? 'No completed objectives with a tracked metric to measure yet.'
          : `Measured ${res.measured} association(s) · ${res.improved} improved · ${res.worse} regressed · ${res.tooEarly} too early.`,
      );
      // Refresh the server component's data so the new reviews appear.
      router.refresh();
    });
  };

  return (
    <LazyMotion features={loadFeatures}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Masthead — the page's ONE job stated up front, honesty note as the lede. */}
        <SectionMasthead
          eyebrow="CoachHelm"
          title="Practice Effectiveness"
          ink="team"
          actions={
            <Button onClick={handleRun} isLoading={isPending} variant="primary" size="sm">
              {!isPending && <IconSparkles size={16} className="mr-1.5" />}
              {isPending ? 'Measuring…' : 'Re-measure'}
            </Button>
          }
        >
          <p className="max-w-2xl font-annual text-body-lg leading-relaxed text-text-secondary">
            Did what you practiced transfer to performance? CoachHelm measures
            each focus area against later game, scrimmage, and practice movement —
            and tells you honestly when it can&rsquo;t know yet.
          </p>
        </SectionMasthead>

        {runMsg && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'mt-5 flex items-start gap-2 rounded-fw-md border px-4 py-2.5 text-body-sm',
              runFailed
                ? 'border-grade-low/30 bg-grade-low/5 text-grade-low'
                : 'border-grade-plus/25 bg-grade-plus/5 text-grade-plus',
            )}
          >
            {runFailed ? (
              <IconXCircle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <IconCheckCircle2 size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{runMsg}</span>
          </div>
        )}

        {/* Honesty note — a quiet lede line, not a boxed callout. */}
        <p className="mt-6 flex items-start gap-2 max-w-2xl font-annual text-body-sm leading-relaxed text-text-tertiary">
          <IconInfo size={14} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden />
          <span>
            These are <span className="font-medium text-text-secondary">associations, not proof</span>.
            A single practice can&rsquo;t be shown to cause a game result, and box-score
            data is coarse. CoachHelm caps confidence accordingly and labels the
            scope (games vs scrimmages vs practice) every read is built from.
          </span>
        </p>

        {/* Stat strip — the at-a-glance state. */}
        <div className="mt-8">
          <KPIContentsStrip
            columns={4}
            items={[
              { label: 'Reviews', value: summary.totalReviews },
              { label: 'Improved', value: summary.improved, emphasis: summary.improved > 0 },
              { label: 'Too early', value: summary.tooEarly },
              { label: 'Need more sample', value: summary.insufficient + summary.notTracked },
            ]}
          />
        </div>

        <HairlineRule ink="hairline" className="mt-8" />

        <div className="mt-8 grid gap-10 lg:grid-cols-3">
          {/* Reviews column */}
          <section className="lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                Measurements
              </h2>
              <div className="flex items-center gap-1" role="tablist" aria-label="Filter measurements">
                {(
                  [
                    ['all', 'All'],
                    ['measured', 'Measured'],
                    ['attention', 'Attention'],
                    ['needs_more', 'Need data'],
                  ] as [ReviewFilter, string][]
                ).map(([f, lbl]) => (
                  <Button
                    key={f}
                    type="button"
                    variant="ghost"
                    size="sm"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-fw-sm px-2.5 py-1 text-microbadge font-semibold uppercase tracking-[0.12em]',
                      filter === f
                        ? 'bg-grade-plus text-white hover:bg-grade-plus'
                        : 'text-text-tertiary hover:bg-grade-plus/[0.06] hover:text-text-secondary',
                    )}
                  >
                    {lbl}
                  </Button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EditorsLetter
                title={
                  reviews.length === 0
                    ? 'No effectiveness measurements yet'
                    : 'Nothing matches this filter'
                }
                body={
                  reviews.length === 0
                    ? 'Add a measurable objective to a practice (a focus area + a tracked metric), mark it completed, then re-measure. CoachHelm will connect it to later performance.'
                    : 'Try a different filter to see more measurements.'
                }
                live={reviews.length === 0}
              />
            ) : (
              <div className="space-y-4">
                {filtered.map((r, idx) => (
                  <Reveal key={r.id} staggerIndex={Math.min(idx, 10)}>
                    <ReviewCard review={r} disabled={isPending} onRefresh={() => router.refresh()} />
                  </Reveal>
                ))}
              </div>
            )}
          </section>

          {/* Focus roll-up column */}
          <section>
            <h2 className="mb-4 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              By focus area
            </h2>
            {focusRollup.length === 0 ? (
              <EditorsLetter
                title="No focus areas yet"
                body="Once you measure objectives, each focus area rolls up here with its transfer signal."
              />
            ) : (
              <ol className="space-y-3">
                {focusRollup.map((f, idx) => (
                  <li key={`${f.focusArea}-${f.metricId ?? ''}`}>
                    <Reveal staggerIndex={Math.min(idx, 10)}>
                      <FocusRollupItem focus={f} />
                    </Reveal>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </LazyMotion>
  );
}

// -----------------------------------------------------------------------------

function ReviewCard({
  review,
  disabled,
  onRefresh,
}: {
  review: EffectivenessReviewView;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const dir = DIRECTION_META[review.direction];
  const dirInk = TONE_INK[dir.tone];
  const tierLabel = TIER_LABEL[review.confidence_tier];
  const confPct = review.confidence != null ? Math.round(review.confidence * 100) : null;
  const resolved = review.disposition === 'resolved' || review.disposition === 'converted_to_task';

  const dispose = (
    disposition: 'resolved' | 'dismissed',
    verdict?: BaseballEffectivenessVerdict,
  ) => {
    startTransition(async () => {
      await setReviewDisposition({ reviewId: review.id, disposition, verdict });
      // Refresh the parent server component data so the disposition change is
      // immediately visible without a manual page reload.
      onRefresh();
    });
  };

  return (
    <PaperCard className={cn('px-5 py-5', resolved && 'opacity-70 transition-opacity')}>
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <span className={cn('inline-flex items-center', dirInk)} aria-hidden>
          {dir.icon}
        </span>
        <InkBadge label={dir.label} tone="neutral" className={dirInk} />
        <InkBadge label={tierLabel} tone="neutral" />
        {confPct != null && (
          <span className="inline-flex items-baseline gap-1 text-microbadge uppercase tracking-[0.12em] text-text-tertiary">
            confidence
            <StatReadout value={confPct} suffix="%" className="text-microbadge normal-case tracking-normal" />
          </span>
        )}
        {resolved && review.verdict && (
          <InkBadge
            label={VERDICT_LABEL[review.verdict]}
            tone={review.verdict === 'worked' ? 'team' : 'neutral'}
          />
        )}
      </div>

      <h3 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">{review.focus_area}</h3>
      <p className="mt-0.5 text-microbadge uppercase tracking-[0.1em] text-text-tertiary">
        {review.metricLabel}
        {review.practice_title ? ` · ${review.practice_title}` : ''} ·{' '}
        {SCOPE_LABEL[review.after_scope]}
      </p>

      <p className="mt-3 max-w-prose font-annual text-body-sm leading-relaxed text-text-secondary">
        {review.conclusion}
      </p>

      {/* Before / after sample line — real figures, always through StatReadout. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-microbadge uppercase tracking-[0.1em] text-text-tertiary">
        <span className="inline-flex items-baseline gap-1">
          Before
          <StatReadout value={review.sample_before} className="normal-case tracking-normal text-body-sm text-text-primary" />
          session(s)
        </span>
        <span className="inline-flex items-baseline gap-1">
          After
          <StatReadout value={review.sample_after} className="normal-case tracking-normal text-body-sm text-text-primary" />
          session(s)
        </span>
        {review.player_ids.length > 0 && (
          <span className="inline-flex items-baseline gap-1">
            <StatReadout value={review.player_ids.length} className="normal-case tracking-normal text-body-sm text-text-primary" />
            player(s)
          </span>
        )}
      </div>

      {/* Confounders — what CoachHelm cannot control */}
      {review.confoundersParsed.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-fw-md bg-[var(--paper-canvas)] p-3">
          {review.confoundersParsed.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-body-sm text-text-tertiary">
              <IconInfo size={12} className="mt-0.5 shrink-0 text-text-tertiary" />
              {c.reason}
            </li>
          ))}
        </ul>
      )}

      {/* Recommended next action */}
      {review.recommendedActionParsed && (
        <div className="mt-3 flex items-start gap-1.5 text-body-sm text-text-secondary">
          <IconSparkles size={13} className="mt-0.5 shrink-0 text-grade-plus" />
          <span className="font-medium">{review.recommendedActionParsed.label}</span>
        </div>
      )}

      {/* Footer: timestamp + verdict buttons */}
      <div className="mt-4 border-t border-[color:var(--hairline)] pt-3">
        <span className="flex items-center gap-1 text-microbadge uppercase tracking-[0.1em] text-text-tertiary">
          <IconClock size={12} />
          {relativeTime(review.generated_at)}
        </span>
        {!resolved && (
          <div
            className={cn(
              'mt-3 grid grid-cols-2 gap-2 transition-opacity duration-200',
              (isPending || disabled) && 'pointer-events-none opacity-40',
            )}
            role="group"
            aria-label="Verdict"
          >
            <Button
              variant="success"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => dispose('resolved', 'worked')}
            >
              Worked
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => dispose('resolved', 'needs_more_time')}
            >
              Needs More Time
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => dispose('resolved', 'not_enough_data')}
            >
              Not Enough Data
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => dispose('dismissed')}
            >
              Change Approach
            </Button>
          </div>
        )}
      </div>
    </PaperCard>
  );
}

function FocusRollupItem({ focus }: { focus: EffectivenessFocusRollupView }) {
  const badge = focus.positiveSignal
    ? { label: 'Return', tone: 'team' as const }
    : focus.noEvidenceOfTransfer
      ? { label: 'No evidence', tone: 'neutral' as const }
      : { label: 'Mixed', tone: 'neutral' as const };

  return (
    <PaperCard grain={false} className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-annual text-body-sm font-medium text-text-primary">{focus.focusArea}</p>
          <p className="truncate text-microbadge uppercase tracking-[0.1em] text-text-tertiary">{focus.metricLabel}</p>
        </div>
        <InkBadge label={badge.label} tone={badge.tone} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-microbadge uppercase tracking-[0.1em] text-text-tertiary">
        <span className="inline-flex items-baseline gap-1">
          <StatReadout value={focus.reviewCount} className="normal-case tracking-normal text-body-sm text-text-primary" />
          review(s)
        </span>
        {focus.improved > 0 && (
          <span className="inline-flex items-baseline gap-1 normal-case tracking-normal text-grade-plus">
            <StatReadout value={focus.improved} className="normal-case tracking-normal text-body-sm text-grade-plus" />
            improved
          </span>
        )}
        {focus.worse > 0 && (
          <span className="inline-flex items-baseline gap-1 normal-case tracking-normal text-grade-low">
            <StatReadout value={focus.worse} className="normal-case tracking-normal text-body-sm text-grade-low" />
            worse
          </span>
        )}
        {focus.unmeasured > 0 && (
          <span className="inline-flex items-baseline gap-1">
            <StatReadout value={focus.unmeasured} className="normal-case tracking-normal text-body-sm text-text-primary" />
            unread
          </span>
        )}
        {focus.meanConfidence != null && (
          <span className="inline-flex items-baseline gap-1">
            avg
            <StatReadout
              value={Math.round(focus.meanConfidence * 100)}
              suffix="%"
              className="normal-case tracking-normal text-body-sm text-text-primary"
            />
          </span>
        )}
      </div>
    </PaperCard>
  );
}
