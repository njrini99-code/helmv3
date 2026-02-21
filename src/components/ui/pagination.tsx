'use client';

import { cn } from '@/lib/utils';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  showFirstLast?: boolean;
  siblingCount?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  showFirstLast = true,
  siblingCount = 1,
}: PaginationProps) {
  // Generate page numbers to show
  const generatePages = () => {
    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    // Calculate range around current page
    const leftSibling = Math.max(currentPage - siblingCount, 2);
    const rightSibling = Math.min(currentPage + siblingCount, totalPages - 1);

    // Add left ellipsis
    if (leftSibling > 2) {
      pages.push('ellipsis');
    } else if (leftSibling === 2) {
      pages.push(2);
    }

    // Add pages around current
    for (let i = leftSibling; i <= rightSibling; i++) {
      if (i > 1 && i < totalPages) {
        pages.push(i);
      }
    }

    // Add right ellipsis
    if (rightSibling < totalPages - 1) {
      pages.push('ellipsis');
    } else if (rightSibling === totalPages - 1 && totalPages > 1) {
      pages.push(totalPages - 1);
    }

    // Always show last page (if more than 1 page)
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  const pages = generatePages();

  return (
    <nav className={cn('flex items-center justify-center gap-1', className)}>
      {/* First page */}
      {showFirstLast && (
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={cn(
            'h-11 px-2 rounded-lg text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            currentPage === 1
              ? 'text-warm-300 cursor-not-allowed'
              : 'text-warm-600 hover:bg-warm-100'
          )}
        >
          <span className="flex items-center gap-0.5">
            <IconChevronLeft size={14} />
            <IconChevronLeft size={14} className="-ml-2" />
          </span>
        </button>
      )}

      {/* Previous */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(
          'h-11 px-2 rounded-lg text-sm font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
          currentPage === 1
            ? 'text-warm-300 cursor-not-allowed'
            : 'text-warm-600 hover:bg-warm-100'
        )}
      >
        <IconChevronLeft size={16} />
      </button>

      {/* Page numbers */}
      {pages.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <span key={`ellipsis-${index}`} className="h-11 w-11 flex items-center justify-center text-warm-400">
              ...
            </span>
          );
        }

        const isActive = page === currentPage;

        return (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={cn(
              'h-11 min-w-[44px] px-3 rounded-lg text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
              isActive
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-warm-600 hover:bg-warm-100'
            )}
          >
            {page}
          </button>
        );
      })}

      {/* Next */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(
          'h-11 px-2 rounded-lg text-sm font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
          currentPage === totalPages
            ? 'text-warm-300 cursor-not-allowed'
            : 'text-warm-600 hover:bg-warm-100'
        )}
      >
        <IconChevronRight size={16} />
      </button>

      {/* Last page */}
      {showFirstLast && (
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={cn(
            'h-11 px-2 rounded-lg text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            currentPage === totalPages
              ? 'text-warm-300 cursor-not-allowed'
              : 'text-warm-600 hover:bg-warm-100'
          )}
        >
          <span className="flex items-center gap-0.5">
            <IconChevronRight size={14} />
            <IconChevronRight size={14} className="-ml-2" />
          </span>
        </button>
      )}
    </nav>
  );
}

// Compact pagination with page info
interface CompactPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function CompactPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className,
}: CompactPaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <p className="text-sm leading-relaxed text-warm-500">
        Showing <span className="font-medium text-warm-700">{startItem}</span> to{' '}
        <span className="font-medium text-warm-700">{endItem}</span> of{' '}
        <span className="font-medium text-warm-700">{totalItems}</span> results
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            'h-11 lg:h-8 px-3 rounded-lg border text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            currentPage === 1
              ? 'border-warm-200 text-warm-300 cursor-not-allowed'
              : 'border-warm-200 text-warm-600 hover:bg-warm-50 hover:border-warm-300'
          )}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            'h-11 lg:h-8 px-3 rounded-lg border text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            currentPage === totalPages
              ? 'border-warm-200 text-warm-300 cursor-not-allowed'
              : 'border-warm-200 text-warm-600 hover:bg-warm-50 hover:border-warm-300'
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Page size selector
interface PageSizeSelectorProps {
  value: number;
  onChange: (size: number) => void;
  options?: number[];
  className?: string;
}

export function PageSizeSelector({
  value,
  onChange,
  options = [10, 25, 50, 100],
  className,
}: PageSizeSelectorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm leading-relaxed text-warm-500">Show</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'h-8 px-2 pr-7 rounded-lg border border-warm-200 bg-white text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
          'appearance-none cursor-pointer'
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.25rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25em 1.25em',
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <span className="text-sm leading-relaxed text-warm-500">per page</span>
    </div>
  );
}
