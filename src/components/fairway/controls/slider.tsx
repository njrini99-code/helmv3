'use client';

/**
 * ============================================================================
 * Fairway · Slider — THE range control
 * ----------------------------------------------------------------------------
 * Replaces the hand-rolled `ThresholdSlider`, which had three geometry bugs
 * that made it read as broken on a phone (2026-07-25):
 *
 *   1. TICKS DIDN'T LINE UP WITH THE THUMB. Marks were laid out with
 *      `justify-between`, which distributes the label BOXES edge-to-edge — the
 *      first is left-aligned at 0 and the last right-aligned at 100%. A value
 *      of 2.0 on a 1–4 scale drew its thumb visibly left of the "2" label.
 *   2. FILL AND THUMB DRIFTED APART. The fill used `width: <pct>%` of the whole
 *      track, but a native range thumb's CENTRE only travels from `thumb/2` to
 *      `track − thumb/2`. At the ends the fill over/under-shot the thumb.
 *   3. FLOAT-ACCUMULATED MARKS. `for (v = min; v <= max; v += 0.5)` drifts, so
 *      a 0.5-step scale could drop or duplicate its last mark.
 *
 * The fix is one shared expression. Everything positioned along the rail — the
 * fill, the ticks, the value bubble — uses the SAME inset-aware formula:
 *
 *     offset = (thumb / 2) + pct × (100% − thumb)
 *
 * expressed in CSS against `--fw-slider-pct` / `--fw-slider-thumb`, so the
 * browser resolves it at the rail's real width and nothing needs measuring in
 * JS. Ticks are derived from an integer step count, never float accumulation.
 *
 * Also fixed here: a real `focus-visible` ring (there was none), Firefox
 * support (`::-moz-range-thumb` — the old control styled webkit only, so
 * Firefox got the default blue OS slider), and a 44px touch target achieved by
 * making the transparent input taller than the visual rail rather than by
 * growing the rail.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Unit shown beside the numeric readout and spoken in `aria-valuetext`. */
  unit?: string;
  /** Decimal places for the readout. Inferred from `step` when omitted. */
  decimals?: number;
  /**
   * Map the raw value to what the reader sees. Use when the stored unit is
   * engine vocabulary and the displayed one is human — a confidence of 0.55
   * shown as "55%". Affects the readout, the ticks and `aria-valuetext`; the
   * value passed to `onValueChange` is always the RAW one.
   */
  displayTransform?: (value: number) => number;
  /**
   * Tick marks under the rail. `true` derives one per `step` (capped so a
   * fine-grained scale doesn't print 40 labels); pass an array for explicit
   * ones. Omit for a clean rail.
   */
  ticks?: boolean | number[];
  /** Visible label. Required for a named control unless `aria-label` is given. */
  label?: React.ReactNode;
  /** Supporting copy under the label. */
  description?: React.ReactNode;
  /** Hide the built-in numeric readout (when the caller renders its own). */
  hideValue?: boolean;
  className?: string;
}

/** Decimal places implied by a step (0.5 → 1, 1 → 0, 0.25 → 2). */
function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Tick values across [min, max].
 *
 * Integer-indexed off the step count — `min + i * step` — so there is no
 * float accumulation. When the scale has more steps than `maxTicks`, ticks
 * thin out to a whole-number stride instead of crowding the rail.
 */
