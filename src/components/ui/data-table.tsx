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
import type { Column, TableProps } from '@/types/table';

export function DataTable<T extends Record<string, any>>({
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
}: TableProps<T>) {

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
      // Toggle direction or clear
      if (sortDirection === 'asc') {
        onSort(columnId, 'desc');
      } else {
        onSort(columnId, 'asc');
      }
    } else {
      // New column, default to asc
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

  const getCellValue = (row: T, column: Column<T>) => {
    if (column.cell) {
      return column.cell(row, data.indexOf(row));
    }
    if (typeof column.accessor === 'function') {
      return column.accessor(row);
    }
    return row[column.accessor];
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return <TableSkeleton columns={columns.length} rows={pageSize} selectable={selectable} />;
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("w-full", className)}>
      {/* ============================================ */}
      {/* BULK ACTIONS BAR (when items selected) */}
      {/* ============================================ */}
      {selectedIds.length > 0 && (
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
            {/* Bulk action buttons passed via prop */}
            <button
              onClick={() => onSelectionChange?.([])}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* TABLE HEADER */}
      {/* ============================================ */}
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
        {columns.map(column => (
          <div
            key={column.id}
            className={cn(
              "flex items-center gap-1.5",
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

      {/* ============================================ */}
      {/* TABLE ROWS (Card Style) */}
      {/* ============================================ */}
      <div className="flex flex-col gap-2 mt-2">
        {data.map((row) => {
          const rowId = getRowId(row);
          const isSelected = selectedIds.includes(rowId);
          const actions = rowActions?.(row) || [];

          return (
            <div
              key={rowId}
              className={cn(
                "flex items-center gap-3",
                compact ? "px-4 py-2.5" : "px-4 py-3",
                "bg-white",
                "border rounded-[14px]",
                "transition-all duration-200",
                isSelected
                  ? "border-primary-300 bg-primary-50/30 ring-1 ring-primary-200"
                  : "border-warm-100 hover:border-warm-200 hover:shadow-sm",
                onRowClick && "cursor-pointer"
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
              {columns.map(column => (
                <div
                  key={column.id}
                  className={cn(
                    "min-w-0", // Allow truncation
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

      {/* ============================================ */}
      {/* PAGINATION */}
      {/* ============================================ */}
      {onPageChange && totalCount && totalCount > pageSize && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-warm-100">
          <span className="text-sm text-warm-500">
            Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(totalCount / pageSize)}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
