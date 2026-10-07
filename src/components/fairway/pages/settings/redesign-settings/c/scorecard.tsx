'use client';

/**
 * TEMP redesign direction C (removed before ship) — the Setup card itself.
 *
 * A scorecard, read the way golfers already read one: a hole-number column,
 * the front nine ("Out") and back nine ("In") each opened by a shaded band
 * with its subtotal, and a ruled Total row. The right-hand column carries the
 * mark: filled = changed from default, hollow = default, blank = the setting
 * has no default. The marks are SVG circles in currentColor, so fill vs ring
 * survives grayscale and forced-colors, and every row states it in words for
 * assistive tech.
 *
 * Local primitive, not kit: the settings kit has no row with a mark column
 * (directions.md, C "Kit").
 */

import { useId } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PressTarget, Skeleton, Surface } from '@/components/fairway';
import { IconChevronRight } from '@/components/icons';
import {
  tallyMarks,
  type RowCell,
  type RowId,
  type RowMark,
  type ScorecardNine,
  type ScorecardRow,
} from './setup-card-model';

/* ── the mark ───────────────────────────────────────────────────────────────── */

export function DefaultMark({ changed, className }: { changed: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      className={cn('h-3 w-3 shrink-0', changed ? 'text-text-primary' : 'text-text-secondary', className)}
    >
      {changed ? (
        <circle cx="6" cy="6" r="5.25" fill="currentColor" />
      ) : (
        <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

function markWords(mark: RowMark): string {
  if (mark.kind !== 'compared') return '';
  return mark.changed ? 'changed from default' : 'default';
}

/* ── grid cells (the columns line up through every row, band and total) ────── */

const NUMBER_CELL =
  'flex w-12 shrink-0 items-center justify-center self-stretch border-r border-border-subtle font-fw-sans tabular-nums';
const MARK_CELL = 'flex w-11 shrink-0 items-center justify-center self-stretch border-l border-border-subtle';

function ValueText({ cell }: { cell: RowCell }) {
  if (cell.status === 'loading') return <Skeleton className="h-3.5 w-20" />;
  if (!cell.value) return null;
  if (cell.tone === 'secret') {
    return (
      <span aria-hidden="true" className="font-fw-sans text-body-sm tracking-widest text-text-secondary">
        ••••••••
      </span>
    );
  }
  return (
    <span
      className={cn(
        'truncate font-fw-sans text-body-sm tabular-nums',
        cell.tone === 'muted' && 'text-text-tertiary',
        cell.tone === 'code' && 'font-medium tracking-wider text-text-primary',
        cell.tone === 'default' && 'text-text-secondary',
      )}
    >
      {cell.value}
    </span>
  );
}

const ROW_CLASS = cn(
  'flex min-h-[52px] w-full items-stretch text-left',
  'hover:bg-surface-sunken focus-visible:bg-surface-sunken',
  'focus-visible:ring-inset focus-visible:ring-offset-0',
);

function RowContent({ number, row }: { number: number; row: ScorecardRow }) {
  const isLink = row.action.kind === 'link';
  return (
    <>
      <span className={cn(NUMBER_CELL, 'text-body-sm text-text-tertiary')}>{number}</span>
      <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        <span className="min-w-0 max-w-[60%] shrink-0 truncate font-fw-sans text-body font-medium text-text-primary">
          {row.label}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <ValueText cell={row.cell} />
          {isLink ? <IconChevronRight size={16} aria-hidden className="shrink-0 text-text-tertiary" /> : null}
        </span>
      </span>
      <span className={MARK_CELL}>
        {row.cell.mark.kind === 'compared' ? <DefaultMark changed={row.cell.mark.changed} /> : null}
      </span>
    </>
  );
}

function rowAccessibleName(number: number, row: ScorecardRow): string {
  const { cell } = row;
  const value =
    cell.status === 'loading'
      ? 'loading'
      : cell.tone === 'secret'
        ? 'hidden'
        : (cell.value ?? '').replace(/ · /g, ', ');
  const destination = row.action.kind === 'link' ? `opens ${row.action.destination}` : '';
  return [`${number}. ${row.label}`, value, markWords(cell.mark), destination].filter(Boolean).join(', ');
}

function ScorecardRowItem({
  number,
  row,
  onOpen,
}: {
  number: number;
  row: ScorecardRow;
  onOpen: (id: RowId) => void;
}) {
  const label = rowAccessibleName(number, row);
  if (row.action.kind === 'link') {
    return (
      <Link
        href={row.action.href}
        aria-label={label}
        className={cn(
          ROW_CLASS,
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          'transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
        )}
      >
        <RowContent number={number} row={row} />
      </Link>
    );
  }
  return (
    <PressTarget aria-label={label} aria-haspopup="dialog" onClick={() => onOpen(row.id)} className={ROW_CLASS}>
      <RowContent number={number} row={row} />
    </PressTarget>
  );
}

/* ── bands and total ────────────────────────────────────────────────────────── */

function NineBand({ nine, headingId }: { nine: ScorecardNine; headingId: string }) {
  const tally = tallyMarks(nine.rows);
  const hasDefaults = tally.compared + tally.pending + tally.unknown > 0;
  return (
    <div className="flex min-h-[40px] items-stretch border-b border-border-subtle bg-surface-tint">
      {/* Named explicitly: the two cells have no text between them, so the
          computed name would otherwise run together ("Out" + "You"). */}
      <h2
        id={headingId}
        aria-label={`${nine.label}: ${nine.descriptor}`}
        className="flex min-w-0 flex-1 items-stretch"
      >
        <span className={cn(NUMBER_CELL, 'text-body-sm font-semibold text-text-primary')}>{nine.label}</span>
        <span className="flex min-w-0 items-center px-3 font-fw-sans text-body-sm text-text-secondary">
          <span className="truncate">{nine.descriptor}</span>
        </span>
      </h2>
      {hasDefaults ? (
        <p className="flex shrink-0 items-center pr-3 font-fw-sans text-caption tabular-nums text-text-secondary">
          {tally.pending > 0 ? (
            <Skeleton className="h-3 w-20" />
          ) : (
            `${tally.changed} of ${tally.compared} changed`
          )}
        </p>
      ) : null}
      <span aria-hidden="true" className={MARK_CELL} />
    </div>
  );
}

function TotalRow({ rows }: { rows: ScorecardRow[] }) {
  const tally = tallyMarks(rows);
  // Held until every counted row has settled: the total appears once, final,
  // never ticking up as sources land.
  const settled = tally.pending === 0;
  return (
    <div className="flex min-h-[52px] items-stretch border-t border-border-strong bg-surface-tint">
      <span aria-hidden="true" className={cn(NUMBER_CELL, 'text-body-sm font-semibold text-text-primary')}>
        Total
      </span>
      <div
        className="flex min-w-0 flex-1 flex-col items-end justify-center px-3 py-2.5 text-right"
        aria-live="polite"
        aria-atomic="true"
      >
        {settled ? (
          <>
            <p className="font-fw-sans text-body-sm tabular-nums text-text-primary">
              <span className="sr-only">Total: </span>
              <span className="font-semibold">{tally.changed}</span> of {tally.compared} changed from defaults
            </p>
            {tally.unknown > 0 ? (
              <p className="font-fw-sans text-caption text-text-secondary">
                {tally.unknown} not counted: couldn’t load
              </p>
            ) : null}
          </>
        ) : (
          <>
            <span className="sr-only">Counting settings changed from defaults</span>
            <Skeleton className="h-3.5 w-44" />
          </>
        )}
      </div>
      <span aria-hidden="true" className={MARK_CELL}>
        {settled ? <DefaultMark changed /> : null}
      </span>
    </div>
  );
}

/* ── the card ───────────────────────────────────────────────────────────────── */

export function Scorecard({
  nines,
  onOpenRow,
}: {
  nines: ScorecardNine[];
  onOpenRow: (id: RowId) => void;
}) {
  const baseId = useId();
  let number = 0;
  return (
    <div>
      <Surface elevation="border" padding="none" className="overflow-hidden">
        {nines.map((nine) => {
          const headingId = `${baseId}-${nine.key}`;
          return (
            <section
              key={nine.key}
              aria-labelledby={headingId}
              className="border-t border-border-subtle first:border-t-0"
            >
              <NineBand nine={nine} headingId={headingId} />
              {nine.note ? (
                <div
                  className={cn(
                    'flex min-h-[52px] items-stretch',
                    nine.rows.length > 0 && 'border-b border-border-subtle',
                  )}
                >
                  <span aria-hidden="true" className={NUMBER_CELL} />
                  <p className="flex flex-1 items-center px-3 py-3 font-fw-sans text-body-sm text-text-secondary">
                    {nine.note}
                  </p>
                  <span aria-hidden="true" className={MARK_CELL} />
                </div>
              ) : null}
              {nine.rows.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {nine.rows.map((row) => {
                    number += 1;
                    return (
                      <li key={row.id}>
                        <ScorecardRowItem number={number} row={row} onOpen={onOpenRow} />
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
        <TotalRow rows={nines.flatMap((nine) => nine.rows)} />
      </Surface>
      <ul
        aria-label="Mark key"
        className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 font-fw-sans text-caption text-text-secondary"
      >
        <li className="inline-flex items-center gap-1.5">
          <DefaultMark changed />
          Changed from default
        </li>
        <li className="inline-flex items-center gap-1.5">
          <DefaultMark changed={false} />
          Default
        </li>
        <li>No mark: no default</li>
      </ul>
    </div>
  );
}

/* ── first paint while the profile loads ───────────────────────────────────── */

/** Shape-matched to the loaded card: two bands, their rows, the total. */
export function ScorecardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading settings…</span>
      <Surface elevation="border" padding="none" className="overflow-hidden">
        {[6, 5].map((count, nine) => (
          <div key={nine} className="border-t border-border-subtle first:border-t-0">
            <div className="flex min-h-[40px] items-stretch border-b border-border-subtle bg-surface-tint">
              <span className={NUMBER_CELL}>
                <Skeleton className="h-3 w-5" />
              </span>
              <span className="flex flex-1 items-center px-3">
                <Skeleton className="h-3 w-24" />
              </span>
              <span className={MARK_CELL} />
            </div>
            <div className="divide-y divide-border-subtle">
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex min-h-[52px] items-stretch">
                  <span className={NUMBER_CELL}>
                    <Skeleton className="h-3 w-4" />
                  </span>
                  <span className="flex flex-1 items-center justify-between gap-3 px-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3.5 w-20" />
                  </span>
                  <span className={MARK_CELL} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex min-h-[52px] items-stretch border-t border-border-strong bg-surface-tint">
          <span className={NUMBER_CELL}>
            <Skeleton className="h-3 w-8" />
          </span>
          <span className="flex flex-1 items-center justify-end px-3">
            <Skeleton className="h-3.5 w-44" />
          </span>
          <span className={MARK_CELL} />
        </div>
      </Surface>
    </div>
  );
}
