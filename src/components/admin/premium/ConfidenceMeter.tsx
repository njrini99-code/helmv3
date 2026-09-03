import { cn } from '@/lib/utils';

/**
 * ============================================================================
 * Bridge Premium · ConfidenceMeter
 * ----------------------------------------------------------------------------
 * The shared rendering for every 0..1 confidence value Bridge computes —
 * `ReleaseRelationshipVerdict.confidence`, an analysis's own stated
 * confidence, a merge decision's certainty. Brief §40 "Causal confidence":
 * "never 100% from temporal correlation alone" — every confidence-producing
 * module in `src/lib/admin/incidents/` already enforces this at the SOURCE
 * (`release-context.ts`'s `classifyReleaseRelationship` caps at 0.95 and
 * documents why in its own comment), but this component enforces it a
 * SECOND time, structurally, at the last point before a human sees the
 * number — the same "safe by construction, not by convention" discipline
 * `present.ts`'s header describes for title strings. A future caller passing
 * a raw `1` (a typo, a new module that forgot the cap) still cannot render
 * "100%" here.
 *
 * ALWAYS A NUMBER, NEVER JUST A BAR. "Color is never the only indicator"
 * (brief §3) applies to a meter exactly as it does to a pill — the percent
 * text is not decoration, it is the primary channel; the segmented bar is
 * the secondary one.
 * ========================================================================== */

/** The hard ceiling this component enforces regardless of what it is passed. */
const MAX_DISPLAYED_CONFIDENCE = 0.99;
const SEGMENT_COUNT = 5;

export interface ConfidenceMeterProps {
  /** 0..1. Values >= 1 are clamped to `MAX_DISPLAYED_CONFIDENCE` and warn in
   *  development — see the module header. */
  value: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function ConfidenceMeter({ value, label, size = 'md', className }: ConfidenceMeterProps) {
  if (process.env.NODE_ENV !== 'production' && value >= 1) {
    // eslint-disable-next-line no-console -- deliberate dev-only guard rail, see module header
    console.warn(
      `ConfidenceMeter received confidence >= 1 (${value}). Nothing in this system should ever be fully certain from ` +
        'correlation alone — clamping the display, but the caller should be fixed.',
    );
  }
  const clamped = Math.min(Math.max(value, 0), MAX_DISPLAYED_CONFIDENCE);
  const percent = Math.round(clamped * 100);
  const filledSegments = Math.max(1, Math.round(clamped * SEGMENT_COUNT));

  const tone = clamped >= 0.75 ? 'text-fw-warning-ink' : clamped >= 0.5 ? 'text-warm-600' : 'text-warm-500';

  return (
    <span
      data-slot="bridge-confidence-meter"
      role="meter"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={99}
      aria-label={label ? `${label}: ${percent}% confidence` : `${percent}% confidence`}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn(
              'rounded-[1px]',
              size === 'sm' ? 'h-2 w-1' : 'h-2.5 w-1.5',
              i < filledSegments ? 'bg-fw-warning' : 'bg-warm-200',
            )}
          />
        ))}
      </span>
      <span className={cn('font-fw-mono tabular-nums', size === 'sm' ? 'text-[11px]' : 'text-caption', tone)}>
        {percent}%{label ? ` ${label}` : ''}
      </span>
    </span>
  );
}
