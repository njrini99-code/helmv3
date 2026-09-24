'use client';

/**
 * RoundStrip: the player detail page's signature instrument.
 *
 * Every countable 18-hole round in the window as one vertical bar on a shared
 * to-par axis: over par rises in amber, under par drops in green, level par is
 * a tick on the axis. A 3-round trailing average runs across it as a hairline.
 * The latest round is drawn at full ink and labelled with its score; the best
 * round is marked and labelled. Every bar is a full-height tap column that
 * opens that round's read-only summary.
 *
 * Drawn at first paint (no draw-in, motion-haptics §4 #20). Numbers use the
 * system face with tabular figures (owner decision D-NUM).
 */

import { cn } from '@/lib/utils';
import { bestOf, formatSigned, formatToPar, rollingMean } from './buildPlayerDetailModel';
import type { RoundPoint } from './types';

export interface RoundStripProps {
  /** 18-hole countable rounds, NEWEST first (as the model provides them). */
  rounds: RoundPoint[];
  onSelect: (roundId: string) => void;
  className?: string;
}

/** Scale height, plus label room above and below it. */
const SCALE_H = 148;
const PAD = 22;
const TOTAL_H = SCALE_H + PAD * 2;
const AVG_WINDOW = 3;

function niceCeil(v: number): number {
  if (v <= 2) return 2;
  if (v <= 4) return 4;
  if (v <= 6) return 6;
  if (v <= 8) return 8;
  return Math.ceil(v / 4) * 4;
}

export function RoundStrip({ rounds, onSelect, className }: RoundStripProps) {
  const plotted = rounds.filter((r): r is RoundPoint & { toPar: number } => r.toPar != null);
  const n = plotted.length;
  if (n === 0) return null;
  const ordered = [...plotted].reverse(); // oldest → newest, left → right

  const latest = plotted[0]!;
  const best = bestOf(plotted)!;

  const toPars = ordered.map((r) => r.toPar);
  const avg = n > AVG_WINDOW ? rollingMean(toPars, AVG_WINDOW) : [];
  const avgValues = avg.filter((v): v is number => v != null);
  const all = [...toPars, ...avgValues];

  const maxOver = Math.max(0, ...all);
  const maxUnder = Math.max(0, ...all.map((v) => -v));
  const over = niceCeil(maxOver);
  // A little room under par even when nothing is under it, so level-par ticks
  // and the par line never sit on the floor.
  const under = maxUnder > 0 ? niceCeil(maxUnder) : 1;
  const span = over + under;

  /** px from the top of the strip for a to-par value. */
  const y = (v: number) => PAD + ((over - v) / span) * SCALE_H;
  const zeroY = y(0);

  const avgPoints = avg
    .map((v, i) => (v == null ? null : `${i + 0.5},${y(v)}`))
    .filter(Boolean)
    .join(' ');
  const lastAvg = avgValues[avgValues.length - 1] ?? null;

  return (
    <div data-slot="round-strip" className={cn('w-full', className)}>
      <div className="flex w-full">
        <div className="relative min-w-0 flex-1" style={{ height: TOTAL_H }}>
          <div aria-hidden="true" className="absolute inset-x-0 h-px bg-border-subtle" style={{ top: y(over) }} />
          <div aria-hidden="true" className="absolute inset-x-0 h-px bg-border-strong" style={{ top: zeroY }} />
          {maxUnder > 0 ? (
            <div aria-hidden="true" className="absolute inset-x-0 h-px bg-border-subtle" style={{ top: y(-under) }} />
          ) : null}

          <ol className="absolute inset-0 flex" aria-label="Rounds, oldest to newest">
            {ordered.map((r) => {
              const isLatest = r.id === latest.id;
              const isBest = r.id === best.id;
              const overPar = r.toPar > 0;
              const underPar = r.toPar < 0;
              const barTop = overPar ? y(r.toPar) : zeroY;
              const barH = Math.max(0, Math.abs(y(r.toPar) - zeroY));
              const spoken = `${r.dateLabel}, ${r.course}: ${r.score}, ${
                r.toPar === 0 ? 'level par' : `${Math.abs(r.toPar)} ${overPar ? 'over' : 'under'} par`
              }${isBest ? ', best round' : ''}${isLatest ? ', latest round' : ''}`;
              return (
                <li key={r.id} className="relative h-full min-w-0 flex-1">
                  {/* eslint-disable-next-line helm/no-raw-button -- a chart hit column (full-height, unstyled), not a control */}
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    aria-label={spoken}
                    data-latest={isLatest || undefined}
                    data-best={isBest || undefined}
                    className={cn(
                      'absolute inset-0 rounded-fw-sm outline-none',
                      'transition-colors duration-150 active:bg-surface-sunken',
                      'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-600',
                    )}
                  >
                    {r.toPar === 0 ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute left-1/2 h-[3px] w-[min(14px,70%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-secondary',
                          !isLatest && 'opacity-60',
                        )}
                        style={{ top: zeroY }}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute left-1/2 w-[min(14px,70%)] -translate-x-1/2',
                          overPar ? 'rounded-t-[3px] bg-fw-warning' : 'rounded-b-[3px] bg-accent-500',
                          isLatest ? 'opacity-100' : isBest ? 'opacity-75' : 'opacity-40',
                        )}
                        style={{ top: barTop, height: barH }}
                      />
                    )}
                    {isLatest || isBest ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-fw-sans text-caption tabular-nums leading-4',
                          isLatest ? 'font-semibold text-text-primary' : 'text-text-secondary',
                        )}
                        style={underPar ? { top: y(r.toPar) + 4 } : { top: y(Math.max(r.toPar, 0)) - 20 }}
                      >
                        {isBest ? `Best ${r.score}` : r.score}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>

          {avgPoints ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              viewBox={`0 0 ${n} ${TOTAL_H}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={avgPoints}
                fill="none"
                className="stroke-text-primary"
                strokeWidth={1}
                strokeOpacity={0.65}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="relative w-9 flex-shrink-0 font-fw-sans text-caption tabular-nums leading-4 text-text-tertiary"
          style={{ height: TOTAL_H }}
        >
          <span className="absolute right-0 -translate-y-1/2" style={{ top: y(over) }}>
            {formatToPar(over)}
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: zeroY }}>
            Par
          </span>
          {maxUnder > 0 ? (
            <span className="absolute right-0 -translate-y-1/2" style={{ top: y(-under) }}>
              {formatToPar(-under)}
            </span>
          ) : null}
        </div>
      </div>

      <div aria-hidden="true" className="mr-9 flex justify-between font-fw-sans text-caption tabular-nums text-text-tertiary">
        <span>{ordered[0]!.dateLabel}</span>
        {n > 1 ? <span>{ordered[n - 1]!.dateLabel}</span> : null}
      </div>

      {lastAvg != null ? (
        <p className="mt-3 flex items-center gap-2 font-fw-sans text-caption text-text-secondary">
          <span aria-hidden="true" className="inline-block h-px w-4 bg-text-primary/65" />
          <span>
            3-round average, now{' '}
            <span className="tabular-nums text-text-primary">{formatSigned(lastAvg)}</span> to par
          </span>
        </p>
      ) : null}
    </div>
  );
}
