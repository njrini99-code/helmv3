/**
 * TeamField: how is every player trending? (design-direction §5.1; ledger DS-13).
 *
 * Coach Home's stage: one row per player, the name over a compact RoundStrip,
 * the average and its change at the row end. The strips follow
 * `modules/RoundStrip` (one bar per round from the par line, under par drops
 * in green, over par rises in amber, level par is a tick, `fill: 'hollow'`
 * outlines a second series) and share one to-par scale, so a bar means the
 * same thing in every row.
 *
 * The instrument computes no statistics: the caller passes each player's
 * average and delta from the model (the countable-round rule lives there).
 * `sort="trend"` puts the largest rise in average first, so the players who
 * are slipping lead; players with no delta sink to the end.
 *
 * A real ordered list: each row reads as text, the strip itself is a
 * picture. A row with `href` is one link. Drawn at first paint. No hooks, so
 * it renders on the server as well.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatMetric, formatSample } from '@/lib/golf/metrics/display-registry';
import type { RoundStripPoint } from '../modules/RoundStrip';
import { css2, spokenMetric } from './spokenMetric';

export interface TeamFieldPlayer {
  id: string;
  name: string;
  /** Oldest → newest. Points without a finite `toPar` are skipped. */
  rounds: RoundStripPoint[];
  /** Mean score to par over the window, from the model. */
  average: number | null;
  /** Change in that average (recent − earlier), from the model. */
  delta: number | null;
  /** Rounds behind the average; defaults to the plotted rounds. */
  sample?: number;
  href?: string;
}

export interface TeamFieldProps {
  players: TeamFieldPlayer[];
  /** Accessible name of the list ("Team, last 30 days"). */
  label: string;
  sort?: 'trend' | 'none';
  className?: string;
}

const METRIC = 'scoring_average_vs_par';
const STRIP_H = 28;

type Plotted = RoundStripPoint & { toPar: number };

function plotted(rounds: RoundStripPoint[]): Plotted[] {
  return rounds.filter((r): r is Plotted => typeof r.toPar === 'number' && Number.isFinite(r.toPar));
}

function MiniStrip({ rounds, maxUp, span }: { rounds: Plotted[]; maxUp: number; span: number }) {
  const parFrac = maxUp / span;
  return (
    <div aria-hidden="true" data-strip className="relative mt-1" style={{ height: STRIP_H }}>
      <span className="absolute inset-x-0 border-t border-border-strong" style={{ top: `${css2(parFrac * 100)}%` }} />
      <span className="absolute inset-0 flex items-stretch gap-0.5">
        {rounds.map((r) => {
          const tone = r.toPar < 0 ? 'under' : r.toPar > 0 ? 'over' : 'level';
          const hollow = r.fill === 'hollow';
          const mag = (Math.abs(r.toPar) / span) * 100;
          const style =
            tone === 'over'
              ? { top: `${css2(parFrac * 100 - mag)}%`, height: `${css2(mag)}%` }
              : tone === 'under'
                ? { top: `${css2(parFrac * 100)}%`, height: `${css2(mag)}%` }
                : { top: `calc(${css2(parFrac * 100)}% - 1px)`, height: '3px' };
          return (
            <span key={r.id} className="relative min-w-0 max-w-3 flex-1">
              <span
                data-bar={tone}
                className={cn(
                  'absolute inset-x-0 rounded-full',
                  tone === 'under' && (hollow ? 'border border-accent-fill' : 'bg-accent-fill'),
                  tone === 'over' && (hollow ? 'border border-fw-warning' : 'bg-fw-warning'),
                  tone === 'level' && 'bg-text-secondary',
                )}
                style={style}
              />
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function TeamField({ players, label, sort = 'trend', className }: TeamFieldProps) {
  const rows = players.map((p) => ({ p, rounds: plotted(p.rounds) }));
  const allToPar = rows.flatMap((r) => r.rounds.map((x) => x.toPar));
  const maxUp = Math.max(0, ...allToPar);
  const maxDown = Math.max(0, ...allToPar.map((v) => -v));
  // Room for a level-par tick when every round sits on one side of par.
  const span = Math.max(1, maxUp + maxDown);
  const top = maxUp === 0 && maxDown === 0 ? 0.5 : maxUp;

  const ordered =
    sort === 'trend'
      ? [...rows].sort((a, b) => {
          if (a.p.delta == null) return b.p.delta == null ? 0 : 1;
          if (b.p.delta == null) return -1;
          return b.p.delta - a.p.delta;
        })
      : rows;

  return (
    <ol data-slot="team-field" aria-label={label} className={cn('m-0 w-full list-none p-0 font-fw-sans', className)}>
      {ordered.map(({ p, rounds }) => {
        const sample = p.sample ?? rounds.length;
        const avg = formatMetric(METRIC, p.average, { sample });
        const delta = formatMetric(METRIC, avg.missing ? null : p.delta, { delta: true });
        const spoken = [
          p.name,
          formatSample(sample),
          `average ${spokenMetric(avg)}`,
          delta.missing ? null : `change ${spokenMetric(delta)}`,
        ]
          .filter(Boolean)
          .join(', ');

        const body = (
          <>
            <span className="sr-only">{spoken}</span>
            <span aria-hidden="true" className="min-w-0 flex-1">
              <span className="block break-words text-body text-text-primary">{p.name}</span>
              {rounds.length > 0 ? (
                <MiniStrip rounds={rounds} maxUp={top} span={span} />
              ) : (
                <span className="block text-footnote text-text-secondary">No rounds in this window</span>
              )}
            </span>
            <span aria-hidden="true" className="flex w-16 flex-shrink-0 flex-col items-end text-right">
              <span
                data-avg
                className={cn(
                  'text-body tabular-nums',
                  avg.missing || avg.readQuality === 'early' ? 'text-text-secondary' : 'text-text-primary',
                )}
              >
                {avg.text}
              </span>
              {!delta.missing ? (
                <span
                  data-delta
                  className={cn(
                    'text-footnote tabular-nums',
                    delta.tone === 'good'
                      ? 'text-fw-success-ink'
                      : delta.tone === 'bad'
                        ? 'text-fw-warning-ink'
                        : 'text-text-secondary',
                  )}
                >
                  {delta.text}
                </span>
              ) : null}
            </span>
          </>
        );

        const rowClass = 'flex w-full items-center gap-3 py-2.5 text-left';
        return (
          <li key={p.id} data-player={p.id} className="border-b border-border-subtle last:border-b-0">
            {p.href ? (
              <Link
                href={p.href}
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
      })}
    </ol>
  );
}
