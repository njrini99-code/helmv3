/**
 * GradeStampGrid — a row / grid of 20-80 `<GradeStamp>`s (spec §7).
 *
 * The evaluation block for a scouted player: HIT / POWER / RUN / ARM / FIELD as
 * debossed, ramp-colored stamps that press in on mount. `present: false` renders
 * a ghost dashed outline (a projected/ceiling grade not yet earned). Column
 * count resolves through a static, JIT-safe class map so no arbitrary grid class
 * is generated.
 *
 * No hooks / handlers — safe in a server component.
 */
import { cn } from '@/lib/utils';
import { GradeStamp } from '..';

// Static column templates — the stamps are fixed-size, so `w-fit` keeps the grid
// snug to its content instead of stretching cells.
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export interface GradeStampGridGrade {
  /** Tool name shown as the ring label, e.g. `HIT`, `POWER`. */
  tool: string;
  /** The 20-80 grade. */
  value: number;
  /** Solid present grade vs. ghost future/projected outline. */
  present?: boolean;
}

export interface GradeStampGridProps {
  grades: Array<GradeStampGridGrade>;
  /** Columns (default 5 — the classic five-tool row). */
  columns?: number;
  className?: string;
}

export function GradeStampGrid({ grades, columns = 5, className }: GradeStampGridProps) {
  return (
    <div className={cn('grid w-fit gap-3', COLS[columns] ?? COLS[5], className)}>
      {grades.map((g, i) => (
        <GradeStamp key={`${g.tool}-${i}`} tool={g.tool} value={g.value} present={g.present} />
      ))}
    </div>
  );
}
