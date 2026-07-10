/**
 * KPIContentsStrip — the Command Center "table of contents" (spec §6 #3).
 *
 * A responsive grid of big KPI figures read as a masthead contents strip
 * (`ROSTER 14 · ON THE RECORD 0 · OPEN RISKS 0`). Each cell is a `<RuledStatLine>`
 * (`size='row'`) so the numeral carries the contrast and rests on a GREEN
 * baseline rule (team lane). `leader`/`emphasis` promote a figure to green so
 * the eye lands on it; a settled figure flashes its rule green when a background
 * sync lands a value (owned by the atom).
 *
 * Phone shape resolves through `StatStrip` (Mobile Doctrine's ONE shape rule,
 * shared with the Fairway/Bridge `StatTile` grids): phone → 2-col index (≤4
 * KPIs) or snap-rail (≥5 KPIs); desktop grid preserved byte-for-byte above
 * `sm`. No hooks / handlers — safe in a server component.
 */
import { StatStrip, STAT_STRIP_RAIL_THRESHOLD } from '@/components/fairway';
import { RuledStatLine } from '..';

// Below StatStrip's default rail threshold, a `leader`/`emphasis` figure
// stays wherever the caller placed it — the pin-first partition below only
// matters once the strip becomes a snap-rail, so a swipe isn't required to
// see the one figure that carries hierarchy. Imports StatStrip's own
// threshold constant rather than re-declaring the literal, so this
// partition can never drift out of sync with StatStrip's actual rail/grid
// decision.
const RAIL_THRESHOLD = STAT_STRIP_RAIL_THRESHOLD;

export interface KPIContentsItem {
  /** Small-caps KPI label, e.g. `ROSTER`, `ON THE RECORD`, `OPEN RISKS`. */
  label: string;
  /** The figure. Numbers roll on the odometer; strings render statically. */
  value: number | string;
  /** Trailing unit (small mono figures). */
  unit?: string;
  /** Team-leading value — green numeral + `LEADS` tick. */
  leader?: boolean;
  /** Render the numeral in team-ink green for emphasis. */
  emphasis?: boolean;
  /** Decimals for a numeric value. */
  decimals?: number;
  /**
   * Renders an em-dash placeholder instead of `value` — for a figure that
   * FAILED to load, so it never reads as a confirmed zero. Distinct from
   * simply omitting the item: the label stays visible, honestly marked
   * "not yet confirmed" rather than silently vanishing or lying with a 0.
   */
  ghost?: boolean;
}

export interface KPIContentsStripProps {
  items: Array<KPIContentsItem>;
  /** Target columns at the widest breakpoint (default 3). */
  columns?: number;
  className?: string;
}

export function KPIContentsStrip({ items, columns = 3, className }: KPIContentsStripProps) {
  // Pin-first: once the strip becomes a snap-rail, a leader/emphasis figure
  // is moved to index 0 so it's visible in the initial peek without a swipe.
  // A stable partition — NOT a re-sort of the whole list — peer order is
  // preserved within each half.
  const ordered =
    items.length >= RAIL_THRESHOLD
      ? [
          ...items.filter((it) => it.leader || it.emphasis),
          ...items.filter((it) => !it.leader && !it.emphasis),
        ]
      : items;

  // StatStrip's `columns` prop covers 2–6 (a lone column is expressed by
  // omitting it and letting StatStrip default from `count` instead — its
  // public contract has no "always 1 column" literal).
  const clampedColumns = Math.min(Math.max(columns, 1), 6);
  const statStripColumns = clampedColumns === 1 ? undefined : (clampedColumns as 2 | 3 | 4 | 5 | 6);

  return (
    <StatStrip count={items.length} columns={statStripColumns} ariaLabel="Key figures" className={className}>
      {ordered.map((it, i) => (
        <RuledStatLine
          key={`${it.label}-${i}`}
          label={it.label}
          value={it.value}
          unit={it.unit}
          size="row"
          ink="team"
          leader={it.leader}
          emphasis={it.emphasis}
          decimals={it.decimals ?? 0}
          ghost={it.ghost}
        />
      ))}
    </StatStrip>
  );
}
