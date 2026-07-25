'use client';

/**
 * ============================================================================
 * FairwayTrendBrain — the "signal vs noise" trend card (redesign of TrendDashboard)
 * ----------------------------------------------------------------------------
 * The legacy TrendDashboard shows three opaque magnitude bars + a jargon signal
 * badge ("Strongly Improving") + a context-free "4-round hot" chip. It never
 * answers the only question that matters: is this REAL or is it NOISE?
 *
 * This redesign reads top-to-bottom as one honest argument:
 *   1. VERDICT — a plain-English read of the signal + ONE trust chip whose state
 *      is gated on the LONG window's confidence + cross-window agreement (NOT the
 *      naive "all windows agree", which is trivially true on a handful of rounds).
 *      Captioned "based on raw scoring (not course-adjusted)" so the claim is
 *      honestly scoped.
 *   2. WINDOWS — fast / medium / long, with the LONG window weighted as the real
 *      signal and the fast window explicitly captioned "recent · small sample".
 *   3. STREAKS — shown as OBSERVATIONS (length + magnitude), never a fabricated
 *      luck-vs-skill verdict (that needs per-round SG the action doesn't load).
 *   4. VOLATILITY — a named, quantified note when swings are elevated.
 *
 * Honesty rails (from the golf-logic review): no fabricated composition, no
 * dated forecast, at most TWO trust signals, every claim scoped to its window.
 *
 * Drop-in for TrendDashboard: same `trends` / `streaks` / `volatility` props.
 * ADDITIVE — renders inside a `.fairway-ds` scope.
 * ========================================================================== */

import { cn, formatMetricLabel } from '@/lib/utils';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';

interface TrendWindow {
  name: 'fast' | 'medium' | 'slow';
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number;
  confidence: number;
}

export interface FairwayTrendBrainProps {
  trends?: {
    metric: string;
    windows: TrendWindow[];
    signal: string;
    description: string;
  };
  streaks?: Array<{
    type: 'hot' | 'cold';
    length: number;
    magnitude: number;
    isOngoing: boolean;
  }>;
  volatility?: { current: number; historical: number; isElevated: boolean };
  /** Raw server blob (parsed internally) — drop-in compat with TrendDashboard. */
  trendData?: Record<string, unknown>;
  /** Accepted for drop-in parity with TrendDashboard; not used by the redesign. */
  playerState?: string;
  className?: string;
}

type Tone = 'good' | 'bad' | 'neutral';

/** Plain-English verdict per multi-window composite signal. */
const VERDICT: Record<string, { line: string; tone: Tone }> = {
  strong_improving: { line: 'Your scoring is genuinely trending up', tone: 'good' },
  strong_declining: { line: 'Your scoring is sliding', tone: 'bad' },
  short_term_dip: { line: 'A recent dip, most likely noise', tone: 'neutral' },
  short_term_spike: { line: 'A hot patch: enjoy it, but it may cool', tone: 'neutral' },
  trajectory_change: { line: 'Your trajectory just shifted', tone: 'neutral' },
  mixed: { line: 'Mixed signals, too early to call', tone: 'neutral' },
  stable: { line: 'Holding steady', tone: 'neutral' },
};

const WINDOW_META: Record<TrendWindow['name'], { label: string; rounds: string; note?: string }> = {
  slow: { label: 'Long range', rounds: 'up to 25 rounds', note: 'the real signal' },
  medium: { label: 'Medium', rounds: 'up to 12 rounds' },
  fast: { label: 'Recent', rounds: 'last 5 rounds', note: 'small sample, noisy' },
};

const DIR: Record<TrendWindow['direction'], { glyph: string; tone: Tone; label: string }> = {
  improving: { glyph: '↑', tone: 'good', label: 'improving' },
  stable: { glyph: '→', tone: 'neutral', label: 'steady' },
  declining: { glyph: '↓', tone: 'bad', label: 'declining' },
};

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-fw-success',
  bad: 'text-fw-danger',
  neutral: 'text-text-tertiary',
};

/**
 * Honest trust state. NOT the naive "all windows agree" (gameable on ≤6 rounds
 * where the windows are the same rounds re-sliced). Requires the LONG window to
 * carry real confidence AND every window to agree before calling it Confirmed.
 */
