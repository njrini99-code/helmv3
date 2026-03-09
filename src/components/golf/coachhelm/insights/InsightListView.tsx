'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconX,
  IconSparkles,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';
import {
  getInsightConfig,
  getPriorityColor,
  formatInsightAge,
  type InsightWithPlayer,
} from '@/lib/coachhelm/insight-types';
import { acknowledgeInsight, dismissInsight, resolveInsight } from '@/app/golf/actions/insights';

// ============================================================================
// TYPES
// ============================================================================

type SortBy = 'priority' | 'created_at' | 'player_name';
type SortOrder = 'asc' | 'desc';

interface InsightListViewProps {
  insights: InsightWithPlayer[];
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
  onRefresh: () => void;
  isLoading?: boolean;
  coachId?: string;
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
// INSIGHT ROW COMPONENT
// ============================================================================

interface InsightRowProps {
  insight: InsightWithPlayer;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRefresh: () => void;
  coachId?: string;
}

function InsightRow({ insight, isSelected, onToggleSelect, onRefresh }: InsightRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const config = getInsightConfig(insight.insight_type);
  const priorityColor = getPriorityColor(insight.priority);

  const handleAction = async (action: 'acknowledge' | 'dismiss' | 'resolve') => {
    setIsLoading(true);
    try {
      switch (action) {
        case 'acknowledge':
          await acknowledgeInsight(insight.id);
          break;
        case 'dismiss':
          await dismissInsight(insight.id);
          break;
        case 'resolve':
          await resolveInsight(insight.id);
          break;
      }
      onRefresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'glass-standard rounded-xl overflow-clip transition-all duration-200',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-warm-200 hover:border-warm-300'
      )}
    >
      {/* Row Header (always visible) */}
      <div className="flex items-center gap-3 p-4">
        {/* Checkbox */}
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              isSelected
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-warm-300 hover:border-warm-400'
            )}
          >
            {isSelected && <IconCheck size={12} />}
          </button>
        </div>

        {/* Icon & Priority */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
              priorityColor === 'red' && 'bg-red-100',
              priorityColor === 'orange' && 'bg-orange-100',
              priorityColor === 'yellow' && 'bg-yellow-100',
              priorityColor === 'blue' && 'bg-blue-100'
            )}
          >
            {config.icon}
          </div>
          {insight.priority === 'urgent' && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          )}
        </div>

        {/* Content */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h4 className="font-medium text-warm-900 text-sm truncate">
              {insight.title}
            </h4>
            <span className="text-xs text-warm-400 flex-shrink-0">
              {formatInsightAge(insight.created_at)}
            </span>
          </div>
          <p className="text-sm text-warm-600 line-clamp-1">{insight.description}</p>
        </div>

        {/* Player Avatar */}
        {insight.player && (
          <div className="flex-shrink-0 hidden sm:block">
            <Avatar
              src={insight.player.avatar_url}
              name={`${insight.player.first_name} ${insight.player.last_name}`}
              size="sm"
            />
          </div>
        )}

        {/* Expand Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse insight' : 'Expand insight'}
          className="flex-shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
        >
          {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 space-y-3 border-t border-warm-100">
              {/* Player Info (visible on mobile) */}
              {insight.player && (
                <div className="flex items-center gap-2 pt-3 sm:hidden">
                  <Avatar
                    src={insight.player.avatar_url}
                    name={`${insight.player.first_name} ${insight.player.last_name}`}
                    size="xs"
                  />
                  <span className="text-xs text-warm-500">
                    {insight.player.first_name} {insight.player.last_name}
                  </span>
                </div>
              )}

              {/* Full Description */}
              <div className="pt-3 sm:pt-3">
                <p className="text-sm text-warm-700 leading-relaxed">
                  {insight.description}
                </p>
              </div>

              {/* Recommendation */}
              {insight.recommendation && (
                <div className="bg-primary-50 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <IconSparkles size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-primary-900 mb-1">Recommendation</p>
                      <p className="text-sm text-primary-800 leading-relaxed">
                        {insight.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Badge */}
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full font-medium',
                    insight.status === 'active' && 'bg-primary-100 text-primary-700',
                    insight.status === 'acknowledged' && 'bg-blue-100 text-blue-700',
                    insight.status === 'resolved' && 'bg-warm-100 text-warm-700',
                    insight.status === 'dismissed' && 'bg-warm-100 text-warm-500'
                  )}
                >
                  {insight.status.charAt(0).toUpperCase() + insight.status.slice(1)}
                </span>
                {insight.metadata?.v2_engine && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                    AI Powered
                  </span>
                )}
              </div>

              {/* Quick Actions */}
              {insight.status === 'active' && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleAction('resolve')}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    <IconCheck size={16} />
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('acknowledge')}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-warm-100 text-warm-700 text-sm font-medium rounded-lg hover:bg-warm-200 disabled:opacity-50 transition-colors"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('dismiss')}
                    disabled={isLoading}
                    className="px-3 py-2 bg-warm-100 text-warm-500 rounded-lg hover:bg-warm-200 disabled:opacity-50 transition-colors"
                    title="Dismiss"
                  >
                    <IconX size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

        {/* Page Numbers */}
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
  onRefresh,
  isLoading,
  coachId,
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
      // Toggle order
      onSortChange(key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New sort key, default to desc
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

  // Empty state
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
      <div className="p-4 space-y-3">
        <AnimatePresence mode="popLayout">
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              isSelected={selectedIds.has(insight.id)}
              onToggleSelect={() => handleToggleSelect(insight.id)}
              onRefresh={onRefresh}
              coachId={coachId}
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
