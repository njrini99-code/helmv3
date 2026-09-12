'use client';

/**
 * ============================================================================
 * Team stats · presentational parts
 * ----------------------------------------------------------------------------
 * The readouts, the ledger columns and the dense category-detail table.
 * Everything that decides WHAT to show lives in `team-stats-logic.ts`; this
 * file only decides how it looks.
 *
 * Bare typography on the canvas. The only Surface on this page is the stage in
 * `TeamStatsBoard`; nothing here draws a box.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { Sparkline, Meter, PressTarget } from '@/components/fairway';
import { MicroBar, SignalChip } from '@/components/fairway/modules';
import { cn } from '@/lib/utils';
import { fmtSg, type TeamBoardRowViewModel } from './buildTeamBoardViewModel';
import { EN_DASH, rosterHref, type CategoryReading, type FundamentalRow } from './team-stats-logic';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── Readouts ─────────────────────────────────────────────────────────────── */

export interface TeamReadoutItem {
  key: string;
  label: string;
  /**
   * A `ReactNode`, not a string: the trajectory readout is three counts with
   * their own direction glyphs, which is why this cannot reuse
   * `FieldReadouts`' own `string | null` value. The class strings below are
   * copied from `coach-home-parts.tsx`'s `FieldReadouts` so the two pages share
   * one rhythm rather than inventing a second, with one change: this rail
   * carries three items against home's four, and `justify-between` over a rail
   * as tall as a nine-row field pushed them so far apart the column read as
   * empty rather than as a stack.
   */
  value: React.ReactNode;
  note?: string;
}

