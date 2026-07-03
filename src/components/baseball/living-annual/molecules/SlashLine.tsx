/**
 * SlashLine — the batting slash line `.341 / .420 / .611` (spec §7 "stacks
 * fractally for slash lines").
 *
 * Three `<StatReadout>` figures set in `font-annual tabular-nums`, joined by thin
 * recessive slashes. Per the founder addendum the figures carry the contrast in
 * near-black graphite by default; the `leader` figure (AVG/OBP/SLG) renders in
 * lane ink — GREEN in team lanes, clay in the War Room — so the eye lands on the
 * best number. Numeric values are formatted the baseball way via `formatRate`
 * (leading zero dropped below 1 → `.341`, kept at/above 1 → `1.089` OPS); pass a
 * pre-formatted string to render it verbatim.
 *
 * No hooks / handlers — composes client `<StatReadout>` but is itself safe in a
 * server component.
 */
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { StatReadout } from '..';
import { formatRate } from '../format';

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-h2',
  md: 'text-h1',
  lg: 'text-display',
};

const INK_TEXT: Record<'team' | 'pursuit', string> = {
  team: 'text-grade-plus',
  pursuit: 'text-pursuit',
};

export interface SlashLineProps {
  /** Batting average (`.341` or `0.341`). */
  avg: number | string;
  /** On-base percentage. */
  obp: number | string;
  /** Slugging percentage. */
  slg: number | string;
  /** Figure scale (default `md`). */
  size?: 'sm' | 'md' | 'lg';
  /** Which slot leads — renders that figure in lane ink (green/clay). */
  leader?: 'avg' | 'obp' | 'slg';
  /** Lane ink for the leader figure (default team green). */
  ink?: 'team' | 'pursuit';
  className?: string;
}

export function SlashLine({ avg, obp, slg, size = 'md', leader, ink = 'team', className }: SlashLineProps) {
  const cells: Array<{ key: 'avg' | 'obp' | 'slg'; value: number | string; aria: string }> = [
    { key: 'avg', value: avg, aria: 'Batting average' },
    { key: 'obp', value: obp, aria: 'On-base percentage' },
    { key: 'slg', value: slg, aria: 'Slugging percentage' },
  ];

  return (
    <div className={cn('inline-flex items-baseline gap-2 font-annual tabular-nums', SIZE[size], className)}>
      {cells.map((c, i) => (
        <Fragment key={c.key}>
          {i > 0 ? (
            <span aria-hidden className="font-normal text-text-tertiary">
              /
            </span>
          ) : null}
          <StatReadout
            value={typeof c.value === 'number' ? formatRate(c.value, 3) : c.value}
            ariaLabel={c.aria}
            className={c.key === leader ? INK_TEXT[ink] : undefined}
          />
        </Fragment>
      ))}
    </div>
  );
}
