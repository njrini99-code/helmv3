/**
 * ============================================================================
 * Fairway DataTable — public barrel (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * The new warm-premium table for admin / CRM / roster / stats-team, built on
 * @tanstack/react-table v8. Import from here, e.g.
 *
 *   import { DataTable, type ColumnDef } from '@/components/fairway/data-table';
 *
 * ADDITIVE: nothing here is imported by an existing page/component. The live
 * app is visually unchanged until a redesigned page opts in.
 * ========================================================================== */

export { DataTable } from './data-table';
export type { DataTableProps } from './data-table';

export { DataTableSkeleton } from './data-table-skeleton';
export type { DataTableSkeletonProps } from './data-table-skeleton';

export { DataTableEmpty, DataTableError } from './data-table-states';

export { densityMetrics, alignClass } from './density';
export type { DensityMetrics } from './density';

export type {
  DataTableDensity,
  DataTableRowAction,
  DataTableStateProps,
  FairwayColumnMeta,
  ColumnDef,
  Row,
} from './types';
