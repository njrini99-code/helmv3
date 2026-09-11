'use client';

/**
 * ============================================================================
 * Qualifiers · presentational parts
 * ----------------------------------------------------------------------------
 * The ledger columns and the dense table. Everything that decides WHAT to show
 * lives in qualifiers-field-logic.ts; this file only decides how it looks.
 * ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { GolfQualifier } from '@/lib/types/golf';
import { qualifierStatusMeta } from './qualifier-status';
import { detailHref, selectionStateLabel, statusOf } from './qualifiers-field-logic';

// Every column here is a date or a small count, so the headers sit close
// enough to read as one run of words without their own gutter.
const TH = 'px-3 py-2 first:pl-0 last:pr-0 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'px-3 py-2.5 first:pl-0 last:pr-0 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

/* ── A ledger column: a head, then hairline rows ──────────────────────────── */

export function LedgerColumn({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function LedgerEmpty({ children }: { children: React.ReactNode }) {
  return <p className="font-fw-sans text-body-sm text-text-tertiary">{children}</p>;
}

/** One ledger row: a name that goes somewhere, and one fact about it. */
export function LedgerRow({ name, href, fact, factTone = 'quiet' }: { name: string; href: string; fact: string; factTone?: 'quiet' | 'urgent' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
      <Link href={href} className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
        {name}
      </Link>
      <span
        className={cn(
          'shrink-0 font-fw-mono text-caption tabular-nums',
          factTone === 'urgent' ? 'font-medium text-fw-warning-ink' : 'text-text-tertiary',
        )}
      >
        {fact}
      </span>
    </div>
  );
}

/* ── The table ────────────────────────────────────────────────────────────── */

export function QualifiersTable({
  rows,
  formatDate,
}: {
  rows: GolfQualifier[];
  formatDate: (d: string) => string;
}) {
  const router = useRouter();
  return (
    <>
      {/* Phone: the same rows, stacked. A nine-column table on a 390px screen
          either scrolls sideways or truncates the one column that identifies
          the row, and both lose more than stacking does. Both branches stay in
          the DOM with CSS choosing between them, so nothing reads a breakpoint
          at runtime and the server and client markup agree. */}
      <ul data-slot="qualifiers-ledger-compact" className="flex flex-col md:hidden">
        {rows.map((q) => {
          const href = detailHref(q.id);
          const meta = qualifierStatusMeta(statusOf(q));
          return (
            <li key={q.id} className="border-b border-border-subtle last:border-b-0">
              <Link href={href} className="flex flex-col gap-1.5 py-3">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-fw-sans text-body-sm font-medium leading-tight text-text-primary">
                    {q.name ?? 'Untitled qualifier'}
                  </span>
                  <StatusPill tone={meta.tone} dot={false} size="sm" className="shrink-0">
                    {meta.label}
                  </StatusPill>
                </span>
                <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {formatDate(q.start_date)}
                  {' \u00b7 '}
                  {q.num_rounds} {q.num_rounds === 1 ? 'round' : 'rounds'}
                  {q.spots_available == null ? '' : ` \u00b7 ${q.spots_available} spots`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
      <table data-slot="qualifiers-ledger" className="w-full border-collapse">
        <caption className="sr-only">All qualifiers</caption>
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className={TH}>Name</th>
            <th scope="col" className={TH}>Status</th>
            <th scope="col" className={cn(TH, NUM)}>Start</th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>End</th>
            <th scope="col" className={cn(TH, NUM, 'hidden whitespace-nowrap md:table-cell')}>Entries close</th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>Rounds</th>
            <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>Spots</th>
            <th scope="col" className={cn(TH, 'hidden xl:table-cell')}>Course</th>
            <th scope="col" className={cn(TH, 'hidden xl:table-cell')}>Lineup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const href = detailHref(q.id);
            const meta = qualifierStatusMeta(statusOf(q));
            return (
              <tr
                key={q.id}
                onClick={() => router.push(href)}
                className="cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover"
              >
                <td className={cn(TD, 'max-w-[16rem] truncate font-medium text-text-primary')}>
                  <Link href={href} className="hover:text-accent-700">{q.name ?? 'Untitled qualifier'}</Link>
                </td>
                <td className={TD}>
                  <StatusPill tone={meta.tone} dot={false} size="sm">{meta.label}</StatusPill>
                </td>
                <td className={cn(TD, NUM)}>{formatDate(q.start_date)}</td>
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{q.end_date ? formatDate(q.end_date) : '–'}</td>
                {/* entry_deadline has never rendered in this UI before, so its
                    dash is a new fallback rather than an inherited one. */}
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{q.entry_deadline ? formatDate(q.entry_deadline) : '–'}</td>
                {/* num_rounds is integer NOT NULL DEFAULT 1, so it needs no dash. */}
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{q.num_rounds}</td>
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>{q.spots_available ?? '–'}</td>
                <td className={cn(TD, 'hidden max-w-[14rem] truncate xl:table-cell')}>{q.course_name ?? '–'}</td>
                <td className={cn(TD, 'hidden xl:table-cell')}>{selectionStateLabel(q.selection_state)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
