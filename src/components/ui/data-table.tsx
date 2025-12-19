'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronUp, IconChevronDown } from '@/components/icons';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  loadingRows?: number;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (item: T) => void;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  selectable?: boolean;
  stickyHeader?: boolean;
  className?: string;
  rowClassName?: string | ((item: T) => string);
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  loadingRows = 5,
  emptyMessage = 'No data found',
  emptyIcon,
  onRowClick,
  selectedKeys,
  onSelectionChange,
  selectable = false,
  stickyHeader = false,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    const column = columns.find((c) => c.key === key);
    if (!column?.sortable) return;

    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortKey];
      const bValue = (b as Record<string, unknown>)[sortKey];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
  }, [data, sortKey, sortDirection]);

  const handleSelectAll = () => {
    if (!onSelectionChange) return;

    const allKeys = new Set(data.map(keyExtractor));
    const allSelected = data.length > 0 && allKeys.size === selectedKeys?.size;

    onSelectionChange(allSelected ? new Set() : allKeys);
  };

  const handleSelectRow = (item: T) => {
    if (!onSelectionChange) return;

    const key = keyExtractor(item);
    const newKeys = new Set(selectedKeys);

    if (newKeys.has(key)) {
      newKeys.delete(key);
    } else {
      newKeys.add(key);
    }

    onSelectionChange(newKeys);
  };

  const getRowClassName = (item: T) => {
    if (typeof rowClassName === 'function') {
      return rowClassName(item);
    }
    return rowClassName;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-2xl border border-slate-200 overflow-hidden', className)}>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i}>
                {selectable && (
                  <td className="px-4 py-4">
                    <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-4">
                    <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: '60%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={cn('bg-white rounded-2xl border border-slate-200 overflow-hidden', className)}>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3" />
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyIcon && (
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              {emptyIcon}
            </div>
          )}
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={cn('bg-slate-50', stickyHeader && 'sticky top-0 z-10')}>
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedKeys?.size === data.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-green-600
                               focus:ring-green-500 focus:ring-offset-0"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.align !== 'center' && col.align !== 'right' && 'text-left',
                    col.sortable && 'cursor-pointer select-none hover:text-slate-700 transition-colors'
                  )}
                  style={{ width: col.width }}
                >
                  <div className={cn(
                    'flex items-center gap-1',
                    col.align === 'center' && 'justify-center',
                    col.align === 'right' && 'justify-end'
                  )}>
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="flex flex-col">
                        <IconChevronUp
                          size={12}
                          className={cn(
                            '-mb-1 transition-colors',
                            sortKey === col.key && sortDirection === 'asc'
                              ? 'text-green-600'
                              : 'text-slate-300'
                          )}
                        />
                        <IconChevronDown
                          size={12}
                          className={cn(
                            'transition-colors',
                            sortKey === col.key && sortDirection === 'desc'
                              ? 'text-green-600'
                              : 'text-slate-300'
                          )}
                        />
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedData.map((item, index) => {
              const key = keyExtractor(item);
              const isSelected = selectedKeys?.has(key);

              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-slate-50',
                    isSelected && 'bg-green-50',
                    getRowClassName(item)
                  )}
                >
                  {selectable && (
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(item)}
                        className="w-4 h-4 rounded border-slate-300 text-green-600
                                   focus:ring-green-500 focus:ring-offset-0"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-4 text-sm text-slate-700',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right'
                      )}
                    >
                      {col.render
                        ? col.render(item, index)
                        : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Simple table for basic use cases
interface SimpleTableProps {
  headers: string[];
  rows: React.ReactNode[][];
  className?: string;
}

export function SimpleTable({ headers, rows, className }: SimpleTableProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 overflow-hidden', className)}>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-4 text-sm text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
