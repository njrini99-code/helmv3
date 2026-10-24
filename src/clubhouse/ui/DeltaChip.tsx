import { NO_DATA, formatSigned } from '../lib/format';
import { deltaTone } from '../lib/stats-signal';

/**
 * A signed difference against a baseline, toned only when it is real (plan 4.33, 7.A and A.7.3): green when it went the
 * better way by more than one standard error of the difference, amber the worse way, and "Level" otherwise, so noise is
 * never painted (`deltaTone`). A change under `threshold` (the metric's smallest meaningful difference) is level too.
 *
 * Colour never carries the meaning alone (gain and loss are close in lightness, 9.3 F10): a 6 px triangle points up for
 * better and down for worse whatever the number's sign, and a level chip draws a dash and says "Level". The number is
 * always shown, in tabular figures with the true minus. Server-safe: no state, no effects.
 */
export type DeltaUnit = 'strokes' | 'pts' | 'pct' | 'sg';
export type DeltaState = 'gain' | 'loss' | 'level';

const DIGITS: Record<DeltaUnit, number> = { strokes: 1, pts: 0, pct: 0, sg: 1 };
const SUFFIX: Record<DeltaUnit, string> = { strokes: '', pts: ' pts', pct: '%', sg: '' };
const SPOKEN: Record<DeltaUnit, [string, string]> = {
  strokes: ['stroke', 'strokes'],
  pts: ['point', 'points'],
  pct: ['percent', 'percent'],
  sg: ['stroke gained', 'strokes gained'],
};

/** Which way a difference reads: the tone `DeltaChip` draws, for callers that need the word without the chip. */
export function deltaState(value: number | null | undefined, se: number | null | undefined, better: 'lower' | 'higher', threshold = 0): DeltaState | null {
  if (value == null || Number.isNaN(value)) return null;
  if (Math.abs(value) < threshold) return 'level';
  const tone = deltaTone(value, se, better === 'lower');
  return tone === 'is-gain' ? 'gain' : tone === 'is-loss' ? 'loss' : 'level';
}

function Glyph({ state }: { state: DeltaState }) {
  return (
    <svg className="ch-delta__g" width="6" height="6" viewBox="0 0 6 6" aria-hidden="true" focusable="false">
      {state === 'gain' ? <path d="M3 0.5 6 5.5H0Z" /> : state === 'loss' ? <path d="M3 5.5 0 0.5H6Z" /> : <rect x="0" y="2.25" width="6" height="1.5" rx="0.75" />}
    </svg>
  );
}

export function DeltaChip({
  value,
  se,
  better,
  unit = 'strokes',
  threshold = 0,
  digits,
  against,
}: {
  /** The difference, signed as measured (this minus the baseline). */
  value: number | null | undefined;
  /** Standard error of the difference. Without one the chip is never toned: an unmeasured change is never painted. */
  se: number | null | undefined;
  /** Which direction is better for this metric: scoring is `lower`, a rate is usually `higher`. */
  better: 'lower' | 'higher';
  unit?: DeltaUnit;
  /** The smallest difference worth naming; anything under it reads Level. */
  threshold?: number;
  digits?: number;
  /** What it is measured against, for the spoken label: "than her season average". */
  against?: string;
}) {
  const state = deltaState(value, se, better, threshold);
  if (state == null || value == null) {
    return (
      <span className="ch-delta ch-delta--none">
        <span className="ch-delta__v ch-num" aria-hidden="true">
          {NO_DATA}
        </span>
        <span className="ch-sr-only">No data</span>
      </span>
    );
  }
  const d = digits ?? DIGITS[unit];
  const shown = `${formatSigned(value, d)}${SUFFIX[unit]}`;
  const size = Math.abs(Number(value.toFixed(d)));
  const words = SPOKEN[unit][size === 1 ? 0 : 1];
  const tail = against ? ` ${against}` : '';
  const spoken =
    state === 'level'
      ? `Level: ${shown.replace('−', 'minus ')} ${words}, no clear change${tail}`
      : `${state === 'gain' ? 'Better' : 'Worse'} by ${size.toFixed(d)} ${words}${tail}`;
  return (
    <span className={`ch-delta ch-delta--${state}`} data-ch-delta={state}>
      <Glyph state={state} />
      <span className="ch-delta__v ch-num" aria-hidden="true">
        {state === 'level' ? `Level · ${shown}` : shown}
      </span>
      <span className="ch-sr-only">{spoken}</span>
    </span>
  );
}
