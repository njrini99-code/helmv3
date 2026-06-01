/**
 * ============================================================================
 * Fairway DataTable — shared types (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * Local types for the Fairway DataTable primitive group. Self-contained so the
 * group never reaches for a top-level shared file other agents might also touch.
 *
 * Built on @tanstack/react-table v8. Consumers pass standard TanStack
 * `ColumnDef`s and (optionally) a `meta` block on each column to opt into
 * Fairway-specific affordances (alignment, numeric/tabular rendering).
 * ========================================================================== */

import type { ColumnDef, Row, RowData } from '@tanstack/react-table';
import type { ReactNode } from 'react';

/** Vertical density presets — controls row height + cell padding. */
export type DataTableDensity = 'comfortable' | 'cozy' | 'compact';

/**
 * Per-column Fairway meta. Merge into a column def via `meta`. All optional —
 * defaults keep columns left-aligned, body voice.
 *
 *   { accessorKey: 'score', header: 'Score', meta: { align: 'right', numeric: true } }
 *
 * Augments TanStack's `ColumnMeta` so `column.columnDef.meta` is typed.
 */
export interface FairwayColumnMeta {
  /** Horizontal alignment of the header + cells. Default `left`. */
  align?: 'left' | 'center' | 'right';
  /**
   * Render the cell with the Fragment Mono tabular treatment (font-fw-mono +
   * tabular-nums). Use for scores / SG / aligned figures. Default `false`.
   */
  numeric?: boolean;
  /** Hint to keep this column from wrapping (e.g. names, dates). */
  noWrap?: boolean;
  /** Extra classes applied to every body cell in this column. */
  cellClassName?: string;
  /** Extra classes applied to this column's header cell. */
  headerClassName?: string;
}

// Make `meta` on a ColumnDef strongly typed with FairwayColumnMeta.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> extends FairwayColumnMeta {}
}

/**
 * An inline row action surfaced in the trailing actions cell. Rendered as a
 * quiet IconButton-style control; reveals on row hover / focus-within and is
 * always present for keyboard users.
 */
export interface DataTableRowAction<TData> {
  /** Stable id (used as React key). */
  id: string;
  /** Accessible label (also the tooltip / aria-label). */
  label: string;
  /** Leading icon node (e.g. a lucide icon at 16px). */
  icon?: ReactNode;
  /** Invoked with the row's original data + the TanStack row. */
  onSelect: (data: TData, row: Row<TData>) => void;
  /** Tone of the action. `danger` paints the icon red on hover. Default `default`. */
  tone?: 'default' | 'danger';
  /** Per-row disable. */
  disabled?: (data: TData) => boolean;
  /** Per-row hide (action absent entirely for this row). */
  hidden?: (data: TData) => boolean;
}

/** Common props every state surface (empty/error) accepts. */
export interface DataTableStateProps {
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Short title line. */
  title: string;
  /** Optional supporting one-liner. */
  description?: ReactNode;
  /** Optional single primary action (Button-like node) rendered below. */
  action?: ReactNode;
  className?: string;
}

/** Re-export for convenience so consumers can `import type { ColumnDef }`. */
export type { ColumnDef, Row };
