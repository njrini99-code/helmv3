'use client';

import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  maxVisible?: number;
  className?: string;
}

// ============================================
// HELPER
// ============================================

function generatePageNumbers(
  current: number,
  total: number,
  maxVisible: number
): (number | 'ellipsis')[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  let start = Math.max(2, current - halfVisible);
  let end = Math.min(total - 1, current + halfVisible);

  // Adjust if we're near the beginning or end
  if (current <= halfVisible + 1) {
    end = maxVisible - 1;
  } else if (current >= total - halfVisible) {
    start = total - maxVisible + 2;
  }

  // Add ellipsis after first page if needed
  if (start > 2) {
    pages.push('ellipsis');
  }

  // Add middle pages
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (end < total - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

// ============================================
// COMPONENT
// ============================================

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showFirstLast = false,
  maxVisible = 7,
  className,
}: PaginationProps) {
  const pages = generatePageNumbers(currentPage, totalPages, maxVisible);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
    }
  };

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav
      className={cn('flex items-center justify-center gap-1', className)}
      aria-label="Pagination"
    >
      {/* First Page (optional) */}
      {showFirstLast && (
        <button
          onClick={() => goToPage(1)}
          disabled={!canGoPrevious}
          className={cn(
            'px-3 py-2 rounded-lg',
            'text-sm font-medium',
            'border border-warm-200',
            'transition-all duration-200',
            canGoPrevious
              ? 'text-warm-700 bg-white hover:bg-warm-50 hover:border-warm-300'
              : 'text-warm-300 bg-warm-50 cursor-not-allowed'
          )}
          aria-label="Go to first page"
        >
          First
        </button>
      )}

      {/* Previous */}
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={!canGoPrevious}
        className={cn(
          'p-2 rounded-lg',
          'border border-warm-200',
          'transition-all duration-200',
          canGoPrevious
            ? 'text-warm-700 bg-white hover:bg-warm-50 hover:border-warm-300'
            : 'text-warm-300 bg-warm-50 cursor-not-allowed'
        )}
        aria-label="Go to previous page"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      {/* Page Numbers */}
      {pages.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <div
              key={`ellipsis-${index}`}
              className="
                px-3 py-2
                text-warm-400
                flex items-center justify-center
              "
              aria-hidden="true"
            >
              <MoreHorizontalIcon className="h-4 w-4" />
            </div>
          );
        }

        const isActive = page === currentPage;

        return (
          <button
            key={page}
            onClick={() => goToPage(page)}
            className={cn(
              'min-w-[40px] px-3 py-2 rounded-lg',
              'text-sm font-medium',
              'border transition-all duration-200',
              isActive
                ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                : 'bg-white text-warm-700 border-warm-200 hover:bg-warm-50 hover:border-warm-300'
            )}
            aria-label={`Go to page ${page}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {page}
          </button>
        );
      })}

      {/* Next */}
      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={!canGoNext}
        className={cn(
          'p-2 rounded-lg',
          'border border-warm-200',
          'transition-all duration-200',
          canGoNext
            ? 'text-warm-700 bg-white hover:bg-warm-50 hover:border-warm-300'
            : 'text-warm-300 bg-warm-50 cursor-not-allowed'
        )}
        aria-label="Go to next page"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      {/* Last Page (optional) */}
      {showFirstLast && (
        <button
          onClick={() => goToPage(totalPages)}
          disabled={!canGoNext}
          className={cn(
            'px-3 py-2 rounded-lg',
            'text-sm font-medium',
            'border border-warm-200',
            'transition-all duration-200',
            canGoNext
              ? 'text-warm-700 bg-white hover:bg-warm-50 hover:border-warm-300'
              : 'text-warm-300 bg-warm-50 cursor-not-allowed'
          )}
          aria-label="Go to last page"
        >
          Last
        </button>
      )}
    </nav>
  );
}

// ============================================
// COMPACT VARIANT
// ============================================

export function CompactPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: Omit<PaginationProps, 'showFirstLast' | 'maxVisible'>) {
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {/* Previous */}
      <button
        onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
        disabled={!canGoPrevious}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'text-sm font-medium',
          'border border-warm-200',
          'transition-all duration-200',
          canGoPrevious
            ? 'text-warm-700 bg-white hover:bg-warm-50'
            : 'text-warm-300 bg-warm-50 cursor-not-allowed'
        )}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Current Page Info */}
      <div className="text-sm text-warm-600">
        Page <span className="font-semibold text-warm-900">{currentPage}</span> of{' '}
        <span className="font-semibold text-warm-900">{totalPages}</span>
      </div>

      {/* Next */}
      <button
        onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'text-sm font-medium',
          'border border-warm-200',
          'transition-all duration-200',
          canGoNext
            ? 'text-warm-700 bg-white hover:bg-warm-50'
            : 'text-warm-300 bg-warm-50 cursor-not-allowed'
        )}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Standard pagination
const [currentPage, setCurrentPage] = useState(1);

<Pagination
  currentPage={currentPage}
  totalPages={20}
  onPageChange={setCurrentPage}
/>

// Example 2: With first/last buttons
<Pagination
  currentPage={currentPage}
  totalPages={50}
  onPageChange={setCurrentPage}
  showFirstLast
/>

// Example 3: Compact variant (mobile-friendly)
<CompactPagination
  currentPage={currentPage}
  totalPages={20}
  onPageChange={setCurrentPage}
/>

// Example 4: Responsive - compact on mobile, full on desktop
<div className="hidden md:block">
  <Pagination currentPage={currentPage} totalPages={20} onPageChange={setCurrentPage} />
</div>
<div className="md:hidden">
  <CompactPagination currentPage={currentPage} totalPages={20} onPageChange={setCurrentPage} />
</div>
*/
