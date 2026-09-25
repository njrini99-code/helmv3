/**
 * ============================================================================
 * Fairway · modules · RoundStrip — one bar per round against the par line
 * ----------------------------------------------------------------------------
 * The field-sheet "stage" for Home and Rounds (spec-dashboard-shell §3.1/§3.3).
 * It replaces a wall of KPI tiles and a chart-in-a-card with a single typeset
 * instrument:
 *
 *   • one bar per round, oldest → newest, evenly spaced
 *   • the par line; a round under par drops BELOW it in green, a round over
 *     par rises ABOVE it in amber, level par is a short tick on the line
 *   • hollow bars for a second series (Rounds: non-qualifiers), filled for
 *     the first
 *   • a dotted rolling average once there are more rounds than its window
 *   • the latest round is named under the axis
 *
 * Numbers go through the display registry (`round_to_par`), so a bar's label
 * reads "+2" / "E" / "−1" exactly like every other golf surface. Dates are
 * split from the 'YYYY-MM-DD' string, never parsed through `Date`, so the
 * server render and the browser always agree (no #418).
 *
 * No hooks: safe in a server component.
 * ========================================================================== */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatMetricText } from '@/lib/golf/metrics/display-registry';

/** Geometry (CSS %/SVG coords), not a displayed number: 2-dp string. */
const css2 = (n: number): string => String(Math.round(n * 100) / 100);

export interface RoundStripPoint {
  id: string;
  /** Calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Strokes to par (18-hole basis where the caller normalizes). */
  toPar: number | null;
  score?: number | null;
  courseName?: string | null;
  /** 'hollow' draws an outline bar (e.g. a practice round beside qualifiers). */
  fill?: 'solid' | 'hollow';
  /** Tapping the bar opens this (the round's review). */
  href?: string;
}

export interface RoundStripProps {
  /** Oldest → newest. Points without a finite `toPar` are skipped. */
  points: RoundStripPoint[];
  /** Accessible name of the whole strip, e.g. "Last 5 rounds, score to par". */
  label: string;
  /** Plot height in px (bars + par line), excluding the date axis. */
  height?: number;
  /** Rolling-average window. The line shows once there are more rounds. */
  rollingWindow?: number;
  /** Above this many rounds the bars are too narrow to tap; they render as a picture. */
  maxLinkedBars?: number;
  className?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → "Sep 17", without timezone math. */
export function formatStripDate(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  return month && d ? `${month} ${Number(d)}` : date;
}

function rollingAverage(values: number[], window: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export function RoundStrip({
  points,
  label,
  height = 160,
  rollingWindow = 5,
  maxLinkedBars = 20,
  className,
}: RoundStripProps) {
  const rounds = points.filter(
    (p): p is RoundStripPoint & { toPar: number } => typeof p.toPar === 'number' && Number.isFinite(p.toPar),
  );
  if (rounds.length === 0) return null;

  const maxUp = Math.max(0, ...rounds.map((r) => r.toPar));
  const maxDown = Math.max(0, ...rounds.map((r) => -r.toPar));
  const span = Math.max(1, maxUp + maxDown);
  // Where the par line sits, as a fraction of the plot from the top. A strip
  // that is all over par puts it at the bottom; all under, at the top.
  const parFrac = maxUp + maxDown === 0 ? 0.5 : maxUp / span;

  const linked = rounds.length <= maxLinkedBars;
  const averages = rounds.length > rollingWindow ? rollingAverage(rounds.map((r) => r.toPar), rollingWindow) : [];
  const avgPoints = averages
    .map((avg, i) => (avg === null ? null : `${i + 0.5},${css2((parFrac - avg / span) * 100)}`))
    .filter((p): p is string => p !== null)
    .join(' ');

  const first = rounds[0]!;
  const latest = rounds[rounds.length - 1]!;
  const summary = `${label}. Latest ${formatStripDate(latest.date)}: ${formatMetricText('round_to_par', latest.toPar)}.`;

  return (
    <figure data-slot="round-strip" className={cn('m-0 flex flex-col gap-2', className)}>
      <div
        className="relative"
        style={{ height }}
        role={linked ? 'group' : 'img'}
        aria-label={summary}
      >
        {/* Par line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-border-strong"
          style={{ top: `${parFrac * 100}%` }}
        >
          <span className="absolute -top-2.5 right-0 bg-canvas pl-1 font-fw-sans text-caption text-text-secondary">
            Par
          </span>
        </div>

        <ol
          className={cn(
            'm-0 flex h-full list-none items-stretch p-0 pr-8',
            rounds.length > 30 ? 'gap-px' : rounds.length > 12 ? 'gap-0.5' : 'gap-2',
          )}
        >
          {rounds.map((r, i) => {
            const isLatest = i === rounds.length - 1;
            const toParText = formatMetricText('round_to_par', r.toPar);
            const tone =
              r.toPar < 0 ? 'under' : r.toPar > 0 ? 'over' : 'level';
            const hollow = r.fill === 'hollow';
            const magnitude = (Math.abs(r.toPar) / span) * 100;
            const barStyle =
              tone === 'over'
                ? { top: `${css2(parFrac * 100 - magnitude)}%`, height: `${css2(magnitude)}%` }
                : tone === 'under'
                  ? { top: `${css2(parFrac * 100)}%`, height: `${css2(magnitude)}%` }
                  : { top: `calc(${css2(parFrac * 100)}% - 1px)`, height: '3px' };
            const bar = (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-1/2 w-full max-w-7 -translate-x-1/2 rounded-fw-sm',
                  tone === 'under' && (hollow ? 'border-2 border-accent-fill' : 'bg-accent-fill'),
                  tone === 'over' && (hollow ? 'border-2 border-fw-warning' : 'bg-fw-warning'),
                  tone === 'level' && 'bg-text-secondary',
                  isLatest && 'ring-2 ring-text-primary ring-offset-2 ring-offset-canvas',
                )}
                style={barStyle}
              />
            );
            const name = [
              formatStripDate(r.date),
              r.courseName ?? null,
              r.score != null ? `${r.score}` : null,
              toParText === 'E' ? 'even par' : `${toParText} to par`,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <li key={r.id} className="relative min-w-0 flex-1">
                {linked && r.href ? (
                  <Link
                    href={r.href}
                    aria-label={name}
                    className="absolute inset-0 rounded-fw-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    {bar}
                  </Link>
                ) : (
                  bar
                )}
              </li>
            );
          })}
        </ol>

        {avgPoints ? (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 right-8 h-full w-[calc(100%-2rem)] text-text-primary"
            viewBox={`0 0 ${rounds.length} 100`}
            preserveAspectRatio="none"
          >
            <polyline
              points={avgPoints}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>

      <figcaption className="flex items-baseline justify-between gap-3 pr-8 font-fw-sans text-caption text-text-secondary">
        <span className="tabular-nums">{rounds.length > 1 ? formatStripDate(first.date) : null}</span>
        {averages.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dotted border-text-primary" />
            {rollingWindow}-round average
          </span>
        ) : null}
        <span className="tabular-nums text-text-primary">
          Latest {formatStripDate(latest.date)} · {formatMetricText('round_to_par', latest.toPar)}
        </span>
      </figcaption>
    </figure>
  );
}
