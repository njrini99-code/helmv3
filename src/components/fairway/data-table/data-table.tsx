'use client';

/**
 * ============================================================================
 * Fairway DataTable (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * The warm-premium data table for admin / CRM / roster / stats-team. Headless
 * behavior from @tanstack/react-table v8 (sorting, row selection, column
 * sizing); bespoke calm Fairway styling on top.
 *
 * Features
 *  - Column defs via standard TanStack `ColumnDef` (+ optional Fairway `meta`).
 *  - Sorting: click / keyboard-activate a sortable header; aria-sort announced.
 *  - Row selection: per-row + select-all checkbox, accent-50 selected wash +
 *    accent left bar. Controlled or uncontrolled.
 *  - Sticky, light, opaque header (border-strong) so it survives scroll.
 *  - Subtle row hover (surface-tint), optional warm zebra.
 *  - Inline row actions (reveal on hover/focus-within; always keyboard-present).
 *  - Density presets: comfortable | cozy | compact.
 *  - States: loading (shape-matched skeleton), empty, error — never a spinner,
 *    never authoritative fake zeros.
 *
 * Styling assumes it renders inside a `.fairway-ds` scope on a `bg-canvas`
 * page. All tokens come from the locked Fairway set (bg-surface, border-subtle,
 * accent-*, rounded-card, shadow-soft, font-fw-*). No raw hex, no inline glass
 * (tables are matte by §4.3).
 *
 * Interactive-state contract (§7.1): every interactive element ships hover +
 * focus-visible (green ring) + active. Motion honors prefers-reduced-motion
 * via Tailwind `motion-reduce:` utilities (no JS animation here).
 * ========================================================================== */

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type TableOptions,
  type Updater,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { alignClass, densityMetrics } from './density';
import { DataTableSkeleton } from './data-table-skeleton';
import { DataTableEmpty, DataTableError } from './data-table-states';
import type { DataTableDensity, DataTableRowAction } from './types';

/* ------------------------------------------------------------------------- */
/* Sub-parts                                                                  */
/* ------------------------------------------------------------------------- */

