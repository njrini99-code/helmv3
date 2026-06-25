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
// honestly as winners.
//
// PALETTE: cream/green GolfHelm look, reusing the shared UI primitives verbatim.
// No navy/amber. No golf labels.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconGauge,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconClock,
  IconInfo,
  IconSparkles,
  IconCheckCircle2,
  IconXCircle,
  IconActivity,
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
} from '@/lib/types/baseball-practice-effectiveness';

interface Props {
  reviews: EffectivenessReviewView[];
  focusRollup: EffectivenessFocusRollupView[];
  summary: EffectivenessSummary;
}

type ReviewFilter = 'all' | 'measured' | 'needs_more' | 'attention';

// -----------------------------------------------------------------------------
// Honesty vocabulary — the single place direction/tier map to words + tone.
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
  const reduceMotion = useReducedMotion();
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

  const fadeIn = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <m.div
          {...fadeIn}
          transition={reduceMotion ? undefined : { duration: 0.3 }}
          className="mb-6 flex flex-wrap items-start justify-between gap-3"
        >
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
              CoachHelm
            </p>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                <IconGauge size={20} />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-warm-900 sm:text-3xl">
                Practice Effectiveness
              </h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-warm-500">
              Did what you practiced transfer to performance? CoachHelm measures
              each focus area against later game, scrimmage, and practice movement —
              and tells you honestly when it can&rsquo;t know yet.
            </p>
          </div>
          <Button onClick={handleRun} isLoading={isPending} variant="primary" size="sm">
            {!isPending && <IconSparkles size={16} className="mr-1.5" />}
            {isPending ? 'Measuring…' : 'Re-measure'}
          </Button>
        </m.div>

        {runMsg && (
          <div
            role="status"
            aria-live="polite"
            className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm ${
              runFailed
                ? 'border-error/30 bg-error/5 text-error'
                : 'border-primary-100 bg-primary-50/60 text-primary-800'
            }`}
          >
            {runFailed ? (
              <IconXCircle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <IconCheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary-500" />
            )}
            <span>{runMsg}</span>
          </div>
        )}

        {/* Honesty note — front and center */}
        <Card variant="flat" padding="md" className="mb-6 border-warm-200 bg-cream-50">
          <div className="flex items-start gap-2.5">
            <IconInfo size={16} className="mt-0.5 shrink-0 text-warm-400" />
            <p className="text-xs leading-relaxed text-warm-500">
              These are <span className="font-medium text-warm-700">associations, not proof</span>.
              A single practice can&rsquo;t be shown to cause a game result, and box-score
              data is coarse. CoachHelm caps confidence accordingly and labels the
              scope (games vs scrimmages vs practice) every read is built from.
            </p>
          </div>
        </Card>

        {/* Stat strip */}
        <m.div
          {...fadeIn}
          transition={reduceMotion ? undefined : { duration: 0.3, delay: 0.05 }}
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <StatTile icon={<IconActivity size={18} />} label="Reviews" value={summary.totalReviews} />
          <StatTile icon={<IconTrendingUp size={18} />} label="Improved" value={summary.improved} tone="success" />
          <StatTile icon={<IconClock size={18} />} label="Too early" value={summary.tooEarly} tone="warning" />
          <StatTile icon={<IconInfo size={18} />} label="Need more sample" value={summary.insufficient + summary.notTracked} />
        </m.div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Reviews column */}
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-warm-500">
                Measurements
              </h2>
              <div
                className="flex items-center gap-1 rounded-lg border border-warm-200 bg-cream-50 p-0.5"
                role="tablist"
                aria-label="Filter measurements"
              >
                {(
                  [
                    ['all', 'All'],
                    ['measured', 'Measured'],
                    ['attention', 'Attention'],
                    ['needs_more', 'Need data'],
                  ] as [ReviewFilter, string][]
                ).map(([f, lbl]) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      filter === f
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-warm-600 hover:bg-warm-100'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                type="generic"
                title={
                  reviews.length === 0
                    ? 'No effectiveness measurements yet'
                    : 'Nothing matches this filter'
                }
                description={
                  reviews.length === 0
                    ? 'Add a measurable objective to a practice (a focus area + a tracked metric), mark it completed, then re-measure. CoachHelm will connect it to later performance.'
                    : 'Try a different filter to see more measurements.'
                }
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((r, idx) => (
                  <m.div
                    key={r.id}
                    {...fadeIn}
                    transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <ReviewCard review={r} disabled={isPending} onRefresh={() => router.refresh()} />
                  </m.div>
                ))}
              </div>
            )}
          </section>

          {/* Focus roll-up column */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-warm-500">
              By focus area
            </h2>
            {focusRollup.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-warm-100 text-warm-400">
                  <IconActivity size={20} />
                </div>
                <p className="text-sm font-medium text-warm-700">No focus areas yet</p>
                <p className="mx-auto mt-1 max-w-[14rem] text-xs leading-relaxed text-warm-400">
                  Once you measure objectives, each focus area rolls up here with its
                  transfer signal.
                </p>
              </Card>
            ) : (
              <ol className="space-y-2">
                {focusRollup.map((f, idx) => (
                  <m.li
                    key={`${f.focusArea}-${f.metricId ?? ''}`}
                    {...fadeIn}
                    transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <FocusRollupItem focus={f} />
                  </m.li>
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

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'success' | 'warning';
}) {
  const accent =
    tone === 'success'
      ? 'bg-primary-50 text-primary-600 ring-1 ring-primary-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100'
        : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200/60';
  return (
    <Card variant="raised" padding="md" className="transition-shadow hover:shadow-card">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-semibold tabular-nums tracking-tight text-warm-900">{value}</p>
          <p className="truncate text-xs text-warm-500">{label}</p>
        </div>
      </div>
    </Card>
  );
}

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
  const tierLabel = TIER_LABEL[review.confidence_tier];
  const confPct = review.confidence != null ? Math.round(review.confidence * 100) : null;
  const resolved = review.disposition === 'resolved' || review.disposition === 'converted_to_task';

  const dispose = (disposition: 'resolved' | 'dismissed') => {
    startTransition(async () => {
      await setReviewDisposition({ reviewId: review.id, disposition });
      // Refresh the parent server component data so the disposition change is
      // immediately visible without a manual page reload.
      onRefresh();
    });
  };

  return (
    <Card
      variant="raised"
      padding="md"
      className={resolved ? 'opacity-70 transition-opacity' : 'transition-shadow hover:shadow-card'}
    >
      <CardContent className="p-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Badge variant={dir.tone}>
            <span className="mr-1 inline-flex">{dir.icon}</span>
            {dir.label}
          </Badge>
          <Badge variant="secondary">{tierLabel}</Badge>
          {confPct != null && (
            <span className="text-xs text-warm-400">confidence {confPct}%</span>
          )}
        </div>

        <h3 className="font-semibold tracking-tight text-warm-900">{review.focus_area}</h3>
        <p className="mt-0.5 text-xs text-warm-400">
          {review.metricLabel}
          {review.practice_title ? ` · ${review.practice_title}` : ''} ·{' '}
          {SCOPE_LABEL[review.after_scope]}
        </p>

        <p className="mt-2 text-sm leading-relaxed text-warm-600">{review.conclusion}</p>

        {/* Before / after sample line */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
          <span>
            Before: <span className="font-medium text-warm-700">{review.sample_before}</span> session(s)
          </span>
          <span>
            After: <span className="font-medium text-warm-700">{review.sample_after}</span> session(s)
          </span>
          {review.player_ids.length > 0 && (
            <span>{review.player_ids.length} player(s)</span>
          )}
        </div>

        {/* Confounders — what CoachHelm cannot control */}
        {review.confoundersParsed.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg bg-cream-50 p-2.5">
            {review.confoundersParsed.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-warm-500">
                <IconInfo size={12} className="mt-0.5 shrink-0 text-warm-400" />
                {c.reason}
              </li>
            ))}
          </ul>
        )}

        {/* Recommended next action */}
        {review.recommendedActionParsed && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-warm-600">
            <IconSparkles size={13} className="mt-0.5 shrink-0 text-primary-500" />
            <span className="font-medium">{review.recommendedActionParsed.label}</span>
          </div>
        )}

        {/* Footer: timestamp + verdict buttons */}
        <div className="mt-3 border-t border-warm-100 pt-2.5">
          <span className="flex items-center gap-1 text-xs text-warm-400">
            <IconClock size={12} />
            {relativeTime(review.generated_at)}
          </span>
          {!resolved && (
            <div
              className={`mt-2 grid grid-cols-2 gap-1.5 transition-opacity duration-200 ${
                isPending || disabled ? 'pointer-events-none opacity-40' : ''
              }`}
              role="group"
              aria-label="Verdict"
            >
              <Button
                variant="success"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => dispose('resolved')}
              >
                Worked
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => dispose('resolved')}
              >
                Needs More Time
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => dispose('resolved')}
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
      </CardContent>
    </Card>
  );
}

function FocusRollupItem({ focus }: { focus: EffectivenessFocusRollupView }) {
  const tone = focus.positiveSignal
    ? 'border-primary-200 bg-primary-50/40'
    : focus.noEvidenceOfTransfer
      ? 'border-warm-200 bg-cream-50'
      : 'border-warm-100 bg-cream-50';

  return (
    <div className={`rounded-xl border p-3 transition-colors ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-warm-800">{focus.focusArea}</p>
          <p className="truncate text-xs text-warm-400">{focus.metricLabel}</p>
        </div>
        {focus.positiveSignal ? (
          <Badge variant="success">
            <IconTrendingUp size={12} className="mr-0.5" />
            Return
          </Badge>
        ) : focus.noEvidenceOfTransfer ? (
          <Badge variant="warning">No evidence</Badge>
        ) : (
          <Badge variant="secondary">Mixed</Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-warm-500">
        <span>{focus.reviewCount} review(s)</span>
        {focus.improved > 0 && <span className="text-primary-600">{focus.improved} improved</span>}
        {focus.worse > 0 && <span className="text-red-600">{focus.worse} worse</span>}
        {focus.unmeasured > 0 && <span>{focus.unmeasured} unread</span>}
        {focus.meanConfidence != null && (
          <span>avg {Math.round(focus.meanConfidence * 100)}%</span>
        )}
      </div>
    </div>
  );
}