function deriveTrust(windows: TrendWindow[]): { label: string; tone: Tone; note: string } {
  const slow = windows.find((w) => w.name === 'slow');
  const directions = new Set(windows.map((w) => w.direction));
  const allAgree = directions.size === 1;
  const slowConf = slow?.confidence ?? 0;

  if (allAgree && slow && slowConf >= 0.6) {
    return { label: 'Confirmed', tone: 'good', note: 'every window agrees and the long window is solid' };
  }
  if (!allAgree) {
    return { label: 'Forming', tone: 'neutral', note: 'windows disagree, not settled yet' };
  }
  return { label: 'Building history', tone: 'neutral', note: 'not enough long-range rounds to confirm' };
}

/**
 * #971 — reconcile the headline VERDICT against an ongoing streak so the card
 * never asserts a directional read (e.g. "sliding") while a same-direction-
 * contradicting streak is printed right below it (e.g. an ongoing HOT streak).
 * A verdict whose tone flatly contradicts the live ongoing streak isn't wrong
 * math, it's an incomplete read — downgrade to the honest "mixed" line rather
 * than let the headline and the footer argue with each other in one render.
 */
export function reconcileVerdict(
  verdict: { line: string; tone: Tone },
  ongoingStreaks: Array<{ type: 'hot' | 'cold' }>,
): { line: string; tone: Tone } {
  const contradicts = ongoingStreaks.some(
    (s) =>
      (verdict.tone === 'bad' && s.type === 'hot') ||
      (verdict.tone === 'good' && s.type === 'cold'),
  );
  return contradicts ? VERDICT.mixed! : verdict;
}

/**
 * #971 — a streak's `magnitude` (streak-detector.ts `detectStreaks`) is the
 * CUMULATIVE deviation summed across every round in the streak, not a
 * per-round figure. Rendering it raw as "N strokes below your average" reads
 * as an implausible per-round number (e.g. a 4-round streak summing to 23.5
 * strokes). Average it over the streak length for an honest per-round read,
 * then clamp to a plausible per-round ceiling — golf per-round deviations
 * this large would themselves indicate a data problem, not a genuine signal.
 */
const MAX_PLAUSIBLE_STROKES_PER_ROUND = 12;
export function perRoundStreakMagnitude(magnitude: number, length: number): number {
  const perRound = length > 0 ? Math.abs(magnitude) / length : Math.abs(magnitude);
  return Math.min(perRound, MAX_PLAUSIBLE_STROKES_PER_ROUND);
}

const TRUST_CHIP: Record<Tone, string> = {
  good: 'bg-fw-success-bg text-fw-success-ink',
  bad: 'bg-fw-danger-bg text-fw-danger-ink',
  neutral: 'bg-surface-sunken text-text-tertiary',
};

function WindowRow({ window }: { window: TrendWindow }) {
  const meta = WINDOW_META[window.name];
  const dir = DIR[window.direction];
  const confPct = Math.round(Math.max(0, Math.min(1, window.confidence)) * 100);
  const isLong = window.name === 'slow';

  // #971 — the old single flex row packed label / direction / confidence into
  // three fixed-width columns that collided at 390px once the "small sample,
  // noisy" note wrapped. Two stacked rows (label+confidence, then direction+
  // note) let every piece wrap on its own line without overlapping siblings.
  return (
    <div className={cn('space-y-1', !isLong && 'opacity-90')}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn('text-body-sm', isLong ? 'font-medium text-text-primary' : 'text-text-secondary')}>
          {meta.label}
        </p>
        <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">{confPct}%</span>
      </div>
      <div className={cn('flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', TONE_TEXT[dir.tone])}>
        <span aria-hidden className="text-body font-medium leading-none">
          {dir.glyph}
        </span>
        <span className="text-body-sm font-medium">{dir.label}</span>
        <span className="text-caption font-normal text-text-tertiary">{meta.rounds}</span>
        {meta.note ? (
          <span className="text-caption font-normal text-text-tertiary">· {meta.note}</span>
        ) : null}
      </div>
    </div>
  );
}

