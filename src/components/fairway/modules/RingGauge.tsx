'use client';

/**
 * ============================================================================
 * RingGauge — a tiny composite-score ring (mockup §.comp svg ring)
 * ----------------------------------------------------------------------------
 * A 0–100 value drawn as a stroke-dasharray arc on a sunken track, rotated
 * -90° so it starts at 12 o'clock, paired with the mono number it represents.
 * Sized to match the mockup default (30px, 4px stroke, r=12) but scales with
 * `size` for other contexts.
 * ========================================================================== */

import { clampPct } from './logic';
import { TABULAR_NUMS } from '../charts/theme';
import type { RingGaugeProps } from './types';

export function RingGauge({ value, size = 30 }: RingGaugeProps) {
  const pct = clampPct(value);
  const strokeWidth = Math.max(2, size / 7.5);
  const r = size / 2 - strokeWidth / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const filled = (pct / 100) * circumference;

  return (
    <span
      data-slot="ring-gauge"
      role="img"
      aria-label={`Composite ${Math.round(pct)} of 100`}
      className="inline-flex items-center gap-2"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fw-color-surface-sunken)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fw-color-accent-500)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b
        style={TABULAR_NUMS}
        className="font-fw-mono text-body-sm font-normal not-italic tabular-nums text-text-primary"
      >
        {Math.round(pct)}
      </b>
    </span>
  );
}
