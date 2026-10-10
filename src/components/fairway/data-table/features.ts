/**
 * Fairway DataTable — TanStack Table v9 feature set.
 *
 * v9 is opt-in: a table only gets the state slices, APIs, row models and sort
 * functions registered here. DataTable uses sorting + row selection, so this
 * registers exactly those, plus the sort functions v8 resolved for
 * `sortingFn: 'auto'` (datetime / alphanumeric / text / basic) so auto-sorted
 * columns order the same way they did on v8. `columnMeta` is a type-only slot
 * that types `columnDef.meta` as FairwayColumnMeta (it replaces v8's global
 * `ColumnMeta` declaration merge).
 */

import {
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';
import type { FairwayColumnMeta } from './types';

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  columnMeta: {} as FairwayColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
