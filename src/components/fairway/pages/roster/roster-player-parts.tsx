'use client';

/**
 * ============================================================================
 * Coach player dossier · parts
 * (docs/design/fairway-facelift/screens/roster-player.v3.md)
 * ----------------------------------------------------------------------------
 * Presentational pieces of the player field sheet. Bare typography on the
 * canvas; the only `Surface` on the page is the stage, composed in
 * `FairwayPlayerProfile`.
 *
 * `RoundStrip` is this page's instrument and stays PAGE-LOCAL: it is not in
 * `modules/`, the modules barrel or `registry.ts`. It reuses `ScoreField`'s
 * own shipped geometry (`dateFraction`, `scoreFieldTicks`, the over/under bar
 * rules) at single-row scale rather than mounting `ScoreField`'s multi-player
 * comparison shell for one player, which its own `avoidFor` rules out.
 *
 * No rail sits under any mark here. The standing ledger's ground is a single
 * VERTICAL zero rule the four rows share; every mark states its own value in
 * mono beside it.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Chip, InlineNotice } from '@/components/fairway';
import { dateFraction, scoreFieldTicks } from '@/components/fairway/modules/ScoreField';
import type { ScoreFieldRound } from '@/components/fairway/modules/types';
import {
  courseLabel,
  formatToParCell,
  girCell,
  roundDateLabel,
  roundHref,
  roundTypeLabel,
  toParTone,
  MISSING,
  type DossierRound,
  type SgLedgerRow,
} from './roster-player-logic';

export const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── The stage instrument: one player's rounds on a date axis ─────────────── */

// Scaled up from `ScoreField`'s per-row 19px half-height: this row IS the
// instrument here, not one of twenty. Measured at 1440 the first pass drew an
// 80px strip under a 100px header beside a 330px readouts rail, which read as
// a hairline lost in its own Surface with 200px of dead cream under it. The
// floor and the same-day nudge are unchanged from ScoreField.tsx:28-29.
const PLOT_HEIGHT = 'h-48';
const HALF_HEIGHT_PX = 80;
const MIN_BAR_PX = 2;
const SAME_DAY_NUDGE_PX = 4;

// NO entrance animation, deliberately — the same call `StandingBars` makes in
// its own docstring ("bars render at their final position and size on first
// paint, always"). `ScoreField`'s staggered `m.span` renders its `initial`
// state (scaleY 0, opacity 0) until framer-motion's feature chunk resolves
// through `LazyMotion`'s async loader, so a slow chunk paints an empty axis.
// That is exactly what a 1440 capture of this page caught: baseline, gutter
// and ticks drawn, twelve marks missing. A decorative entrance is not worth an
// instrument that can render blank.

function StripBar({
  round,
  x,
  nudge,
  cap,
}: {
  round: ScoreFieldRound;
  x: number;
  nudge: number;
  cap: number;
}) {
  const over = round.toPar > 0;
  const under = round.toPar < 0;
  // Clamped to the half-height as well as floored: `scoreFieldCap` tops out at
  // 12 strokes, so a real +15 round would otherwise draw past the plot and
  // into the header. The legend states the scale, so a bar pinned at the top
  // is the honest reading of "off this scale", not a silent truncation.
  const height = round.toPar === 0
    ? MIN_BAR_PX
    : Math.min(HALF_HEIGHT_PX, Math.max(MIN_BAR_PX, Math.round((Math.abs(round.toPar) / cap) * HALF_HEIGHT_PX)));
  return (
    <Link
      href={round.href ?? roundHref(round.id)}
      title={round.label}
      aria-label={round.label}
      style={{ left: `calc(${x}% + ${nudge}px)` }}
      className="absolute top-0 block h-full w-4 -translate-x-1/2 rounded-fw-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
    >
      <span
        aria-hidden="true"
        style={{
          height,
          ...(over ? { bottom: '50%' } : under ? { top: '50%' } : { top: 'calc(50% - 1px)' }),
        }}
        className={cn(
          'absolute left-1/2 block w-[4px] -translate-x-1/2 rounded-full',
          over && 'bg-fw-warning',
          under && 'bg-accent-500',
          !over && !under && 'bg-text-tertiary/70',
        )}
      />
    </Link>
  );
}

const SCALE_GUTTER = '2.5rem';

