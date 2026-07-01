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
 * Column counts resolve through a static class map (no arbitrary grid classes,
 * Tailwind-JIT safe). No hooks / handlers — safe in a server component.
 */
import { cn } from '@/lib/utils';
import { RuledStatLine } from '..';

// Static, JIT-safe column templates. Base is a single column; larger counts
// step up at sm/lg so the strip never crams on mobile.
const COLS: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-6',
};

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
}

export interface KPIContentsStripProps {
  items: Array<KPIContentsItem>;
  /** Target columns at the widest breakpoint (default 3). */
  columns?: number;
  className?: string;
}

export function KPIContentsStrip({ items, columns = 3, className }: KPIContentsStripProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-8 gap-y-7', COLS[columns] ?? COLS[3], className)}>
      {items.map((it, i) => (
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
        />
      ))}
    </div>
  );
}