export function TeamReadouts({ items }: { items: TeamReadoutItem[] }) {
  return (
    <dl
      data-slot="team-readouts"
      className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4 md:gap-x-8 xl:flex xl:grid-cols-none xl:flex-col xl:justify-start xl:gap-y-0 xl:divide-y xl:divide-border-subtle"
    >
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-col gap-1 py-2 xl:py-3.5 xl:first:pt-0 xl:last:pb-0">
          <dt className={cn(OVERLINE, 'flex min-h-[2.25em] items-start xl:block xl:min-h-0')}>{item.label}</dt>
          <dd className="flex items-end justify-between gap-3">{item.value}</dd>
          <dd className="font-fw-sans text-caption text-text-tertiary">{item.note ?? ' '}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The plain mono face every readout value that is just a number wears. */
export function ReadoutNumber({ children }: { children: React.ReactNode }) {
  return <span className="font-fw-mono text-h2 font-medium leading-none tabular-nums text-text-primary">{children}</span>;
}

export function TrajectoryKpi({ trajectory }: { trajectory: { improving: number; steady: number; declining: number } }) {
  return (
    <span className="inline-flex items-baseline gap-2.5 font-fw-mono text-h3 font-medium tabular-nums">
      <span className="inline-flex items-center gap-0.5 text-accent-700">
        {trajectory.improving}
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="inline-flex items-center gap-0.5 text-text-tertiary">
        {trajectory.steady}
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="inline-flex items-center gap-0.5 text-fw-warning-ink">
        {trajectory.declining}
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
      </span>
    </span>
  );
}

/* ── Ledger columns ───────────────────────────────────────────────────────── */

export function LedgerColumn({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 className={OVERLINE}>{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function LedgerNote({ children }: { children: React.ReactNode }) {
  return <p className="font-fw-sans text-body-sm text-text-tertiary">{children}</p>;
}

/**
 * The leak list: the four categories worst first, each stating its own value in
 * mono beside a bar drawn on the ONE shared scale the stage uses. The tornado
 * this replaces was the same information inside a box inside a bento cell.
 */
export function LeakList({ readings, domain, tourLabel }: { readings: CategoryReading[]; domain: number; tourLabel: string }) {
  return (
    <div className="flex flex-col">
      {readings.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
          <span className="min-w-0 truncate font-fw-sans text-body-sm text-text-primary">{r.prose}</span>
          <span className="flex shrink-0 items-center gap-2.5">
            <span
              className={cn(
                'w-12 text-right font-fw-mono text-body-sm font-medium tabular-nums',
                r.value === null ? 'text-text-tertiary' : r.value < 0 ? 'text-fw-warning-ink' : 'text-accent-700',
              )}
            >
              {r.value === null ? EN_DASH : fmtSg(r.value)}
            </span>
            {r.value === null ? (
              // Never a zero-length bar for an absent reading: that draws the
              // team sitting exactly on the Tour baseline, a measurement
              // nobody took.
              <span aria-hidden="true" className="inline-block w-[56px]" />
            ) : (
              <MicroBar
                value={r.value}
                domain={domain}
                goodDirection="high"
                width={56}
                height={6}
                label={`${r.prose}: ${fmtSg(r.value)} strokes a round versus ${tourLabel}`}
              />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LeadersList({ leaders }: { leaders: Array<{ key: string; prose: string; id: string; name: string }> }) {
  return (
    <div className="flex flex-col">
      {leaders.map((l) => (
        <div key={l.key} className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">{l.prose}</span>
          <Link href={rosterHref(l.id)} className="min-w-0 truncate text-right font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
            {l.name}
          </Link>
        </div>
      ))}
    </div>
  );
}

export function FundamentalsList({ rows }: { rows: FundamentalRow[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
          <span className="min-w-0 truncate font-fw-sans text-body-sm text-text-primary">{row.label}</span>
          <span className={cn('shrink-0 font-fw-mono text-body-sm font-medium tabular-nums', row.missing ? 'text-text-tertiary' : 'text-text-primary')}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── The category-detail table ────────────────────────────────────────────── */

const TH = 'px-2.5 py-2 first:pl-0 last:pr-0 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'px-2.5 py-2.5 first:pl-0 last:pr-0 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

function sgTone(display: string): string {
  if (display === EN_DASH) return 'text-text-tertiary';
  if (display.startsWith('−')) return 'text-fw-warning-ink';
  if (display.startsWith('+')) return 'text-accent-700';
  return 'text-text-secondary';
}

function ExpandStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className={OVERLINE}>{label}</div>
      <b className="block truncate font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{value}</b>
    </div>
  );
}

/** The triage band a row opens: the player's fundamentals and the three places
 *  a coach goes next. Label over value in the ledger's own typography. */
function ExpandBand({ row }: { row: TeamBoardRowViewModel }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
      <ExpandStat label="Fairways" value={row.expand.fairways} />
      <ExpandStat label="GIR" value={row.expand.gir} />
      <ExpandStat label="Scrambling" value={row.expand.scrambling} />
      <ExpandStat label="Putts / 18" value={row.expand.puttsPerRound} />
      <ExpandStat label="Birdies / 18" value={row.expand.birdiesPerRound} />
      <ExpandStat label={row.expand.worstMetricLabel ?? 'Worst metric'} value={row.expand.worstMetricValue ?? EN_DASH} />
      <ExpandStat label="SG Putt" value={row.expand.sgPutt} />
      <ExpandStat label="Last round" value={row.expand.lastRound} />
      <div className="col-span-full flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-3 font-fw-sans text-caption text-text-secondary">
        <Link href={row.expand.links.fullStats} className="font-semibold text-accent-700 hover:underline">
          Full stats
        </Link>
        <Link href={row.expand.links.fingerprint} className="font-semibold text-accent-700 hover:underline">
          Fingerprint
        </Link>
        <Link href={row.expand.links.prescribe} className="font-semibold text-accent-700 hover:underline">
          Prescribe focus area
        </Link>
      </div>
    </div>
  );
}

export function CategoryDetailTable({ rows }: { rows: TeamBoardRowViewModel[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const toggle = React.useCallback((id: string) => setOpenId((prev) => (prev === id ? null : id)), []);

  return (
    <>
      {/* Phone: the same rows, stacked. A ten-column table at 390px either
          scrolls sideways or truncates the one cell that identifies the row,
          and both lose more than stacking does. Both branches stay in the DOM
          with CSS choosing between them, so nothing reads a breakpoint at
          runtime and the server and client markup agree. */}
      <ul data-slot="category-detail-compact" className="flex flex-col md:hidden">
        {rows.map((row) => {
          const open = openId === row.id;
          return (
            <li key={row.id} className="border-b border-border-subtle last:border-b-0">
              <PressTarget
                onClick={() => toggle(row.id)}
                aria-expanded={open}
                className="flex w-full flex-col gap-1.5 py-3 text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-fw-sans text-body-sm font-semibold leading-tight text-text-primary">{row.name}</span>
                  <SignalChip tone={row.signal.tone}>{row.signal.label}</SignalChip>
                </span>
                <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {row.roundsPlayed} rds {'·'} {row.scoringAverage} avg
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 font-fw-mono text-caption tabular-nums">
                  <span className={sgTone(row.sg.tee)}>Tee {row.sg.tee}</span>
                  <span className={sgTone(row.sg.app)}>App {row.sg.app}</span>
                  <span className={sgTone(row.sg.short)}>Grn {row.sg.short}</span>
                  <span className={sgTone(row.sg.putt)}>Putt {row.sg.putt}</span>
                </span>
              </PressTarget>
              {open ? <div className="pb-2">
                <ExpandBand row={row} />
              </div> : null}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table data-slot="category-detail" className="w-full border-collapse">
          <caption className="sr-only">Category detail by player</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={TH}>Player</th>
              <th scope="col" className={cn(TH, NUM)}>Rds</th>
              <th scope="col" className={cn(TH, NUM, 'whitespace-nowrap')}>Scoring</th>
              <th scope="col" className={cn(TH, NUM)}>SG Tee</th>
              <th scope="col" className={cn(TH, NUM)}>SG App</th>
              <th scope="col" className={cn(TH, NUM)}>SG Grn</th>
              <th scope="col" className={cn(TH, NUM)}>SG Putt</th>
              <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Composite</th>
              <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Trend</th>
              <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = openId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => toggle(row.id)}
                    className={cn(
                      'cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover',
                      open && 'bg-surface-hover',
                    )}
                  >
                    <td className={cn(TD, 'max-w-[16rem]')}>
                      <PressTarget
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.id);
                        }}
                        aria-expanded={open}
                        className="flex min-w-0 flex-col text-left"
                      >
                        <b className="block truncate font-fw-sans text-body-sm font-semibold text-text-primary">{row.name}</b>
                        <span className="block truncate font-fw-sans text-caption text-text-tertiary">
                          {row.classYear ? `${row.classYear} · ` : ''}
                          {row.roundsPlayed} rds
                        </span>
                      </PressTarget>
                    </td>
                    <td className={cn(TD, NUM)}>{row.roundsPlayed}</td>
                    <td className={cn(TD, NUM, 'font-medium text-text-primary')}>{row.scoringAverage}</td>
                    <td className={cn(TD, NUM, sgTone(row.sg.tee))}>{row.sg.tee}</td>
                    <td className={cn(TD, NUM, sgTone(row.sg.app))}>{row.sg.app}</td>
                    <td className={cn(TD, NUM, sgTone(row.sg.short))}>{row.sg.short}</td>
                    <td className={cn(TD, NUM, sgTone(row.sg.putt))}>{row.sg.putt}</td>
                    <td className={cn(TD, 'hidden lg:table-cell')}>
                      {row.composite !== null ? (
                        <span className="flex w-full items-center gap-2">
                          <span className="w-6 flex-shrink-0 text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                            {Math.round(row.composite)}
                          </span>
                          <Meter value={row.composite} min={0} max={100} size="sm" label={`${row.name} composite score`} className="min-w-0 flex-1" />
                        </span>
                      ) : (
                        <span className="font-fw-mono text-body-sm text-text-tertiary">{EN_DASH}</span>
                      )}
                    </td>
                    <td className={cn(TD, 'hidden lg:table-cell')}>
                      <Sparkline data={row.trendSeries} goodDirection="down" label={`${row.name} scoring trend`} />
                    </td>
                    <td className={cn(TD, 'hidden lg:table-cell')}>
                      <SignalChip tone={row.signal.tone}>{row.signal.label}</SignalChip>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border-subtle bg-surface-hover/40">
                      <td colSpan={10} className="px-0 pb-1">
                        <ExpandBand row={row} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
