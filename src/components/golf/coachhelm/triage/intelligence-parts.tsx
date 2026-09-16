'use client';

/**
 * ============================================================================
 * Intelligence (coach) · presentational parts
 * ----------------------------------------------------------------------------
 * The stage instrument, the stage legend, the ledger columns and the dense
 * Signals table. Everything that decides WHAT to show lives in
 * `intelligence-logic.ts`; this file only decides how it looks.
 *
 * ── WHY THE LEAK RAIL IS NOT `modules/RailBars` ────────────────────────────
 * `intelligence.v3.md` specs the stage as `RailBars`, and this is that
 * instrument's geometry to the pixel: a label column, a flexible bar track and
 * a right-aligned mono figure with its sample one step down. Two things made a
 * page-local build the right call rather than the shared module:
 *
 *   1. The spec's own Risks section says `RailBars` needs a `tone` prop and a
 *      per-row `href` before it can serve this screen. Both fields live on
 *      `RailBarRow` in `modules/types.ts`, which this pass does not own. A
 *      page-local instrument needs no edit to `modules/types.ts`,
 *      `modules/index.ts` or `registry.ts`.
 *   2. `RailBars` draws a `bg-surface-sunken` rail under every bar and a 2px
 *      `tickPct` mark part-way along it. LANGUAGE.md's ban is explicit: a rail
 *      under a mark turns the mark into a handle parked on a slider. The bars
 *      here are anchored to a shared vertical zero rule and the across-category
 *      mean is a second vertical rule spanning every row — vertical ground,
 *      which the language asks for, instead of eight private sliders.
 *
 * Everything else is unchanged from the canonical instrument: percentage
 * geometry (no measurement pass, no SVG scaling), one link per row, a capped
 * stagger entrance guarded by `useReducedMotionGuard`, and every mark stating
 * its own value in mono beside it rather than against a distant axis.
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * A leak is bad news, so every bar is amber (`fw-warning`). Green is ink on
 * this page: links and the primary action, nothing else. There is no third
 * hue, which is why the severity legend below the title spends amber on
 * urgent+high, a neutral warm tone on medium and tertiary text on low rather
 * than reaching for red.
 * ========================================================================== */

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { Badge, PressTarget } from '@/components/fairway';
import { DURATION, EASE_CINEMATIC, stagger, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { toCoachVoice } from '@/lib/golf/claim-voice';
import type { GroupedSignal, SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import { formatCategoryLabel, severityLabel } from './buildTriageViewModel';
import {
  formatSignalStrokes,
  occurrencesOf,
  type FocusRow,
  type LeakField,
  type PlayerRow,
  type QueueEntry,
  type SeveritySegment,
} from './intelligence-logic';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/* ── Severity chip ────────────────────────────────────────────────────────── */

/**
 * Severity chip. `urgent`/`high`/`medium` all resolve to the amber `warning`
 * tone and `low` to neutral: LANGUAGE.md allows two hues on a coach page, and
 * a four-grade scale cannot be carried by two. The grade itself is carried by
 * the text label, which is why the label is never abbreviated away.
 */
export function SeverityChip({ severity }: { severity: SignalSeverity }) {
  return (
    <Badge tone={severity === 'low' ? 'neutral' : 'warning'} size="sm">
      {severityLabel(severity)}
    </Badge>
  );
}

/* ── The stage: the leak rail ─────────────────────────────────────────────── */

const LABEL_COL = 108;
const VALUE_COL = 120;

export function LeakRail({
  field,
  hrefForCategory,
  ariaLabel,
}: {
  field: LeakField;
  hrefForCategory: (category: string) => string;
  ariaLabel: string;
}) {
  const prefersReducedMotion = useReducedMotionGuard();
  const { rows, meanPct } = field;

  return (
    <LazyMotion features={loadFeatures}>
      <div
        data-slot="leak-rail"
        role="list"
        aria-label={ariaLabel}
        className="relative grid gap-x-3 gap-y-2.5"
        style={{
          gridTemplateColumns: `${LABEL_COL}px minmax(0,1fr) ${VALUE_COL}px`,
        }}
      >
        {/* Vertical ground. The zero rule is the true baseline — a magnitude
            ranking has no negative side (see intelligence-logic's header) —
            and the mean rule is the only reference mark on the instrument.
            Both span every row rather than repeating per row, which is the
            difference between ground and eight sliders. */}
        <div
          aria-hidden="true"
          className="pointer-events-none relative"
          style={{ gridColumn: 2, gridRow: `1 / ${rows.length + 1}` }}
        >
          <span className="absolute inset-y-0 left-0 w-px bg-border-strong" />
          {meanPct != null ? (
            <span
              className="absolute inset-y-0 w-px bg-warm-400"
              style={{ left: `${Math.min(100, Math.max(0, meanPct))}%` }}
            />
          ) : null}
        </div>

        {rows.map((row, i) => (
          <Fragment key={row.category}>
            <span
              className="truncate font-fw-sans text-caption text-text-secondary"
              style={{ gridColumn: 1, gridRow: i + 1 }}
            >
              {row.label}
            </span>
            <span
              className="relative flex h-[10px] items-center"
              style={{ gridColumn: 2, gridRow: i + 1 }}
            >
              {row.measured ? (
                <m.span
                  aria-hidden="true"
                  className="block h-full rounded-r-full bg-fw-warning"
                  initial={prefersReducedMotion ? false : { opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  style={{ width: `${row.pct}%`, transformOrigin: 'left center' }}
                  transition={{ duration: DURATION.short, delay: stagger(i), ease: EASE_CINEMATIC }}
                />
              ) : null}
            </span>
            <span
              className="flex flex-col items-end leading-tight"
              style={{ gridColumn: 3, gridRow: i + 1 }}
            >
              <span
                className={cn(
                  'whitespace-nowrap font-fw-mono text-caption tabular-nums',
                  row.measured ? 'font-medium text-text-primary' : 'text-text-tertiary',
                )}
              >
                {row.value}
              </span>
              {/* The evidence behind the figure. A category built on one
                  low-confidence signal must not read the same as one built on
                  seven, and the rail cannot show that with length alone. */}
              <span className="whitespace-nowrap font-fw-mono text-microlabel text-text-tertiary">
                {row.sample}
              </span>
            </span>
            {/* One link per row, laid over the whole row rather than wrapping
                it, so every row shares ONE grid and the bar tracks stay aligned
                across rows whatever the mono figures measure. */}
            <Link
              href={hrefForCategory(row.category)}
              aria-label={`${row.label}, ${row.value}, ${row.sample}`}
              className={cn(
                '-mx-1.5 rounded-fw-sm px-1.5 transition-colors [transition-duration:150ms]',
                'hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300',
              )}
              style={{ gridColumn: '1 / -1', gridRow: i + 1 }}
            />
          </Fragment>
        ))}
      </div>
    </LazyMotion>
  );
}

/* ── The stage legend: severity mix ───────────────────────────────────────── */

const SEGMENT_FILL: Record<SignalSeverity, string> = {
  urgent: 'bg-fw-warning',
  high: 'bg-fw-warning/55',
  medium: 'bg-warm-300',
  low: 'bg-text-tertiary/40',
};

export function SeverityLegend({
  segments,
  total,
  urgentHref,
}: {
  segments: SeveritySegment[];
  total: number;
  urgentHref: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-surface-sunken">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.severity} className={cn('block h-full', SEGMENT_FILL[s.severity])} style={{ width: `${s.pct}%` }} />
          ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 font-fw-sans text-caption text-text-secondary">
        {segments.map((s) => (
          <span key={s.severity} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 rounded-full', SEGMENT_FILL[s.severity])} />
            {/* Urgent is the one grade with a filter chip behind it
                (BASE_QUEUE_FILTERS). Inventing chips for the other three to
                make the legend symmetrical would be new scope, so they stay
                plain text rather than dead links. */}
            {s.severity === 'urgent' && s.count > 0 ? (
              <Link href={urgentHref} className="font-fw-mono tabular-nums text-text-primary underline decoration-accent-300 decoration-[1.5px] underline-offset-[4px] hover:decoration-accent-500">
                {s.count}
              </Link>
            ) : (
              <span className="font-fw-mono tabular-nums text-text-primary">{s.count}</span>
            )}
            {s.label}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ── The ledger row ───────────────────────────────────────────────────────── */

export function LedgerColumn({
  id,
  title,
  count,
  className,
  children,
}: {
  id?: string;
  title: string;
  count?: number | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-baseline gap-2.5">
        <h2 className={OVERLINE}>{title}</h2>
        {count != null ? (
          <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{count}</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}

export function LedgerEmpty({ children }: { children: ReactNode }) {
  return <p className="py-1 font-fw-sans text-body-sm text-text-tertiary">{children}</p>;
}

const LEDGER_ROW = 'flex w-full items-start gap-2.5 border-b border-border-subtle py-2.5 text-left last:border-b-0';

/** A queue row: severity, who it belongs to, and the claim in one line. */
export function QueueLedgerRow({ entry, onOpen }: { entry: QueueEntry; onOpen: () => void }) {
  const { signal, group } = entry;
  return (
    <PressTarget
      onClick={onOpen}
      className={cn(LEDGER_ROW, 'transition-colors [transition-duration:150ms] hover:bg-surface-hover/60')}
    >
      <span className="shrink-0 pt-px">
        <SeverityChip severity={signal.severity} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{group.playerName}</span>
        <span className="truncate font-fw-sans text-caption text-text-secondary">
          {toCoachVoice(signal.claim || signal.title, group.playerId ? group.playerName : null)}
        </span>
      </span>
    </PressTarget>
  );
}

export function PlayerLedgerRow({ row, href }: { row: PlayerRow; href: string }) {
  return (
    <div className={LEDGER_ROW}>
      <Link href={href} className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
        {row.playerName}
      </Link>
      <span className="shrink-0">
        <SeverityChip severity={row.severity} />
      </span>
      <span className="w-6 shrink-0 text-right font-fw-mono text-caption tabular-nums text-text-tertiary">
        {row.signalCount}
      </span>
    </div>
  );
}

export function FocusLedgerRow({ row, onOpen }: { row: FocusRow; onOpen: () => void }) {
  return (
    <PressTarget
      onClick={onOpen}
      className={cn(LEDGER_ROW, 'items-baseline transition-colors [transition-duration:150ms] hover:bg-surface-hover/60')}
    >
      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
        {row.playerName}
      </span>
      <span className="min-w-0 max-w-[60%] shrink truncate font-fw-sans text-caption text-text-tertiary">
        {row.title}
      </span>
    </PressTarget>
  );
}

/* ── The table ────────────────────────────────────────────────────────────── */

const TH = 'px-3 py-2 first:pl-0 last:pr-0 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'px-3 py-2.5 first:pl-0 last:pr-0 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

function claimOf(entry: QueueEntry): string {
  return toCoachVoice(entry.signal.claim || entry.signal.title, entry.group.playerId ? entry.group.playerName : null);
}

function strokesCell(signal: GroupedSignal): { text: string; measured: boolean } {
  const text = formatSignalStrokes(signal.strokeImpact);
  return text ? { text, measured: true } : { text: 'Not measured', measured: false };
}

export function SignalsTable({
  entries,
  selectedSignalId,
  onOpen,
}: {
  entries: QueueEntry[];
  selectedSignalId: string | null;
  onOpen: (signalId: string) => void;
}) {
  return (
    <>
      {/* Phone: the same rows, stacked. A six-column table at 390px either
          scrolls sideways or truncates the column that says whose signal this
          is, and both lose more than stacking does. Both branches stay in the
          DOM with CSS choosing between them, so nothing reads a breakpoint at
          runtime and server and client markup agree. */}
      <ul data-slot="signals-compact" className="flex flex-col md:hidden">
        {entries.map((entry) => {
          const strokes = strokesCell(entry.signal);
          return (
            <li key={entry.signal.id} className="border-b border-border-subtle last:border-b-0">
              <PressTarget
                onClick={() => onOpen(entry.signal.id)}
                className={cn(
                  'flex w-full flex-col gap-1.5 py-3 text-left',
                  entry.signal.id === selectedSignalId && 'bg-surface-hover/60',
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-fw-sans text-body-sm font-medium leading-tight text-text-primary">
                    {entry.group.playerName}
                  </span>
                  <span className="shrink-0">
                    <SeverityChip severity={entry.signal.severity} />
                  </span>
                </span>
                <span className="font-fw-sans text-caption leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {claimOf(entry)}
                </span>
                <span className="flex flex-wrap gap-x-3 font-fw-mono text-caption tabular-nums text-text-tertiary">
                  <span className={strokes.measured ? 'text-fw-warning-ink' : undefined}>{strokes.text}</span>
                  <span>{formatCategoryLabel(entry.signal.category)}</span>
                </span>
              </PressTarget>
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block">
        <table data-slot="signals-ledger" className="w-full border-collapse">
          <caption className="sr-only">Open signals</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={cn(TH, 'w-20')}>Severity</th>
              <th scope="col" className={cn(TH, 'w-40')}>Player</th>
              <th scope="col" className={TH}>Claim</th>
              <th scope="col" className={cn(TH, 'hidden w-36 md:table-cell')}>Category</th>
              <th scope="col" className={cn(TH, NUM, 'w-28')}>Strokes</th>
              <th scope="col" className={cn(TH, NUM, 'hidden w-24 lg:table-cell')}>Occurrences</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const strokes = strokesCell(entry.signal);
              const occurrences = occurrencesOf(entry.signal);
              return (
                <tr
                  key={entry.signal.id}
                  onClick={() => onOpen(entry.signal.id)}
                  className={cn(
                    'cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover',
                    entry.signal.id === selectedSignalId && 'bg-surface-hover',
                  )}
                >
                  <td className={TD}>
                    <SeverityChip severity={entry.signal.severity} />
                  </td>
                  <td className={cn(TD, 'truncate font-medium text-text-primary')}>{entry.group.playerName}</td>
                  <td className={cn(TD, 'max-w-0 truncate')}>{claimOf(entry)}</td>
                  <td className={cn(TD, 'hidden truncate md:table-cell')}>
                    {formatCategoryLabel(entry.signal.category)}
                  </td>
                  <td className={cn(TD, NUM, strokes.measured ? 'font-medium text-fw-warning-ink' : 'text-text-tertiary')}>
                    {strokes.text}
                  </td>
                  <td className={cn(TD, NUM, 'hidden lg:table-cell')}>{occurrences ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
