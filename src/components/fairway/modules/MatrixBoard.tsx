'use client';

/**
 * ============================================================================
 * Fairway · modules · MatrixBoard — the roster-as-one-instrument board
 * (mockup `.board` / `.board-kpis` / `.mhead` / `.mrow` / `.xrow`)
 * ----------------------------------------------------------------------------
 * A KPI band, a header row, then N data rows. Each row is a real `<button>`
 * (uniform hover/focus, mockup convention); rows that carry `expand` content
 * additionally get `aria-expanded` and toggle an inline sunken detail band
 * directly beneath themselves — no navigation, the depth opens IN the board.
 *
 * Responsive: rather than forking a separate mobile card component, the
 * SAME row/header grid swaps its `grid-template-columns` at `sm:` via two
 * CSS custom properties (`--mtx-mobile` / `--mtx-desktop`) computed once
 * from `columns`, and the mockup's "Trend"/"Signal" columns (matched by
 * `key`) are hidden below `sm` exactly like `.h-tr`/`.h-sig`/`.sig` in the
 * source CSS.
 * ========================================================================== */

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { MatrixBoardProps, MatrixBoardRow as MatrixBoardRowData, MatrixColumn } from './types';

/** Columns hidden below `sm` (mockup `.h-tr`, `.h-sig`, `.sig`). */
const HIDE_ON_MOBILE = new Set(['trend', 'signal']);

function trackFor(col: MatrixColumn, isFirst: boolean): string {
  if (isFirst) return 'minmax(120px,1.6fr)';
  if (col.key === 'trend') return '96px';
  if (col.key === 'signal') return 'minmax(110px,1.2fr)';
  return 'minmax(48px,1fr)';
}

function gridTemplate(columns: MatrixColumn[], mobile: boolean): string {
  const visible = mobile ? columns.filter((c) => !HIDE_ON_MOBILE.has(c.key)) : columns;
  const first = columns[0];
  return visible.map((c) => trackFor(c, c === first)).join(' ');
}

const GRID_COLS_CLASS =
  '[grid-template-columns:var(--mtx-mobile)] sm:[grid-template-columns:var(--mtx-desktop)]';

/**
 * The team-stats board: KPI band + sortable-style header + ranked rows, any
 * of which can expand an inline detail band. See `types.ts` for the prop
 * contract (`MatrixBoardProps`).
 */
export function MatrixBoard({ kpis, columns, rows }: MatrixBoardProps) {
  const gridVars = {
    '--mtx-mobile': gridTemplate(columns, true),
    '--mtx-desktop': gridTemplate(columns, false),
  } as CSSProperties;

  return (
    <div
      data-slot="matrix-board"
      style={gridVars}
      className="overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]"
    >
      {kpis.length > 0 ? (
        <div className="grid grid-cols-4 border-b border-border-subtle">
          {kpis.map((kpi, i) => (
            <div
              key={kpi.label}
              className={cn('px-5 py-3.5', i > 0 && 'border-l border-border-subtle')}
            >
              <div className="font-fw-display text-eyebrow font-bold uppercase tracking-[0.1em] text-text-tertiary">
                {kpi.label}
              </div>
              <div className="mt-0.5 font-fw-mono text-h2 tracking-[-0.02em] text-text-primary tabular-nums">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <MatrixHeader columns={columns} />

      {rows.map((row, i) => (
        <MatrixRow key={row.id} row={row} columns={columns} isLast={i === rows.length - 1} />
      ))}
    </div>
  );
}

function MatrixHeader({ columns }: { columns: MatrixColumn[] }) {
  return (
    <div
      role="row"
      className={cn(
        'grid items-center gap-0 border-b border-border-subtle px-5 py-2.5',
        GRID_COLS_CLASS,
      )}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          role="columnheader"
          className={cn(
            'font-fw-display text-eyebrow font-bold uppercase tracking-[0.09em] text-text-tertiary',
            col.align === 'center' && 'text-center',
            HIDE_ON_MOBILE.has(col.key) && 'hidden sm:block',
          )}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}

function MatrixRow({
  row,
  columns,
  isLast,
}: {
  row: MatrixBoardRowData;
  columns: MatrixColumn[];
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasExpand = row.expand != null;

  return (
    <div data-slot="matrix-row-group">
      <button
        type="button"
        aria-label={row.ariaLabel}
        aria-expanded={hasExpand ? open : undefined}
        onClick={hasExpand ? () => setOpen((v) => !v) : undefined}
        className={cn(
          'grid w-full items-center gap-0 px-5 py-2.5 text-left transition-colors duration-150',
          'hover:bg-surface-tint motion-reduce:transition-none',
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          !(isLast && !hasExpand) && 'border-b border-border-subtle',
          GRID_COLS_CLASS,
        )}
      >
        {row.cells.map((cell, i) => {
          const col = columns[i];
          return (
            <div
              key={col?.key ?? i}
              className={cn(
                col?.align === 'center' && 'flex justify-center',
                col && HIDE_ON_MOBILE.has(col.key) && 'hidden sm:flex sm:items-center',
              )}
            >
              {cell}
            </div>
          );
        })}
      </button>
      {hasExpand && open ? <MatrixExpand>{row.expand}</MatrixExpand> : null}
    </div>
  );
}

function MatrixExpand({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="matrix-expand"
      className="border-b border-border-subtle bg-surface-sunken px-5 py-3.5"
    >
      {children}
    </div>
  );
}
