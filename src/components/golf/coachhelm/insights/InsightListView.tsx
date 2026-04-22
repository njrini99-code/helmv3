'use client';

/**
 * InsightListView — coach surface for `/dashboard/insights`. Migrated under
 * Wave 1A of the Insight Delivery phase: the per-row renderer is now the
 * unified `InsightCard` primitive (audience='coach', density='default').
 *
 * Selection, sorting, and pagination stay the same — only the row visual
 * changed. The selection checkbox is rendered beside the primitive rather
 * than inside it to avoid touching the primitive's API surface.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconSparkles,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';
import {
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

// ============================================================================
// TYPES
// ============================================================================

type SortBy = 'priority' | 'created_at' | 'player_name';
type SortOrder = 'asc' | 'desc';

interface InsightListViewProps {
  insights: EvidenceInsight[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy, sortOrder: SortOrder) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onAction: (action: InsightAction, insightId: string) => void;
  isLoading?: boolean;
}

// ============================================================================
// SORT BUTTON COMPONENT
// ============================================================================

interface SortButtonProps {
  label: string;
  sortKey: SortBy;
  currentSort: SortBy;
  currentOrder: SortOrder;
  onClick: (key: SortBy) => void;
}

function SortButton({ label, sortKey, currentSort, currentOrder, onClick }: SortButtonProps) {
  const isActive = currentSort === sortKey;

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
        isActive
          ? 'bg-primary-100 text-primary-700'
          : 'text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200'
      )}
    >
      {label}
      {isActive && (
        currentOrder === 'asc' ? (
          <IconChevronUp size={12} />
        ) : (
          <IconChevronDown size={12} />
        )
      )}
    </button>
  );
}

// ============================================================================
// INSIGHT ROW — thin wrapper that pairs the selection checkbox with the
// unified InsightCard primitive. The primitive owns expansion, drills,
// evidence, and action rendering; this row only contributes selection state.
// ============================================================================

interface InsightRowProps {
  insight: EvidenceInsight;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAction: (action: InsightAction, insightId: string) => void;
}

function InsightRow({ insight, isSelected, onToggleSelect, onAction }: InsightRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'relative transition-all duration-200',
        isSelected && 'ring-2 ring-primary-500/30 rounded-2xl',
      )}
    >
      {/* Selection checkbox overlay — positioned absolute so it doesn't
          interfere with the primitive's internal layout. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label={isSelected ? 'Deselect insight' : 'Select insight'}
        className={cn(
          'absolute top-3 left-3 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
          isSelected
            ? 'bg-primary-500 border-primary-500 text-white'
            : 'bg-white/80 border-warm-300 hover:border-warm-400',
        )}
      >
        {isSelected && <IconCheck size={12} />}
      </button>

      {/* Slight left inset to leave room for the checkbox. */}
      <div className="pl-8">
        <InsightCard
          insight={insight}
          density="default"
          audience="coach"
          showActions
          onAction={onAction}
        />
      </div>
    </motion.div>
  );
}

// ============================================================================
// PAGINATION COMPONENT
// ============================================================================

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, totalPages, totalCount, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-warm-200">
      <div className="text-sm text-warm-500">
        Showing {startItem}-{endItem} of {totalCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            'p-2 rounded-lg transition-colors',
            page <= 1
              ? 'text-warm-300 cursor-not-allowed'
              : 'text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200'
          )}
        >
          <IconChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  pageNum === page
                    ? 'bg-primary-500 text-white'
                    : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            'p-2 rounded-lg transition-colors',
            page >= totalPages
              ? 'text-warm-300 cursor-not-allowed'
              : 'text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200'
          )}
        >
          <IconChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsightListView({
  insights,
  selectedIds,
  onSelectionChange,
  sortBy,
  sortOrder,
  onSortChange,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onAction,
  isLoading,
}: InsightListViewProps) {
  const handleToggleSelect = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };

  const handleSortClick = (key: SortBy) => {
    if (sortBy === key) {
      onSortChange(key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(key, 'desc');
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <GlassCard padding="none" hover={false}>
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="w-5 h-5 bg-warm-200 rounded" />
              <div className="w-10 h-10 bg-warm-200 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-warm-200 rounded w-2/3" />
                <div className="h-3 bg-warm-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  if (insights.length === 0) {
    return (
      <GlassCard hover={false}>
        <EmptyState
          variant="compact"
          icon={<IconSparkles size={32} />}
          title="No insights found"
          description="Try adjusting your search or filters to find what you're looking for."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="none" hover={false}>
      {/* Header with Sort Options */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-200">
        <div className="text-sm text-warm-500">
          {totalCount} insight{totalCount !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-400 mr-1">Sort by:</span>
          <SortButton
            label="Priority"
            sortKey="priority"
            currentSort={sortBy}
            currentOrder={sortOrder}
            onClick={handleSortClick}
          />
          <SortButton
            label="Date"
            sortKey="created_at"
            currentSort={sortBy}
            currentOrder={sortOrder}
            onClick={handleSortClick}
          />
          <SortButton
            label="Player"
            sortKey="player_name"
            currentSort={sortBy}
            currentOrder={sortOrder}
            onClick={handleSortClick}
          />
        </div>
      </div>

      {/* Insight List */}
      <div className="p-4 space-y-3" data-testid="insight-list">
        <AnimatePresence initial={false}>
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              isSelected={selectedIds.has(insight.id)}
              onToggleSelect={() => handleToggleSelect(insight.id)}
              onAction={onAction}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </GlassCard>
  );
}
