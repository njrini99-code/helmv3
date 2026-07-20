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
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { clampPct } from './logic';
import type { StandingTrackProps } from './types';

const RAIL_BG = 'oklch(1 0 0 / 0.14)';
const BENCH_EMPHASIS = 'oklch(1 0 0 / 0.5)';
const BENCH_DIM = 'oklch(1 0 0 / 0.32)';

export function StandingTrack({ pct, benchmarks, subjectLabel, className }: StandingTrackProps & { className?: string }) {
  const you = clampPct(pct);

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
      <div className="mt-[7px] flex items-center justify-between font-fw-sans text-caption text-accent-200">
        <b className="font-semibold text-text-on-accent">{subjectLabel}</b>
        {benchmarks.map((benchmark) => (
          <span key={benchmark.label}>{benchmark.label}</span>
        ))}
      </div>
    </div>
  );
}
