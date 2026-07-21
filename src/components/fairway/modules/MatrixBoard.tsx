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
 * SAME row/header grid swaps its `grid-template-columns` at `min-[940px]:`
 * via two CSS custom properties (`--mtx-mobile` / `--mtx-desktop`) computed
 * once from `columns`, and the mockup's "Trend"/"Signal" columns (matched by
 * `key`) are hidden below 940px exactly like `.h-tr`/`.h-sig`/`.sig` in the
 * source CSS. 940px is the SAME spine/stage stacking threshold used by
 * `StatsSpineStage` / the CoachHelm homes, so the board's own column
 * collapse lines up with the shell's single-column breakpoint instead of
 * drifting at Tailwind's `sm` (640px).
 * ========================================================================== */

import { useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PressTarget } from '../controls';
import type { MatrixBoardProps, MatrixBoardRow as MatrixBoardRowData, MatrixColumn } from './types';

/** Columns hidden below the 940px breakpoint (mockup `.h-tr`, `.h-sig`, `.sig`). */
const HIDE_ON_MOBILE = new Set(['scor', 'composite', 'trend', 'signal']);

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
  '[grid-template-columns:var(--mtx-mobile)] min-[940px]:[grid-template-columns:var(--mtx-desktop)]';

/** Hairline borders for the KPI band, correct at both the 2-col (mobile)
 *  and 4-col (min-[940px]) arrangements: a vertical divider between the
 *  two visual columns at every width, plus a horizontal divider between
 *  the two wrapped rows ONLY below 940px (the 4-col arrangement is a
 *  single row, so it never wants one). */
function kpiBandCellClass(i: number): string {
  return cn(
    'border-border-subtle',
    i % 2 === 1 && 'border-l',
    i >= 2 && 'border-t',
    'min-[940px]:border-t-0',
    i > 0 && i % 2 === 0 && 'min-[940px]:border-l',
  );
}

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
        <div className="grid grid-cols-2 border-b border-border-subtle min-[940px]:grid-cols-4">
          {kpis.map((kpi, i) => (
            <div key={kpi.label} className={cn('px-5 py-3.5', kpiBandCellClass(i))}>
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
            HIDE_ON_MOBILE.has(col.key) && 'hidden min-[940px]:block',
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
  const expandId = useId();

  return (
    <div data-slot="matrix-row-group">
      <PressTarget
        aria-label={row.ariaLabel}
        aria-expanded={hasExpand ? open : undefined}
        aria-controls={hasExpand && open ? expandId : undefined}
        onClick={hasExpand ? () => setOpen((v) => !v) : undefined}
        className={cn(
          'grid w-full items-center gap-0 px-5 py-2.5 text-left transition-colors duration-150',
          'hover:bg-surface-tint',
          open && 'bg-accent-50 shadow-[inset_3px_0_0_var(--fw-color-accent-500)]',
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
                col && HIDE_ON_MOBILE.has(col.key) && 'hidden min-[940px]:flex min-[940px]:items-center',
              )}
            >
              {cell}
            </div>
          );
        })}
      </PressTarget>
      {hasExpand && open ? <MatrixExpand id={expandId}>{row.expand}</MatrixExpand> : null}
    </div>
  );
}

function MatrixExpand({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      data-slot="matrix-expand"
      className="border-b border-border-subtle bg-surface-sunken px-5 py-4 shadow-[inset_3px_0_0_var(--fw-color-accent-300)]"
    >
      {children}
    </div>
  );
}
