'use client';

/**
 * ============================================================================
 * StandingTrack — the spine's "you vs. benchmarks" pin track (mockup §01 .track)
 * ----------------------------------------------------------------------------
 * A single sunken rail on the dark spine surface: a green fill to the
 * subject's percentile, one or more benchmark tick marks (Team / Tour /
 * whatever the caller passes), and a pin marker on top. Renders inside
 * `Spine` between two hairlines, but is exported standalone so surface
 * compositions can mount it outside the spine shell too.
 *
 * On-dark translucent overlays (rail track, benchmark ticks) have no
 * `bg-surface-*` equivalent — they are inline `oklch(1 0 0 / N)` values,
 * matching the approved mockup exactly (never `bg-white/N`, which the
 * `no-arbitrary-bg-white` lint rule bans in className).
 *
 * THE LABEL ROW ("where this sits", fixed): the pin and benchmark ticks above
 * ARE positioned by real value (`left:${pct}%`), but the text-label row used
 * to be laid out with `flex justify-between` — which evenly spreads N labels
 * across the row width with ZERO relation to the real `pct`s driving the
 * markers above them (You flush-left, Tour flush-right, Team dead-center,
 * regardless of where those values actually sit on the rail). `layoutTrackLabels`
 * below fixes this the same coordinate-space way the pins/ticks already work —
 * each label is absolutely positioned at ITS OWN marker's clamped `left:%` —
 * plus a minimum-separation nudge so two labels never render on top of each
 * other when their real values land close together (the common case: most SG
 * values cluster near the Tour=0 anchor). Same structural-guarantee spirit as
 * StandingStrip's tiered you-badge/track layout, adapted to this component's
 * single compact label row instead of StandingStrip's roomier stacked tiers.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { clampPct } from './logic';
import type { StandingTrackProps } from './types';

const RAIL_BG = 'oklch(1 0 0 / 0.14)';
const BENCH_EMPHASIS = 'oklch(1 0 0 / 0.5)';
const BENCH_DIM = 'oklch(1 0 0 / 0.32)';

/** Sentinel key for the subject ("You"/initials) label in the shared layout
 *  pass — distinct from any real benchmark label so it can never collide with
 *  a caller-supplied `benchmark.label` string used as the other keys. */
export const STANDING_TRACK_SUBJECT_KEY = '__subject__';

/** Minimum horizontal gap (in rail %) between two adjacent label centers
 *  before they're considered "colliding" and nudged apart. Calibrated for
 *  short 3-5 char labels ("You" / "Team" / "Tour") in the spine sidebar's
 *  typical narrow width — wide enough that two centered, non-truncating
 *  labels never overlap; small enough that 2-3 real (well-separated) values
 *  are never touched. */
export const STANDING_TRACK_MIN_GAP_PCT = 16;

/** How far in from each rail edge a label's CENTER is clamped, so that a
 *  `-translate-x-1/2`-centered label box never overflows the rail container
 *  even when its marker sits at the literal 0%/100% extreme. */
export const STANDING_TRACK_EDGE_MARGIN_PCT = 6;

export interface StandingTrackLabelInput {
  key: string;
  /** Raw (not-yet-clamped) marker position, 0–100. */
  pct: number;
}

export interface StandingTrackLabelPosition {
  key: string;
  /** Final left:% for the label — edge-clamped, then nudged apart from any
   *  colliding neighbor. The marker/tick/pin it corresponds to is NEVER
   *  moved; only the text label's position is ever adjusted. */
  pct: number;
}

/**
 * Pure layout pass for the label row: edge-clamp every raw marker %, then
 * resolve collisions left→right with a minimum-gap push, then (for the rare
 * case where that push ran the whole chain past the right edge) shift the
 * chain back left as a unit so relative order + spacing survive instead of
 * the last label just clamping into its neighbor. A final hard clamp
 * guarantees every returned position sits inside the rail's safe zone
 * regardless of how tight the input cluster was.
 *
 * No React, no DOM — pure data in, data out (fixture-testable).
 */
