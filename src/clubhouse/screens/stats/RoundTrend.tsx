'use client';

import Link from 'next/link';
import { EmptyState } from '../../ui/States';
import { gappedPath } from '../../lib/chart';
import { formatSigned } from '../../lib/format';
import { needsText } from '../../lib/stats-signal';
import { sgBaseline, type ChSgTour } from '../../lib/sg';
import { useChartPin } from '../../lib/use-chart-pin';
import { slotPositions } from '../../ui/charts/Line';
import { ChartTable } from '../../ui/charts/ChartTable';
import { meanSeries, niceTicks, parLine, readTrendRound, tickDigits, trendNote, trendState, withValue, type TrendKind, type TrendRound } from './round-trend';

const PAD = { l: 34, r: 14, t: 14, b: 24 } as const;

/**
 * Every round as a dot, a trailing five-round average through them from the third round, and a par line (or zero, for strokes
 * gained). A mouse over the plot, a finger dragged sideways, or the arrow keys read one round in the line above; a tap or a
 * key pins it and offers "Open round"; Esc or a press outside lets go. Scores plot with the better ones higher, said on the
 * chart. An early read (under five scores, eight rounds of shots) draws hollow dots with a tag, never fewer or shrunk.
 */
export function RoundTrend({
  rounds,
  kind,
  size = 'phone',
  label,
  openHref,
  tour = 'pga',
}: {
  /** Oldest first. */
  rounds: TrendRound[];
  kind: TrendKind;
  /** Whose Tour strokes gained is measured against, for the zero line's words (A8.3); the men's Tour unless the team says otherwise. */
  tour?: ChSgTour;
  size?: 'phone' | 'desktop';
  /** What the chart's group is called for a screen reader, before the arrow-key hint. */
  label: string;
  /** Where "Open round" goes for a round, or null for none (the review is not rebuilt for this viewer). */
  openHref?: (id: string) => string | null;
}) {
  const W = size === 'phone' ? 340 : 680;
  const H = size === 'phone' ? 168 : 184;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const n = rounds.length;
  // Rounds are spaced by their dates (row 119): a three-week break looks like one, not like the day after.
  const slots = slotPositions(n, rounds.map((r) => r.at));
  const pin = useChartPin(n, 'x', [PAD.l / W, 1 - PAD.r / W], slots);

  const known = withValue(rounds);
  if (known.length === 0 || (kind === 'sg' && known.length < 3)) {
    return <EmptyState compact code={kind === 'sg' ? 'CH-5309' : 'CH-5302'} title={kind === 'sg' ? 'No strokes gained trend yet.' : 'No rounds in this window.'} body={kind === 'sg' ? `${needsText('sgLong')} with shots. ${known.length} so far.` : undefined} />;
  }
  if (known.length === 1 && kind === 'score') {
    const r = known[0]!;
    // Keeps the chart's frame, so the panels below stay put when the second round arrives.
    return (
      <div className="ch-stm-chart-hold ch-sv-rt__hold">
        <p className="ch-stm-note">
          One round so far: <span className="ch-num">{Math.round(r.value! * 10) / 10}</span> on {r.label}. The trend draws from the second.
        </p>
      </div>
    );
  }

  const means = meanSeries(rounds);
  const par = kind === 'score' ? parLine(rounds) : null;
  const ref = kind === 'score' ? par : 0;
  const values = known.map((r) => r.value as number);
  const lo0 = Math.min(...values, ref ?? Infinity, ...means.filter((m): m is number => m != null));
  const hi0 = Math.max(...values, ref ?? -Infinity, ...means.filter((m): m is number => m != null));
  const pad = Math.max((hi0 - lo0) * 0.12, kind === 'score' ? 1 : 0.5);
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  // The better value sits higher: a lower score, a higher strokes gained.
  const y = (v: number) => PAD.t + (kind === 'score' ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * plotH;
  const x = (i: number) => PAD.l + slots[i]! * plotW;
  const ticks = niceTicks(lo, hi, 3);
  const state = trendState(kind, rounds);
  const hollow = state === 'early';
  // Strokes gained ticks step by half a stroke when the span is small: one decimal then, so no two ticks print alike (A8.2).
  const digits = tickDigits(ticks);
  const fmt = (v: number) => (kind === 'score' ? String(Math.round(v)) : formatSigned(v, digits));
  const readout = (i: number | null) => (i == null ? null : readTrendRound(kind, rounds[i]!, means[i] ?? null));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  const href = pin.pinned != null && openHref ? openHref(rounds[pin.pinned]!.id) : null;
  const last = known.length ? rounds.map((r, i) => (r.value == null ? -1 : i)).filter((i) => i >= 0).pop()! : -1;

  return (
    <div
      className="ch-sv-rt"
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each round, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label={`${label} Use the arrow keys to read each round.`}
      {...pin.container}
    >
      <div className="ch-sv-rt__head">
        <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
          {shown ?? trendNote(kind, rounds)}
        </p>
        {href && (
          <Link href={href} className="ch-sv-open" data-ch-press="">
            Open round
          </Link>
        )}
      </div>
      <p className="ch-sr-only" aria-live="polite">
        {spoken}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="ch-sv-rt__svg" aria-hidden="true" focusable="false" {...pin.area}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="ch-sv-rt__grid" />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="ch-sv-rt__t">
              {fmt(t)}
            </text>
          </g>
        ))}
        {ref != null && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(ref)} y2={y(ref)} className="ch-sv-rt__ref" />
            <text x={W - PAD.r} y={y(ref) - 4} textAnchor="end" className="ch-sv-rt__t">
              {kind === 'score' ? `Par ${Math.round(ref)}` : sgBaseline(tour).zero}
            </text>
          </g>
        )}
        {pin.active != null && <line x1={x(pin.active)} x2={x(pin.active)} y1={PAD.t - 4} y2={H - PAD.b} className="ch-sv-rt__guide" />}
        <path d={gappedPath(means, x, y)} className="ch-sv-rt__mean" fill="none" />
        {rounds.map((r, i) =>
          r.value == null ? null : (
            <circle
              key={r.id}
              cx={x(i)}
              cy={y(r.value)}
              r={i === pin.active ? 5 : i === last ? 3.6 : 3}
              className={'ch-sv-rt__dot' + (hollow ? ' is-hollow' : '') + (i === pin.active ? ' is-active' : '') + (i === pin.pinned ? ' is-pinned' : '')}
            />
          ),
        )}
        <text x={PAD.l} y={H - 6} className="ch-sv-rt__t">
          {rounds[0]!.label}
        </text>
        {kind === 'score' && (
          <text x={PAD.l + plotW / 2} y={H - 6} textAnchor="middle" className="ch-sv-rt__t">
            ↑ Lower is better
          </text>
        )}
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="ch-sv-rt__t">
          {rounds[n - 1]!.label}
        </text>
      </svg>
      {/* The rounds, for a screen reader that asks for them after the summary (AX-17). */}
      <ChartTable
        caption={label}
        columns={['Round', 'Course', kind === 'score' ? 'Score per 18' : 'Strokes gained per 18']}
        rows={rounds.map((r) => [r.label, r.course ?? '', r.value == null ? 'No figure' : kind === 'score' ? String(Math.round(r.value)) : formatSigned(r.value)])}
      />
    </div>
  );
}