/** A warm checkbox styled to match the system (matte, accent when checked). */
const TableCheckbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }
>(function TableCheckbox({ className, indeterminate, ...props }, forwardedRef) {
  const innerRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={innerRef}
      type="checkbox"
      className={cn(
        'size-[18px] cursor-pointer appearance-none rounded-[5px] border border-border-strong bg-surface',
        'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'checked:border-accent-500 checked:bg-accent-500',
        'indeterminate:border-accent-500 indeterminate:bg-accent-500',
        // Tick mark via background image when checked.
        "checked:bg-[length:13px_13px] checked:bg-center checked:bg-no-repeat",
        "checked:[background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FFFEFA' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E\")]",
        'hover:border-accent-500',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

/** Sort affordance — three states (none / asc / desc) drawn with chevrons. */
function SortGlyph({ dir }: { dir: false | 'asc' | 'desc' }) {
  return (
    <span aria-hidden="true" className="ml-1.5 inline-flex flex-col leading-none">
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        className={cn(
          '-mb-px transition-colors [transition-duration:180ms]',
          dir === 'asc' ? 'text-accent-600' : 'text-text-tertiary/50',
        )}
      >
        <path d="M4 0L8 5H0z" fill="currentColor" />
      </svg>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        className={cn(
          'transition-colors [transition-duration:180ms]',
          dir === 'desc' ? 'text-accent-600' : 'text-text-tertiary/50',
        )}
      >
        <path d="M4 5L0 0h8z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Trailing inline-actions cell. Reveals on hover/focus; always present for keyboard. */
function RowActions<TData>({
  actions,
  row,
}: {
  actions: DataTableRowAction<TData>[];
  row: Row<TData>;
}) {
  const data = row.original;
  const visible = actions.filter((a) => !a.hidden?.(data));
  if (visible.length === 0) return null;
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-0.5',
        // Quiet at rest; reveal on row hover or any focus within the row.
        'opacity-0 transition-opacity [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'group-hover/row:opacity-100 group-focus-within/row:opacity-100',
        // Always visible for touch / reduced-motion / no-hover environments.
        '[@media(hover:none)]:opacity-100 motion-reduce:opacity-100',
      )}
    >
      {visible.map((action) => {
        const disabled = action.disabled?.(data) ?? false;
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.label}
            title={action.label}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              action.onSelect(data, row);
            }}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-fw-sm',
              'text-text-tertiary transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
              'hover:bg-surface-sunken hover:text-text-secondary',
              action.tone === 'danger' && 'hover:bg-fw-danger-bg hover:text-fw-danger',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
              'active:translate-y-[0.5px]',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            {action.icon ?? <span className="text-body-sm font-fw-sans">{action.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Props                                                                      */
/* ------------------------------------------------------------------------- */

export interface DataTableProps<TData> {
  /** Row data. */
  data: TData[];
  /** Standard TanStack column defs (may carry Fairway `meta`). */
  columns: ColumnDef<TData, unknown>[];

  /** Density preset. Default `comfortable` (~44px rows). */
  density?: DataTableDensity;
  /** Warm zebra striping on alternate rows. Default `false` (spacing > lines). */
  zebra?: boolean;
  /** Sticky header that survives scroll. Default `true`. */
  stickyHeader?: boolean;

  /** Enable sorting. Default `true`. Pass `false` to lock order. */
  enableSorting?: boolean;
  /** Controlled sorting state. */
  sorting?: SortingState;
  /** Sorting change handler (controlled). */
  onSortingChange?: OnChangeFn<SortingState>;

  /** Enable per-row selection checkboxes. Default `false`. */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  /** Controlled selection state. */
  rowSelection?: RowSelectionState;
  /** Selection change handler (controlled). */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Stable row id resolver (recommended when selecting). */
  getRowId?: TableOptions<TData>['getRowId'];

  /** Inline trailing actions revealed per row. */
  rowActions?: DataTableRowAction<TData>[];

  /** Whole-row click handler. Adds row affordances (cursor, hover, keyboard). */
  onRowClick?: (data: TData, row: Row<TData>) => void;

  /** Loading → shape-matched skeleton (never a spinner). */
  loading?: boolean;
  /** Number of skeleton rows while loading. Default 6. */
  loadingRows?: number;

  /** Error → error state in place of rows. Truthy string used as the message. */
  error?: string | null | false;
  /** Retry handler — renders a retry button in the error state. */
  onRetry?: () => void;

  /** Override the empty-state body. */
  emptyState?: React.ReactNode;
  /** Override the error-state body. */
  errorState?: React.ReactNode;

  /** Accessible caption / label for the table (visually hidden). */
  ariaLabel?: string;
  /** Optional visible caption rendered above the grid. */
  caption?: React.ReactNode;

  /** Classes for the outer Surface wrapper. */
  className?: string;
  /** Classes for the scroll container. */
  containerClassName?: string;
}

/* ------------------------------------------------------------------------- */
/* Component                                                                  */
/* ------------------------------------------------------------------------- */

export function DataTable<TData>({
  data,
  columns,
  density = 'comfortable',
  zebra = false,
  stickyHeader = true,
  enableSorting = true,
  sorting: controlledSorting,
  onSortingChange,
  enableRowSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  getRowId,
  rowActions,
  onRowClick,
  loading = false,
  loadingRows = 6,
  error = null,
  onRetry,
  emptyState,
  errorState,
  ariaLabel,
  caption,
  className,
  containerClassName,
}: DataTableProps<TData>) {
  const m = densityMetrics(density);

  // Uncontrolled fallbacks — lets the table work with zero wiring.
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({});

  const sorting = controlledSorting ?? internalSorting;
  const setSorting: OnChangeFn<SortingState> = React.useCallback(
    (updater: Updater<SortingState>) => {
      if (onSortingChange) onSortingChange(updater);
      else setInternalSorting(updater);
    },
    [onSortingChange],
  );

  const rowSelection = controlledSelection ?? internalSelection;
  const setRowSelection: OnChangeFn<RowSelectionState> = React.useCallback(
    (updater: Updater<RowSelectionState>) => {
      if (onRowSelectionChange) onRowSelectionChange(updater);
      else setInternalSelection(updater);
    },
    [onRowSelectionChange],
  );

  const hasActions = !!rowActions && rowActions.length > 0;

  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableSorting,
    enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleColumnCount = columns.length;
  const totalColSpan =
    visibleColumnCount + (enableRowSelection ? 1 : 0) + (hasActions ? 1 : 0);

  const rows = table.getRowModel().rows;
  const showEmpty = !loading && !error && rows.length === 0;

  return (
    <section
      className={cn(
        // Matte Surface (§4.2): border OR shadow at rest — border only here.
        'overflow-hidden rounded-card border border-border-subtle bg-surface',
        'font-fw-sans text-text-primary',
        className,
      )}
    >
      {caption ? (
        <div className="border-b border-border-subtle px-4 py-3 text-body-sm text-text-secondary">
          {caption}
        </div>
      ) : null}

      <div
        className={cn('w-full overflow-x-auto overflow-y-auto', containerClassName)}
        // Roving focus for keyboard users scrolling a long grid.
        role="region"
        aria-label={ariaLabel ?? 'Data table'}
        tabIndex={0}
      >
        <table
          className="w-full border-collapse text-left"
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
        >
          {ariaLabel ? <caption className="sr-only">{ariaLabel}</caption> : null}

          {/* ---- Header: light, opaque, sticky ---- */}
          <thead
            className={cn(
              'bg-surface',
              stickyHeader && 'sticky top-0 z-[1]',
              // Opaque (no glass on data tables) + a strong warm divider underline.
              'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-strong',
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="relative">
                {enableRowSelection && (
                  <th scope="col" className={cn('w-10 px-4 align-middle', m.headerCell)}>
                    <TableCheckbox
                      aria-label={
                        table.getIsAllRowsSelected()
                          ? 'Deselect all rows'
                          : 'Select all rows'
                      }
                      checked={table.getIsAllRowsSelected()}
                      indeterminate={table.getIsSomeRowsSelected()}
                      onChange={table.getToggleAllRowsSelectedHandler()}
                    />
                  </th>
                )}

                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const ariaSort =
                    sortDir === 'asc'
                      ? 'ascending'
                      : sortDir === 'desc'
                        ? 'descending'
                        : canSort
                          ? 'none'
                          : undefined;

                  const headerContent = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      style={{ width: header.getSize() ? header.getSize() : undefined }}
                      className={cn(
                        m.headerCell,
                        m.cellX,
                        'align-middle',
                        'text-eyebrow uppercase tracking-[0.06em] text-text-tertiary',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                        meta?.headerClassName,
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'group/sort -mx-1.5 inline-flex max-w-full items-center rounded-fw-sm px-1.5 py-1',
                            'font-fw-sans text-eyebrow uppercase tracking-[0.06em]',
                            'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
                            'hover:text-text-secondary',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                            'active:translate-y-[0.5px]',
                            sortDir && 'text-text-secondary',
                            (meta?.align === 'right' || meta?.align === 'center') &&
                              'mx-auto',
                            meta?.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          <span className="truncate">{headerContent}</span>
                          <SortGlyph dir={sortDir} />
                        </button>
                      ) : (
                        <span className="truncate">{headerContent}</span>
                      )}
                    </th>
                  );
                })}

                {hasActions && (
                  <th scope="col" className={cn('w-16 px-3 text-right', m.headerCell)}>
                    <span className="sr-only">Row actions</span>
                  </th>
                )}
              </tr>
            ))}
          </thead>

          {/* ---- Body ---- */}
          <tbody>
            {/* Loading → shape-matched skeleton */}
            {loading && (
              <DataTableSkeleton
                columns={visibleColumnCount}
                rows={loadingRows}
                density={density}
                selectable={!!enableRowSelection}
                hasActions={hasActions}
              />
            )}

            {/* Error state */}
            {!loading && error && (
              <tr>
                <td colSpan={totalColSpan} className="p-0">
                  {errorState ?? (
                    <DataTableError
                      title="Couldn’t load this data"
                      description={typeof error === 'string' ? error : undefined}
                      action={
                        onRetry ? (
                          <button
                            type="button"
                            onClick={onRetry}
                            className={cn(
                              'inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4',
                              'text-label text-text-primary',
                              'transition-all [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
                              'hover:shadow-soft hover:border-border-strong',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                              'active:translate-y-[0.5px]',
                            )}
                          >
                            Try again
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </td>
              </tr>
            )}

            {/* Empty state */}
            {showEmpty && (
              <tr>
                <td colSpan={totalColSpan} className="p-0">
                  {emptyState ?? (
                    <DataTableEmpty
                      title="Nothing here yet"
                      description="There’s no data to show in this view."
                    />
                  )}
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading &&
              !error &&
              rows.map((row, idx) => {
                const isSelected = row.getIsSelected();
                const clickable = !!onRowClick;
                return (
                  <tr
                    key={row.id}
                    data-selected={isSelected || undefined}
                    aria-selected={enableRowSelection ? isSelected : undefined}
                    className={cn(
                      'group/row relative border-b border-border-subtle/70 last:border-b-0',
                      'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
                      // Warm zebra (opt-in) — spacing is preferred, but supported.
                      zebra && idx % 2 === 1 && !isSelected && 'bg-surface-tint/40',
                      // Subtle hover.
                      'hover:bg-surface-tint/70',
                      // Selection: accent wash + left accent bar (via ::before).
                      isSelected &&
                        'bg-accent-50 hover:bg-accent-50 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent-500',
                      clickable && 'cursor-pointer',
                      clickable &&
                        'focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-500',
                    )}
                    {...(clickable
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          onClick: () => onRowClick(row.original, row),
                          onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(row.original, row);
                            }
                          },
                        }
                      : {})}
                  >
                    {enableRowSelection && (
                      <td className={cn(m.cell, 'px-4 align-middle')}>
                        <TableCheckbox
                          aria-label={`Select row ${idx + 1}`}
                          checked={isSelected}
                          disabled={!row.getCanSelect()}
                          onChange={row.getToggleSelectedHandler()}
                          // Don't let a row checkbox click bubble to row onClick.
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}

                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            m.cell,
                            m.cellX,
                            m.text,
                            'align-middle text-text-primary',
                            alignClass(meta?.align).split(' ')[0], // text-align only
                            meta?.numeric && 'font-fw-mono tabular-nums text-text-primary',
                            meta?.noWrap ? 'whitespace-nowrap' : 'whitespace-normal',
                            meta?.cellClassName,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}

                    {hasActions && (
                      <td className={cn(m.cell, 'px-3 align-middle')}>
                        <RowActions actions={rowActions!} row={row} />
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
