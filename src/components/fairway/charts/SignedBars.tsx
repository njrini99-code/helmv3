/**
 * SignedBars: where do I (we) gain and lose, against a baseline?
 * (design-direction §5.1; ledger DS-13).
 *
 * One instrument for every signed comparison: strokes-gained categories,
 * standing (percentile − 50), the approach distance ladder, profile
 * dimensions, team categories, insight leaks. Zero-centred horizontal bars:
 * better goes right in green, worse goes left in amber. The direction comes
 * from the registry tone (polarity-aware), not the raw sign, so a "lower is
 * better" metric still draws its good news to the right.
 *
 *   • direct label on the left, sample on a second caption line
 *   • the signed value at the bar end, printed by `formatMetric`
 *   • an early read draws a hollow bar; a row under its floor, or a locked
 *     row, is a ghost: no bar, the reason in secondary ink
 *   • sorted by magnitude; unreadable rows sink to the end
 *   • 44pt rows; a row with `href` is one link
 *   • an optional `total` row sits under a rule, outside the sort
 *
 * A real ordered list, so a screen reader reads each row as text. Drawn at
 * first paint. No hooks, so it renders on the server as well.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  formatMetric,
  formatSample,
  getMetricDefinition,
  type FormattedMetric,
} from '@/lib/golf/metrics/display-registry';
import { css2, spokenMetric } from './spokenMetric';

export interface SignedBarRow {
  id: string;
  /** Direct label ("Putting", "125–150 yd"). */
  label: string;
  /** Registry id that prints the value (sg_putting, strokes_impact, …). */
  metricId: string;
  /** Signed value against the baseline. */
  value: number | null;
  /** Sample behind it (rounds, shots); drives the early and floor reads. */
  sample?: number | null;
  /** A locked row: no number, `lockedReason` in its place. */
  locked?: boolean;
  lockedReason?: string;
  href?: string;
}

export interface SignedBarsProps {
  rows: SignedBarRow[];
  /** Accessible name of the list ("Strokes gained by category, season"). */
  label: string;
  /** A total row under a rule, outside the sort. */
  total?: SignedBarRow;
  /** Half-width of the axis in the value's units; default: the largest magnitude. */
  domain?: number;
  /** Sort by magnitude (default) or keep the given order (a distance ladder). */
  sort?: 'magnitude' | 'none';
  className?: string;
}

interface Read {
  row: SignedBarRow;
  m: FormattedMetric;
  /** Drawn: has a number and is not locked. */
  drawn: boolean;
  magnitude: number;
}

function read(row: SignedBarRow): Read {
  const m = formatMetric(row.metricId, row.value, { sample: row.sample, delta: true });
  const drawn = !row.locked && !m.missing && row.value != null;
  return { row, m, drawn, magnitude: drawn ? Math.abs(row.value!) : 0 };
}

const BAR_TONE = {
  good: { solid: 'bg-accent-fill', hollow: 'border-2 border-accent-fill' },
  bad: { solid: 'bg-fw-warning', hollow: 'border-2 border-fw-warning' },
  neutral: { solid: 'bg-text-tertiary', hollow: 'border-2 border-text-tertiary' },
} as const;

const VALUE_TONE = {
  good: 'text-fw-success-ink',
  bad: 'text-fw-warning-ink',
  neutral: 'text-text-primary',
} as const;

/** Room kept at each end of the track for the value label. */
const LABEL_ROOM = '3.25rem';

function BarRow({ r, domain }: { r: Read; domain: number }) {
  const { row, m, drawn } = r;
  const frac = drawn && domain > 0 ? Math.min(1, r.magnitude / domain) : 0;
  // Direction from the registry tone; a neutral (zero) value draws no bar.
  const right = m.tone === 'good' || (m.tone === 'neutral' && (row.value ?? 0) >= 0);
  const early = m.readQuality === 'early';
  const barLen = `calc((50% - ${LABEL_ROOM}) * ${css2(frac)})`;
  const reason = row.locked ? (row.lockedReason ?? 'Locked') : m.qualityNote ?? 'No data';
  const caption = [row.sample != null && drawn ? formatSample(row.sample, getMetricDefinition(row.metricId).sampleNoun) : null, early ? 'Early read' : null]
    .filter(Boolean)
    .join(' · ');
  const spoken = drawn ? `${row.label}: ${spokenMetric(m)}` : `${row.label}: ${reason}`;

  const body = (
    <>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className="w-[38%] min-w-0 flex-shrink-0 py-1.5 pr-3">
        <span className={cn('block break-words text-body', drawn ? 'text-text-primary' : 'text-text-secondary')}>
          {row.label}
        </span>
        {caption ? <span className="block text-caption text-text-secondary tabular-nums">{caption}</span> : null}
      </span>
      <span aria-hidden="true" className="relative min-h-11 flex-1 self-stretch">
        <span className="absolute inset-y-1 left-1/2 w-px bg-border-strong" />
        {drawn ? (
          <>
            {frac > 0 ? (
              <span
                data-bar={right ? 'right' : 'left'}
                className={cn(
                  'absolute top-1/2 h-3 -translate-y-1/2 rounded-full',
                  BAR_TONE[m.tone][early ? 'hollow' : 'solid'],
                )}
                style={right ? { left: '50%', width: barLen } : { right: '50%', width: barLen }}
              />
            ) : null}
            <span
              className={cn(
                'absolute top-1/2 -translate-y-1/2 text-body tabular-nums',
                early ? 'text-text-secondary' : VALUE_TONE[m.tone],
              )}
              style={
                right
                  ? { left: `calc(50% + ${barLen} + 0.375rem)` }
                  : { right: `calc(50% + ${barLen} + 0.375rem)` }
              }
            >
              {m.text}
            </span>
          </>
        ) : (
          <span className="absolute inset-y-0 left-[calc(50%+0.5rem)] flex items-center text-footnote text-text-secondary">
            {reason}
          </span>
        )}
      </span>
    </>
  );

  const rowClass = 'flex w-full items-center text-left font-fw-sans';
  return (
    <li data-row={row.id} data-drawn={drawn || undefined} className="border-b border-border-subtle last:border-b-0">
      {row.href ? (
        <Link
          href={row.href}
          className={cn(
            rowClass,
            'outline-none transition-colors duration-100 active:bg-surface-sunken motion-reduce:transition-none',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

export function SignedBars({ rows, label, total, domain, sort = 'magnitude', className }: SignedBarsProps) {
  const reads = rows.map(read);
  const ordered =
    sort === 'magnitude'
      ? [...reads].sort((a, b) => Number(b.drawn) - Number(a.drawn) || b.magnitude - a.magnitude)
      : reads;
  const totalRead = total ? read(total) : null;
  const max = domain ?? Math.max(0, ...reads.map((r) => r.magnitude), totalRead?.magnitude ?? 0);

  return (
    <div data-slot="signed-bars" className={cn('w-full', className)}>
      <ol aria-label={label} className="m-0 list-none p-0">
        {ordered.map((r) => (
          <BarRow key={r.row.id} r={r} domain={max} />
        ))}
      </ol>
      {totalRead ? (
        <ol aria-label="Total" className="m-0 list-none border-t border-border-strong p-0">
          <BarRow r={totalRead} domain={max} />
        </ol>
      ) : null}
    </div>
  );
}
