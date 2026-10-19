import type { CSSProperties } from 'react';

/**
 * The shape of what will be here: the rules, rings and baseline of the real layout, drawn quiet and empty, so a page
 * that is waiting reads as waiting rather than missing. Hairlines only: no bars and no sheen (those are the loading
 * skeleton's), no fake text and no numbers. It is decoration (aria-hidden), still, and never carries copy; the
 * sentence sits above it (EmptyState). Server-safe.
 *   people  - rows with a portrait ring in the lead column (roster, messages, prospects)
 *   time    - rows with a time tick in the lead column (a day's events, classes)
 *   rows    - rows with a lead dot (announcements, tasks, insights)
 *   columns - lanes under a ruled head (a pipeline board)
 *   chart   - gridlines over a flat baseline with its ticks (a trend that has no points)
 *   week    - seven day columns (a schedule)
 */
export type EmptyShapeKind = 'people' | 'time' | 'rows' | 'columns' | 'chart' | 'week';

/** Row-like shapes count their rows; columns count their lanes. */
const DEFAULTS: Record<EmptyShapeKind, number> = { people: 4, time: 4, rows: 4, columns: 4, chart: 3, week: 7 };

export function EmptyShape({ kind, count }: { kind: EmptyShapeKind; count?: number }) {
  const n = count ?? DEFAULTS[kind];
  return (
    <span className={`ch-es-shape ch-es-shape--${kind}`} aria-hidden="true" style={{ '--ch-es-n': n } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className="ch-es-shape__u" style={{ '--ch-es-i': i } as CSSProperties} />
      ))}
    </span>
  );
}