export function layoutTrackLabels(
  items: ReadonlyArray<StandingTrackLabelInput>,
  minGapPct: number = STANDING_TRACK_MIN_GAP_PCT,
  edgeMarginPct: number = STANDING_TRACK_EDGE_MARGIN_PCT,
): StandingTrackLabelPosition[] {
  if (items.length === 0) return [];

  const minEdge = edgeMarginPct;
  const maxEdge = 100 - edgeMarginPct;

  // Edge-clamp first, then sort left→right so collision resolution reads
  // naturally (and preserves relative order — no label ever leapfrogs another).
  const ordered = items
    .map((item) => ({ key: item.key, pct: Math.min(maxEdge, Math.max(minEdge, item.pct)) }))
    .sort((a, b) => a.pct - b.pct);

  // Forward pass: push each label at least `minGapPct` to the right of its
  // left neighbor whenever they'd otherwise land closer than that.
  for (let i = 1; i < ordered.length; i++) {
    // Safe: `i` ranges over valid indices of `ordered`, and `i - 1` is
    // always >= 0, so both lookups are in-bounds despite noUncheckedIndexedAccess.
    const min = ordered[i - 1]!.pct + minGapPct;
    if (ordered[i]!.pct < min) ordered[i]!.pct = min;
  }

  // If that push carried the rightmost label past the safe edge, shift the
  // WHOLE chain left by the overflow — preserves the spacing just resolved
  // above instead of re-crushing the last label into its neighbor.
  const rightOverflow = ordered[ordered.length - 1]!.pct - maxEdge;
  if (rightOverflow > 0) {
    for (const item of ordered) item.pct -= rightOverflow;
  }

  // Backward pass + final clamp: guards the pathological case of a cluster
  // wider than the rail's safe zone (more labels than `minGapPct` comfortably
  // fits) — pulls left-neighbors apart from the right this time, then hard-
  // clamps everything into [minEdge, maxEdge] as the last word.
  for (let i = ordered.length - 2; i >= 0; i--) {
    const max = ordered[i + 1]!.pct - minGapPct;
    if (ordered[i]!.pct > max) ordered[i]!.pct = max;
  }
  for (const item of ordered) item.pct = Math.min(maxEdge, Math.max(minEdge, item.pct));

  return ordered;
}

export function StandingTrack({ pct, benchmarks, subjectLabel, className }: StandingTrackProps & { className?: string }) {
  const you = clampPct(pct);

  const labelPositions = layoutTrackLabels([
    { key: STANDING_TRACK_SUBJECT_KEY, pct: you },
    ...benchmarks.map((b) => ({ key: b.label, pct: clampPct(b.pct) })),
  ]);

  return (
    <div data-slot="standing-track" className={cn('w-full', className)}>
      <div className="relative h-[7px] rounded-full" style={{ background: RAIL_BG }}>
        <div
          data-slot="standing-track-fill"
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-400 to-accent-300"
          style={{ width: `${you}%` }}
        />
        {benchmarks.map((benchmark) => (
          <div
            key={benchmark.label}
            aria-hidden="true"
            data-slot="standing-track-bench"
            className="absolute -top-[3px] -bottom-[3px] w-[2px]"
            style={{
              left: `${clampPct(benchmark.pct)}%`,
              background: benchmark.emphasis ? BENCH_EMPHASIS : BENCH_DIM,
            }}
          />
        ))}
        <div
          aria-hidden="true"
          data-slot="standing-track-pin"
          className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent-400 bg-text-on-accent"
          style={{ left: `${you}%` }}
        />
      </div>
      {/* Each label sits at ITS OWN marker's clamped left:% (same coordinate
          space as the pin/ticks above), collision-nudged apart from any
          neighbor landing within STANDING_TRACK_MIN_GAP_PCT — replaces the
          old `justify-between` row that ignored the real values entirely. */}
      <div
        data-slot="standing-track-labels"
        className="relative mt-[7px] h-[15px] font-fw-sans text-caption text-accent-200"
      >
        {labelPositions.map((pos) => {
          const isSubject = pos.key === STANDING_TRACK_SUBJECT_KEY;
          return (
            <span
              key={pos.key}
              data-slot={isSubject ? 'standing-track-subject-label' : 'standing-track-bench-label'}
              className={cn(
                'absolute top-0 -translate-x-1/2 whitespace-nowrap',
                isSubject && 'font-semibold text-text-on-accent',
              )}
              style={{ left: `${pos.pct}%` }}
            >
              {isSubject ? subjectLabel : pos.key}
            </span>
          );
        })}
      </div>
    </div>
  );
}