export function RoundStrip({
  rounds,
  domain,
  cap,
  className,
}: {
  /** Oldest to newest, already bounded to a plottable date domain. */
  rounds: ScoreFieldRound[];
  domain: { start: string; end: string };
  cap: number;
  className?: string;
}) {
  const ticks = useMemo(() => scoreFieldTicks(domain), [domain]);
  const byDay = new Map<string, number>();

  return (
      <figure
        data-slot="round-strip"
        aria-label="Every fetched round against par, oldest to today"
        className={cn('m-0 grid min-w-0 gap-x-2', className)}
        style={{ gridTemplateColumns: `${SCALE_GUTTER} minmax(0,1fr)` }}
      >
        {/* The scale, typeset as part of the page rather than drawn as chart
            furniture: the middle label names the baseline the bars grow from. */}
        <div aria-hidden="true" className={cn('relative', PLOT_HEIGHT)}>
          <span className="absolute right-0 top-0 font-fw-mono text-eyebrow leading-none tabular-nums text-text-tertiary">+{cap}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">par</span>
          <span className="absolute bottom-0 right-0 font-fw-mono text-eyebrow leading-none tabular-nums text-text-tertiary">&minus;{cap}</span>
        </div>

        <div className={cn('relative min-w-0', PLOT_HEIGHT)}>
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
          {rounds.map((round) => {
            const seen = byDay.get(round.date) ?? 0;
            byDay.set(round.date, seen + 1);
            return (
              <StripBar
                key={round.id}
                round={round}
                x={dateFraction(round.date, domain)}
                nudge={seen * SAME_DAY_NUDGE_PX}
                cap={cap}
              />
            );
          })}
        </div>

        <div aria-hidden="true" />
        <div aria-hidden="true" className="relative mt-1 h-5">
          {ticks.map((tick) => (
            <span key={tick.key} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${tick.x}%` }}>
              <span className="block h-1.5 w-px bg-border-strong" />
              {tick.label ? (
                <span className="mt-0.5 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">
                  {tick.label}
                </span>
              ) : null}
            </span>
          ))}
          <span className="absolute right-0 top-0 flex flex-col items-end">
            <span className="block h-1.5 w-px bg-accent-500" />
            <span className="mt-0.5 font-fw-mono text-eyebrow font-normal leading-none text-accent-700">Today</span>
          </span>
        </div>
      </figure>
  );
}

/* ── Ledger · strokes gained off one shared zero rule ─────────────────────── */

// Measured at 1440: a `1fr` label column took 380 of 630px and squeezed every
// bar, and the shared zero rule with them, into the right third. The label
// keeps an 8rem floor so "Around the Green" never wraps in the 336px cell the
// `md` two-up split gives it.
const SG_GRID = 'grid grid-cols-[minmax(8rem,0.85fr)_minmax(6rem,1.15fr)_4.25rem] gap-x-3';

export function StandingLedger({
  rows,
  half,
  unavailable,
}: {
  rows: SgLedgerRow[];
  /** Strokes that reach a full half-width bar. */
  half: number;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <InlineNotice tone="warning" title="Couldn’t load strokes-gained standing">
        Refresh to try again; nothing has been lost.
      </InlineNotice>
    );
  }
  return (
    <ul data-slot="sg-ledger" className="flex flex-col">
      <li className={cn(SG_GRID, 'items-end pb-1.5')}>
        <span className={OVERLINE}>Category</span>
        <span className={cn(OVERLINE, 'text-center')}>Field avg</span>
        {/* "Per round" needs 73px and the column is 68; the abbreviation is
            the same one the readouts column already uses ("Putts/rd"). */}
        <span className={cn(OVERLINE, 'whitespace-nowrap text-right')}>Per rd</span>
      </li>
      {rows.map((row) => {
        const raw = row.raw;
        const pct = raw == null ? 0 : Math.min(50, (Math.abs(raw) / half) * 50);
        const better = raw != null && raw > 0;
        const worse = raw != null && raw < 0;
        return (
          <li key={row.metricId} className="border-t border-border-subtle">
            <Link
              href={row.href}
              className={cn(SG_GRID, 'items-stretch transition-colors hover:bg-surface-hover')}
              aria-label={`${row.fullLabel}, ${row.value} strokes per round`}
            >
              <span className="flex min-w-0 flex-col justify-center gap-0.5 py-2.5">
                <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{row.label}</span>
                {row.cohort ? (
                  <span className="truncate font-fw-sans text-caption text-text-tertiary">{row.cohort}</span>
                ) : null}
              </span>
              {/* The ground is vertical and shared: each row's rule spans its
                  full height, so the four stack into one continuous zero line.
                  No horizontal track sits under any mark. */}
              <span className="relative block self-stretch">
                <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                {raw == null ? null : better || worse ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full',
                      better ? 'left-1/2 bg-accent-500' : 'right-1/2 bg-fw-warning',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-tertiary/70"
                  />
                )}
              </span>
              <span className="self-center py-2.5 text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                {row.value}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Ledger · open focus areas ────────────────────────────────────────────── */

export interface DossierFocusArea {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
}

export function FocusLedger({ areas, genomeHref }: { areas: DossierFocusArea[]; genomeHref: string }) {
  if (areas.length === 0) {
    return (
      <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
        No open focus areas. Add one from the{' '}
        <Link href={genomeHref} className="text-accent-700 hover:text-accent-600">
          Genome tab
        </Link>
        .
      </p>
    );
  }
  return (
    <ul data-slot="focus-ledger" className="flex flex-col">
      {areas.map((fa) => (
        <li
          key={fa.id}
          className="flex items-center justify-between gap-3 border-t border-border-subtle py-2.5 first:border-t-0"
        >
          <span className="min-w-0 font-fw-sans text-body-sm font-medium text-text-primary">
            {fa.title ?? fa.area_type ?? 'Focus area'}
          </span>
          <Chip size="sm" tone={fa.status === 'in_progress' ? 'accent' : 'neutral'} className="shrink-0">
            {fa.status === 'in_progress' ? 'In progress' : (fa.status ?? 'Open')}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

/* ── The table ────────────────────────────────────────────────────────────── */

const TH = 'py-2 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2.5 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

function toParClass(stp: number | null): string {
  const tone = toParTone(stp);
  return tone === 'under' ? 'text-accent-700' : tone === 'over' ? 'text-fw-warning-ink' : 'text-text-secondary';
}

export function RoundLog({ rounds }: { rounds: DossierRound[] }) {
  const router = useRouter();
  return (
    <>
      {/* Phone: the same rows, stacked. A seven-column table on a 390px screen
          either scrolls sideways or truncates the column that identifies the
          row, and both lose more than stacking does. Both branches stay in the
          DOM with CSS choosing between them, so nothing reads a breakpoint at
          runtime and the server and client markup agree. */}
      <ul data-slot="round-log-compact" className="flex flex-col md:hidden">
        {rounds.map((r) => (
          <li key={r.id} className="border-b border-border-subtle last:border-b-0">
            <Link href={roundHref(r.id)} className="flex flex-col gap-1 py-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {courseLabel(r.course_name)}
                </span>
                <span className="shrink-0 font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {r.total_score ?? MISSING}
                  <span className={cn('ml-2 font-medium', toParClass(r.score_to_par))}>
                    {formatToParCell(r.score_to_par)}
                  </span>
                </span>
              </span>
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {roundDateLabel(r.round_date)}
                {roundTypeLabel(r.round_type) ? ` · ${roundTypeLabel(r.round_type)}` : ''}
                {' · '}
                {r.total_putts ?? MISSING} putts
                {' · '}
                {girCell(r.total_gir, r.total_gir_possible)} greens
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table data-slot="round-log" className="w-full border-collapse">
          <caption className="sr-only">Every fetched round for this player</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={cn(TH, 'w-16 md:w-20')}>Date</th>
              <th scope="col" className={TH}>Course</th>
              <th scope="col" className={cn(TH, 'hidden lg:table-cell')}>Type</th>
              <th scope="col" className={cn(TH, NUM)}>Score</th>
              <th scope="col" className={cn(TH, NUM, 'w-14')}>To par</th>
              <th scope="col" className={cn(TH, NUM)}>Putts</th>
              {/* "Greens", not "GIR": the readouts column above already owns
                  "GIR %" as a rate across shot-tracked rounds, and a second
                  header sharing that word beside a per-round count is exactly
                  how two honest numbers get read as one disagreeing number. */}
              <th scope="col" className={cn(TH, NUM)}>Greens</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const href = roundHref(r.id);
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover"
                >
                  <td className={cn(TD, 'font-fw-mono tabular-nums text-text-tertiary')}>{roundDateLabel(r.round_date)}</td>
                  <td className={cn(TD, 'max-w-[16rem] truncate font-medium text-text-primary')}>
                    <Link href={href} className="hover:text-accent-700">{courseLabel(r.course_name)}</Link>
                  </td>
                  <td className={cn(TD, 'hidden lg:table-cell')}>{roundTypeLabel(r.round_type) || MISSING}</td>
                  <td className={cn(TD, NUM, 'font-medium text-text-primary')}>{r.total_score ?? MISSING}</td>
                  <td className={cn(TD, NUM, 'font-medium', toParClass(r.score_to_par))}>{formatToParCell(r.score_to_par)}</td>
                  <td className={cn(TD, NUM)}>{r.total_putts ?? MISSING}</td>
                  <td className={cn(TD, NUM)}>{girCell(r.total_gir, r.total_gir_possible)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
