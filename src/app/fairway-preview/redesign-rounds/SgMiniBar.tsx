// REDESIGN-SCRATCH (docs/redesign/rounds): a four-segment strokes-gained mini bar.
//
// One column each for Tee, Approach, Short game and Putting, in that order. A column rises from
// the zero line in green when the category gained strokes and falls in amber when it lost them,
// so length and side say the same thing colour does. Every bar in every row is on one shared
// scale (the largest category value in the fixture), which is what makes two rows comparable.
//
// Built on the diverging viz tokens (`VIZ_DIVERGING`, the same ones StrokesGainedTornado draws
// with: green right/up = gained, amber left/down = lost). The kit's SegmentBar cannot do this
// job: it is a part-to-whole InstrumentPanel that clamps negative values to zero.
import { VIZ_DIVERGING, formatSigned } from '@/components/fairway/charts/theme';
import { cn } from '@/lib/utils';

import { SG_ABS_MAX, SG_CATEGORIES, type SgValues } from './model';

/** Pixels the tallest possible bar rises or falls from the zero line. */
const HALF_HEIGHT_PX = 14;

export function SgMiniBar({ values, className }: { values: SgValues; className?: string }) {
  const label = `Strokes gained: ${SG_CATEGORIES.map(
    (c) => `${c.label.toLowerCase()} ${formatSigned(values[c.key], 1)}`,
  ).join(', ')}.`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-flex h-8 shrink-0 items-stretch gap-0.5', className)}
    >
      {SG_CATEGORIES.map((c) => {
        const v = values[c.key];
        const gained = v > 0;
        const px =
          v === 0 ? 0 : Math.max(2, Math.round((Math.abs(v) / SG_ABS_MAX) * HALF_HEIGHT_PX));
        return (
          <span key={c.key} className="relative block w-2">
            {px > 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 block"
                style={{
                  height: px,
                  background: gained ? VIZ_DIVERGING.positive : VIZ_DIVERGING.negative,
                  ...(gained ? { bottom: '50%' } : { top: '50%' }),
                }}
              />
            ) : null}
          </span>
        );
      })}
      {/* The zero line, drawn over the columns so a near-zero category still shows its place. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 block h-px bg-border-strong"
      />
    </span>
  );
}