export function tickValues(min: number, max: number, step: number, maxTicks = 6): number[] {
  const ends = [...new Set([min, max].filter(Number.isFinite))];
  if (!Number.isFinite(step) || step <= 0 || max <= min) return ends;

  // floor, not round: with a step that doesn't divide the span evenly
  // (min 0, max 10, step 3) rounding invents a step past `max`. The epsilon
  // absorbs binary error so a span that DOES divide evenly (1→3 by 0.5) still
  // yields its last whole step instead of falling one short.
  const steps = Math.floor((max - min) / step + 1e-9);
  if (steps <= 0) return ends;

  // Snap each tick to the step's own precision — `0 + 3 * 0.1` is
  // 0.30000000000000004 in binary floating point, and that would print.
  const places = decimalsForStep(step);
  const snap = (n: number) => Number(n.toFixed(places));

  const stride = Math.max(1, Math.ceil(steps / (maxTicks - 1)));
  const out: number[] = [];
  for (let i = 0; i <= steps; i += stride) out.push(snap(min + i * step));
  // `max` is always reachable — a native range clamps to it even when it is
  // off-step — so it always gets a tick.
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/**
 * Position along the rail for a value in [0,1], inset by half a thumb at each
 * end so it tracks the native thumb's real centre. Shared by fill and ticks —
 * that shared expression IS the alignment fix.
 */
function railOffset(pct: number): string {
  return `calc(var(--fw-slider-thumb) / 2 + ${pct} * (100% - var(--fw-slider-thumb)))`;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    onValueChange,
    min,
    max,
    step,
    unit,
    decimals,
    displayTransform,
    ticks,
    label,
    description,
    hideValue = false,
    className,
    disabled,
    id: idProp,
    ...rest
  },
  ref,
) {
  const reactId = React.useId();
  const id = idProp ?? reactId;
  const descId = `${id}-desc`;

  const places = decimals ?? decimalsForStep(step);
  const span = max - min;
  const pct = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  const show = (n: number) => (displayTransform ? displayTransform(n) : n).toFixed(places);
  const readout = show(value);

  const marks = React.useMemo(() => {
    if (!ticks) return [];
    return Array.isArray(ticks) ? ticks : tickValues(min, max, step);
  }, [ticks, min, max, step]);

  return (
    <div
      data-slot="fw-slider"
      data-disabled={disabled || undefined}
      className={cn('flex flex-col gap-2', disabled && 'opacity-60', className)}
      style={
        {
          '--fw-slider-pct': pct,
          '--fw-slider-thumb': '22px',
        } as React.CSSProperties
      }
    >
      {(label || !hideValue) && (
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            {label ? (
              <label
                htmlFor={id}
                className="font-fw-sans text-body-sm font-medium text-text-primary"
              >
                {label}
              </label>
            ) : null}
            {description ? (
              <p id={descId} className="mt-0.5 font-fw-sans text-caption text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {!hideValue ? (
            <p className="flex shrink-0 items-baseline gap-1">
              <span className="font-fw-mono text-h3 font-medium tabular-nums leading-none text-text-primary">
                {readout}
              </span>
              {unit ? (
                <span className="font-fw-sans text-caption text-text-tertiary">{unit}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      {/* Rail. `relative` + a fixed height so the absolutely-positioned fill,
          ticks and the transparent input all share one coordinate space. */}
      <div className="relative h-[22px]">
        {/* Track */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-sunken ring-1 ring-inset ring-border-subtle"
        />
        {/* Fill — accent-700, not accent-500: this rail sits on cream and the
            lighter green failed contrast as a UI boundary (audit H10/P-26). */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent-700"
          style={{ left: 0, width: railOffset(pct) }}
        />
        {/* Thumb — painted, not the native one. The native thumb is made
            transparent below so the input stays the interaction/a11y surface
            while this div owns the look. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full',
            'border-[3px] border-surface bg-accent-700 shadow-soft',
            'transition-transform duration-fast motion-reduce:transition-none',
            'peer-active/input:scale-110 peer-focus-visible/input:ring-2 peer-focus-visible/input:ring-border-focus peer-focus-visible/input:ring-offset-2 peer-focus-visible/input:ring-offset-surface',
          )}
          style={{ left: railOffset(pct) }}
        />
        {/* The real control. Transparent and 44px tall (well above the visual
            rail) so the touch target clears the iOS floor without a fat rail. */}
        <input
          ref={ref}
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-describedby={description ? descId : undefined}
          // Spoken value carries the unit — a bare number tells a screen-reader
          // user nothing about what 3.0 means (WCAG 4.1.2).
          aria-valuetext={unit ? `${readout} ${unit}` : readout}
          onChange={(e) => onValueChange(parseFloat(e.currentTarget.value))}
          className={cn(
            'peer/input absolute left-0 top-1/2 h-11 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent',
            'outline-none disabled:cursor-not-allowed',
            // Transparent native thumbs, sized to --fw-slider-thumb so the
            // browser's own travel inset matches the painted thumb exactly.
            '[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent',
            '[&::-moz-range-track]:h-11 [&::-moz-range-track]:bg-transparent',
            '[&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent',
          )}
          {...rest}
        />
      </div>

      {marks.length > 0 ? (
        // Ticks are ABSOLUTELY positioned at their own value via the same
        // railOffset() the thumb uses — not `justify-between`, which spaced the
        // label boxes and put every interior mark slightly off its value.
        <div aria-hidden="true" className="relative h-4">
          {marks.map((m) => {
            const p = span > 0 ? (m - min) / span : 0;
            return (
              <span
                key={m}
                className="absolute -translate-x-1/2 font-fw-mono text-caption tabular-nums text-text-tertiary"
                style={{ left: railOffset(p) }}
              >
                {show(m)}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