export function FairwayTrendBrain({
  trends,
  streaks,
  volatility,
  trendData,
  className,
}: FairwayTrendBrainProps) {
  const resolvedTrends = trends ?? (trendData?.trends as FairwayTrendBrainProps['trends']);
  const resolvedStreaks =
    streaks ?? (trendData?.streaks as FairwayTrendBrainProps['streaks']) ?? [];
  const resolvedVolatility =
    volatility ?? (trendData?.volatility as FairwayTrendBrainProps['volatility']);
  const windows = resolvedTrends?.windows ?? [];

  if (!windows.length) {
    return (
      <InstrumentPanel depth="base" className={className} eyebrow="Form" header="Trend">
        <p className="text-body-sm text-text-secondary">
          Not enough rounds yet for a reliable read. Play a few more and the trend brain unlocks.
        </p>
      </InstrumentPanel>
    );
  }

  const rawVerdict =
    VERDICT[resolvedTrends!.signal] ??
    ({ line: resolvedTrends!.description || 'Trend read', tone: 'neutral' } as { line: string; tone: Tone });
  const trust = deriveTrust(windows);
  // Show long → medium → fast: the most trustworthy window leads.
  const order: TrendWindow['name'][] = ['slow', 'medium', 'fast'];
  const orderedWindows = order
    .map((n) => windows.find((w) => w.name === n))
    .filter((w): w is TrendWindow => Boolean(w));
  const ongoing = resolvedStreaks.filter((s) => s.isOngoing);
  // #971 — never assert a declining/improving headline that an ongoing
  // streak directly contradicts in the same render.
  const verdict = reconcileVerdict(rawVerdict, ongoing);

  return (
    <InstrumentPanel
      depth="base"
      className={className}
      eyebrow={<>Form · {formatMetricLabel(resolvedTrends!.metric)}</>}
      readout={
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium',
            TRUST_CHIP[trust.tone],
          )}
          title={trust.note}
        >
          {trust.label}
        </span>
      }
    >
      <div className="space-y-5">
        {/* verdict */}
        <div className="space-y-1">
          <h4 className={cn('font-fw-display text-h3 font-semibold leading-snug', TONE_TEXT[verdict.tone])}>
            {verdict.line}
          </h4>
          <p className="text-caption text-text-tertiary">Based on raw scoring, not course-adjusted.</p>
        </div>

        {/* windows */}
        <div className="space-y-2.5 rounded-fw-md bg-surface-sunken p-3">
          {orderedWindows.map((w) => (
            <WindowRow key={w.name} window={w} />
          ))}
        </div>

        {/* streaks — observations only, never a fabricated luck-vs-skill verdict */}
        {ongoing.length > 0 ? (
          <div className="space-y-2">
            {ongoing.map((s, i) => {
              const tone: Tone = s.type === 'hot' ? 'good' : 'bad';
              const short = s.length <= 3;
              // #971 — per-round average (not the raw cumulative magnitude),
              // clamped to a plausible per-round ceiling. See
              // perRoundStreakMagnitude for the root-cause note.
              const perRound = perRoundStreakMagnitude(Number(s.magnitude ?? 0), s.length);
              return (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body-sm">
                  <span className={cn('font-medium', TONE_TEXT[tone])}>
                    {s.length}-round {s.type} streak
                  </span>
                  <span className="text-text-tertiary">
                    {perRound.toFixed(1)} strokes/round{' '}
                    {s.type === 'hot' ? 'below' : 'above'} your average
                  </span>
                  {short ? (
                    <span className="text-caption text-text-tertiary">· short, could be noise</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* volatility — second (and last) trust signal, named + quantified */}
        {resolvedVolatility?.isElevated ? (
          <div className="rounded-fw-md bg-fw-warning-bg px-3 py-2.5">
            <p className="text-body-sm text-text-primary">
              Your scoring is swinging more than usual.
            </p>
            <p className="text-caption text-text-tertiary">
              {Number(resolvedVolatility.current ?? 0).toFixed(1)} vs{' '}
              {Number(resolvedVolatility.historical ?? 0).toFixed(1)} typical
            </p>
          </div>
        ) : null}
      </div>
    </InstrumentPanel>
  );
}
