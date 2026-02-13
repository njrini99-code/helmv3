'use client';

import { useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RowActionsMenu } from './row-actions-menu';
import { Checkbox } from './checkbox';
import { Pagination } from './pagination';
import { TableSkeleton } from './table-skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { Column, TableProps, RowAction } from '@/lib/types/table';

// ============================================
// DEFAULT MOBILE CARD
// Auto-generated card layout when no custom
// renderMobileCard is provided.
// ============================================

function DefaultMobileCard<T extends Record<string, unknown>>({
  row,
  columns,
  getCellValue,
  isSelected,
  selectable,
  onSelectRow,
  rowId,
  actions,
}: {
  row: T;
  columns: Column<T>[];
  getCellValue: (row: T, column: Column<T>) => React.ReactNode;
  isSelected: boolean;
  selectable: boolean;
  onSelectRow?: (rowId: string) => void;
  rowId: string;
  actions: RowAction[];
}) {
  const primaryCol = columns[0];
  const otherCols = columns.slice(1);

  return (
    <div
      className={cn(
        'bg-white rounded-xl border p-4 shadow-sm',
        'transition-all duration-200',
        isSelected
          ? 'border-primary-300 bg-primary-50/30 ring-1 ring-primary-200'
          : 'border-warm-200',
      )}
    >
      {/* Top row: checkbox + primary value + actions */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selectable && (
            <div
              className="flex-shrink-0 pt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => onSelectRow?.(rowId)}
                aria-label={`Select row ${rowId}`}
              />
            </div>
          )}
          {primaryCol && (
            <div className="font-semibold text-warm-900 min-w-0">
              {getCellValue(row, primaryCol) as React.ReactNode}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div
            className="flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <RowActionsMenu actions={actions} />
          </div>
        )}
      </div>

      {/* Secondary info as a 2-column grid */}
      {otherCols.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {otherCols.map((col) => (
            <div key={col.id} className="min-w-0">
              <span className="text-warm-500 block text-xs">{col.header}</span>
              <span className="text-warm-900 block truncate">
                {getCellValue(row, col) as React.ReactNode}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MOBILE CARD SKELETON
// Skeleton loading state for mobile card mode.
// ============================================

function MobileCardSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-warm-200 p-4 animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {/* Primary row skeleton */}
          <div className="flex items-start justify-between mb-3">
            <div className="h-5 bg-warm-200 rounded w-2/5" />
            <div className="h-5 w-5 bg-warm-100 rounded" />
          </div>
          {/* Grid skeleton */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j}>
                <div className="h-3 bg-warm-100 rounded w-12 mb-1" />
                <div className="h-4 bg-warm-100 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// DATA TABLE COMPONENT
// ============================================

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  getRowId,
  sortColumn,
  sortDirection,
  onSort,
  page = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  onRowClick,
  rowActions,
  isLoading = false,
  emptyState,
  className,
  compact = false,
  mobileView = 'adaptive',
  hiddenColumnsMobile = [],
  renderMobileCard,
}: TableProps<T>) {

  // ============================================
  // RESPONSIVE DETECTION
  // ============================================

  const isMobile = useMediaQuery('(max-width: 1023px)');

  // Determine whether we should show cards on mobile
  const shouldShowCards =
    isMobile && (
      mobileView === 'card' ||
      (mobileView === 'adaptive' && columns.length >= 4)
    );

  const shouldShowScroll =
    isMobile && mobileView === 'scroll';

  // Filter columns hidden on mobile
  const visibleColumns = isMobile
    ? columns.filter((col) => !hiddenColumnsMobile.includes(col.id))
    : columns;

  // ============================================
  // SELECTION LOGIC
  // ============================================

  const allSelected = data.length > 0 && data.every(row => selectedIds.includes(getRowId(row)));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(data.map(row => getRowId(row)));
    }
  }, [allSelected, data, getRowId, onSelectionChange]);

  const handleSelectRow = useCallback((rowId: string) => {
    if (selectedIds.includes(rowId)) {
      onSelectionChange?.(selectedIds.filter(id => id !== rowId));
    } else {
      onSelectionChange?.([...selectedIds, rowId]);
    }
  }, [selectedIds, onSelectionChange]);

  // ============================================
  // SORTING LOGIC
  // ============================================

  const handleSort = useCallback((columnId: string) => {
    if (!onSort) return;

    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        onSort(columnId, 'desc');
      } else {
        onSort(columnId, 'asc');
      }
    } else {
      onSort(columnId, 'asc');
    }
  }, [sortColumn, sortDirection, onSort]);

  const getSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <ChevronsUpDown className="w-4 h-4 text-warm-300" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="w-4 h-4 text-primary-600" />;
    }
    return <ChevronDown className="w-4 h-4 text-primary-600" />;
  };

  // ============================================
  // CELL VALUE GETTER
  // ============================================

  const getCellValue = useCallback((row: T, column: Column<T>): React.ReactNode => {
    if (column.cell) {
      return column.cell(row, data.indexOf(row));
    }
    if (typeof column.accessor === 'function') {
      return column.accessor(row);
    }
    return row[column.accessor] as React.ReactNode;
  }, [data]);

  // ============================================
  // SHARED: BULK ACTIONS BAR
  // ============================================

  const bulkActionsBar = selectedIds.length > 0 ? (
    <div className="
      flex items-center justify-between
      px-4 py-3 mb-3
      bg-primary-50 border border-primary-200
      rounded-[14px]
    ">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-primary-800">
          {selectedIds.length} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSelectionChange?.([])}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          Clear selection
        </button>
      </div>
    </div>
  ) : null;

  // ============================================
  // SHARED: PAGINATION
  // ============================================

  const paginationBlock = onPageChange && totalCount && totalCount > pageSize ? (
    <div className={cn(
      "flex items-center justify-between mt-4 pt-4 border-t border-warm-100",
      isMobile && "flex-col gap-3"
    )}>
      <span className="text-sm text-warm-500">
        Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
      </span>
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(totalCount / pageSize)}
        onPageChange={onPageChange}
      />
    </div>
  ) : null;

  // ============================================
  // LOADING STATE
  // ============================================

  if (isLoading) {
    if (isMobile && shouldShowCards) {
      return <MobileCardSkeleton count={pageSize > 5 ? 5 : pageSize} />;
    }
    return <TableSkeleton columns={visibleColumns.length} rows={pageSize} selectable={selectable} />;
  }

  // ============================================
  // EMPTY STATE
  // ============================================

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // ============================================
  // MOBILE CARD VIEW
  // ============================================

  if (shouldShowCards) {
    return (
      <div className={cn('w-full', className)}>
        {bulkActionsBar}

        {/* Select All for mobile cards */}
        {selectable && data.length > 0 && (
          <div className="flex items-center gap-3 px-1 py-2 mb-2">
            <div className="min-h-[44px] min-w-[44px] flex items-center justify-center">
              <Checkbox
                checked={allSelected || someSelected}
                onChange={handleSelectAll}
                aria-label="Select all rows"
              />
            </div>
            <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
              Select all
            </span>
          </div>
        )}

        <div className="space-y-3">
          {data.map((row) => {
            const rowId = getRowId(row);
            const isSelected = selectedIds.includes(rowId);
            const actions = rowActions?.(row) ?? [];

            return (
              <div
                key={rowId}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  onRowClick && 'cursor-pointer active:scale-[0.98] transition-transform'
                )}
              >
                {renderMobileCard ? (
                  renderMobileCard(row, actions)
                ) : (
                  <DefaultMobileCard
                    row={row}
                    columns={visibleColumns}
                    getCellValue={getCellValue}
                    isSelected={isSelected}
                    selectable={selectable}
                    onSelectRow={handleSelectRow}
                    rowId={rowId}
                    actions={actions}
                  />
                )}
              </div>
            );
          })}
        </div>

        {paginationBlock}
      </div>
    );
  }

  // ============================================
  // MOBILE SCROLL VIEW
  // ============================================

  if (shouldShowScroll) {
    const stickyCol = visibleColumns.find((c) => c.sticky) ?? visibleColumns[0];
    const scrollCols = visibleColumns.filter((c) => c !== stickyCol);

    return (
      <div className={cn('w-full', className)}>
        {bulkActionsBar}

        <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-thin">
          <div className="min-w-[640px]">
            {/* TABLE HEADER */}
            <div className="
              sticky top-0 z-10
              flex items-center gap-3
              px-4 py-3
              bg-warm-50/80 backdrop-blur-sm
              border-b border-warm-200
              rounded-t-[14px]
            ">
              {selectable && (
                <div className="w-11 flex-shrink-0 flex items-center justify-center min-h-[44px]">
                  <Checkbox
                    checked={allSelected || someSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                  />
                </div>
              )}

              {/* Sticky column header */}
              {stickyCol && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 sticky left-0 z-10 bg-warm-50/95',
                    stickyCol.width || 'w-[180px] flex-shrink-0',
                    stickyCol.sortable && 'cursor-pointer select-none hover:text-warm-900',
                  )}
                  onClick={() => stickyCol.sortable && handleSort(stickyCol.id)}
                >
                  <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
                    {stickyCol.header}
                  </span>
                  {stickyCol.sortable && getSortIcon(stickyCol.id)}
                </div>
              )}

              {/* Scrollable column headers */}
              {scrollCols.map(column => (
                <div
                  key={column.id}
                  className={cn(
                    'flex items-center gap-1.5',
                    column.width || 'flex-1 min-w-[120px]',
                    column.align === 'center' && 'justify-center',
                    column.align === 'right' && 'justify-end',
                    column.sortable && 'cursor-pointer select-none hover:text-warm-900',
                  )}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
                    {column.header}
                  </span>
                  {column.sortable && getSortIcon(column.id)}
                </div>
              ))}

              {rowActions && (
                <div className="w-11 flex-shrink-0" />
              )}
            </div>

            {/* TABLE ROWS */}
            <div className="flex flex-col gap-2 mt-2">
              {data.map((row) => {
                const rowId = getRowId(row);
                const isSelected = selectedIds.includes(rowId);
                const actions = rowActions?.(row) ?? [];

                return (
                  <div
                    key={rowId}
                    className={cn(
                      'flex items-center gap-3',
                      compact ? 'px-4 py-2.5' : 'px-4 py-3',
                      'bg-white',
                      'border rounded-[14px]',
                      'transition-all duration-200',
                      isSelected
                        ? 'border-primary-300 bg-primary-50/30 ring-1 ring-primary-200'
                        : 'border-warm-100 hover:border-warm-200 hover:shadow-sm',
                      onRowClick && 'cursor-pointer'
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <div
                        className="w-11 flex-shrink-0 flex items-center justify-center min-h-[44px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleSelectRow(rowId)}
                          aria-label={`Select row ${rowId}`}
                        />
                      </div>
                    )}

                    {/* Sticky first cell */}
                    {stickyCol && (
                      <div
                        className={cn(
                          'min-w-0 sticky left-0 z-10 bg-white',
                          stickyCol.width || 'w-[180px] flex-shrink-0',
                          stickyCol.align === 'center' && 'text-center',
                          stickyCol.align === 'right' && 'text-right',
                        )}
                      >
                        {getCellValue(row, stickyCol)}
                      </div>
                    )}

                    {/* Scrollable cells */}
                    {scrollCols.map(column => (
                      <div
                        key={column.id}
                        className={cn(
                          'min-w-0',
                          column.width || 'flex-1 min-w-[120px]',
                          column.align === 'center' && 'text-center',
                          column.align === 'right' && 'text-right',
                        )}
                      >
                        {getCellValue(row, column)}
                      </div>
                    ))}

                    {/* Row Actions */}
                    {rowActions && actions.length > 0 && (
                      <div
                        className="w-11 flex-shrink-0 flex justify-end min-h-[44px] items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionsMenu actions={actions} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {paginationBlock}
      </div>
    );
  }

  // ============================================
  // DESKTOP TABLE VIEW (default)
  // ============================================

  return (
    <div className={cn('w-full', className)}>
      {bulkActionsBar}

      {/* TABLE HEADER */}
      <div className="
        sticky top-0 z-10
        flex items-center gap-3
        px-4 py-3
        bg-warm-50/80 backdrop-blur-sm
        border-b border-warm-200
        rounded-t-[14px]
      ">
        {/* Select All Checkbox */}
        {selectable && (
          <div className="w-6 flex-shrink-0">
            <Checkbox
              checked={allSelected || someSelected}
              onChange={handleSelectAll}
              aria-label="Select all rows"
            />
          </div>
        )}

        {/* Column Headers */}
        {visibleColumns.map(column => (
          <div
            key={column.id}
            className={cn(
              'flex items-center gap-1.5',
              column.width || 'flex-1',
              column.align === 'center' && 'justify-center',
              column.align === 'right' && 'justify-end',
              column.sortable && 'cursor-pointer select-none hover:text-warm-900',
            )}
            onClick={() => column.sortable && handleSort(column.id)}
          >
            <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
              {column.header}
            </span>
            {column.sortable && getSortIcon(column.id)}
          </div>
        ))}

        {/* Actions Column Header */}
        {rowActions && (
          <div className="w-10 flex-shrink-0" />
        )}
      </div>

      {/* TABLE ROWS */}
      <div className="flex flex-col gap-2 mt-2">
        {data.map((row) => {
          const rowId = getRowId(row);
          const isSelected = selectedIds.includes(rowId);
          const actions = rowActions?.(row) ?? [];

          return (
            <div
              key={rowId}
              className={cn(
                'flex items-center gap-3',
                compact ? 'px-4 py-2.5' : 'px-4 py-3',
                'bg-white',
                'border rounded-[14px]',
                'transition-all duration-200',
                isSelected
                  ? 'border-primary-300 bg-primary-50/30 ring-1 ring-primary-200'
                  : 'border-warm-100 hover:border-warm-200 hover:shadow-sm',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {/* Row Checkbox */}
              {selectable && (
                <div
                  className="w-6 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleSelectRow(rowId)}
                    aria-label={`Select row ${getRowId(row)}`}
                  />
                </div>
              )}

              {/* Cell Values */}
              {visibleColumns.map(column => (
                <div
                  key={column.id}
                  className={cn(
                    'min-w-0',
                    column.width || 'flex-1',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {getCellValue(row, column)}
                </div>
              ))}

              {/* Row Actions Menu */}
              {rowActions && actions.length > 0 && (
                <div
                  className="w-10 flex-shrink-0 flex justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsMenu actions={actions} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {paginationBlock}
    </div>
  );
}
