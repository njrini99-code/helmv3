'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconFilter,
  IconX,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
import {
  INSIGHT_TYPE_CONFIGS,
  type InsightType,
  type InsightPriority,
  type InsightStatus,
} from '@/lib/coachhelm/insight-types';

// ============================================================================
// TYPES
// ============================================================================

export interface InsightFilters {
  playerId?: string;
  insightType?: InsightType;
  priority?: InsightPriority;
  status?: InsightStatus;
  dateRange?: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'custom';
  startDate?: string;
  endDate?: string;
}

interface FilterOption {
  id: string;
  name: string;
}

interface InsightFiltersPanelProps {
  filters: InsightFilters;
  onFiltersChange: (filters: InsightFilters) => void;
  players: FilterOption[];
  className?: string;
  defaultExpanded?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_OPTIONS: { value: InsightPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-700' },
];

const STATUS_OPTIONS: { value: InsightStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'bg-primary-100 text-primary-700' },
  { value: 'acknowledged', label: 'Acknowledged', color: 'bg-blue-100 text-blue-700' },
  { value: 'resolved', label: 'Resolved', color: 'bg-warm-100 text-warm-700' },
  { value: 'dismissed', label: 'Dismissed', color: 'bg-warm-100 text-warm-500' },
];

const DATE_RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

// ============================================================================
// FILTER CHIP COMPONENT
// ============================================================================

interface FilterChipProps {
  label: string;
  onRemove: () => void;
  colorClass?: string;
}

function FilterChip({ label, onRemove, colorClass = 'bg-primary-100 text-primary-700' }: FilterChipProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
        colorClass
      )}
    >
      {label}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <IconX size={12} />
      </button>
    </motion.span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsightFiltersPanel({
  filters,
  onFiltersChange,
  players,
  className,
  defaultExpanded = true,
}: InsightFiltersPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value && key !== 'startDate' && key !== 'endDate'
  ).length;

  // Get insight type options from config
  const insightTypeOptions = Object.entries(INSIGHT_TYPE_CONFIGS).map(([type, config]) => ({
    value: type as InsightType,
    label: config.label,
    icon: config.icon,
  }));

  // Update a single filter
  const updateFilter = <K extends keyof InsightFilters>(
    key: K,
    value: InsightFilters[K] | undefined
  ) => {
    const newFilters = { ...filters };
    if (value === undefined || value === '') {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onFiltersChange(newFilters);
  };

  // Clear all filters
  const clearAllFilters = () => {
    onFiltersChange({});
  };

  // Get active filter chips
  const getActiveFilterChips = () => {
    const chips: { key: string; label: string; colorClass: string; onRemove: () => void }[] = [];

    if (filters.playerId) {
      const player = players.find((p) => p.id === filters.playerId);
      if (player) {
        chips.push({
          key: 'player',
          label: player.name,
          colorClass: 'bg-purple-100 text-purple-700',
          onRemove: () => updateFilter('playerId', undefined),
        });
      }
    }

    if (filters.insightType) {
      const config = INSIGHT_TYPE_CONFIGS[filters.insightType];
      chips.push({
        key: 'type',
        label: config.label,
        colorClass: 'bg-primary-100 text-primary-700',
        onRemove: () => updateFilter('insightType', undefined),
      });
    }

    if (filters.priority) {
      const option = PRIORITY_OPTIONS.find((o) => o.value === filters.priority);
      if (option) {
        chips.push({
          key: 'priority',
          label: option.label,
          colorClass: option.color,
          onRemove: () => updateFilter('priority', undefined),
        });
      }
    }

    if (filters.status) {
      const option = STATUS_OPTIONS.find((o) => o.value === filters.status);
      if (option) {
        chips.push({
          key: 'status',
          label: option.label,
          colorClass: option.color,
          onRemove: () => updateFilter('status', undefined),
        });
      }
    }

    if (filters.dateRange) {
      const option = DATE_RANGE_OPTIONS.find((o) => o.value === filters.dateRange);
      if (option) {
        chips.push({
          key: 'date',
          label: option.label,
          colorClass: 'bg-warm-100 text-warm-700',
          onRemove: () => {
            updateFilter('dateRange', undefined);
            updateFilter('startDate', undefined);
            updateFilter('endDate', undefined);
          },
        });
      }
    }

    return chips;
  };

  const filterChips = getActiveFilterChips();

  // ============================================================================
  // FILTER FORM CONTENT
  // ============================================================================

  const FilterFormContent = () => (
    <div className="space-y-4">
      {/* Row 1: Player & Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Player Filter */}
        <div>
          <label className="block text-xs font-medium text-warm-600 mb-1.5">
            Player
          </label>
          <select
            value={filters.playerId || ''}
            onChange={(e) => updateFilter('playerId', e.target.value || undefined)}
            className={cn(
              'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
              'bg-white border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200'
            )}
          >
            <option value="">All players</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </div>

        {/* Insight Type Filter */}
        <div>
          <label className="block text-xs font-medium text-warm-600 mb-1.5">
            Insight Type
          </label>
          <select
            value={filters.insightType || ''}
            onChange={(e) => updateFilter('insightType', e.target.value as InsightType || undefined)}
            className={cn(
              'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
              'bg-white border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200'
            )}
          >
            <option value="">All types</option>
            {insightTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Priority & Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Priority Filter */}
        <div>
          <label className="block text-xs font-medium text-warm-600 mb-1.5">
            Priority
          </label>
          <select
            value={filters.priority || ''}
            onChange={(e) => updateFilter('priority', e.target.value as InsightPriority || undefined)}
            className={cn(
              'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
              'bg-white border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200'
            )}
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-medium text-warm-600 mb-1.5">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => updateFilter('status', e.target.value as InsightStatus || undefined)}
            className={cn(
              'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
              'bg-white border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200'
            )}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Date Range */}
      <div>
        <label className="block text-xs font-medium text-warm-600 mb-1.5">
          Date Range
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <select
            value={filters.dateRange || ''}
            onChange={(e) => {
              const value = e.target.value as InsightFilters['dateRange'] || undefined;
              updateFilter('dateRange', value);
              if (value !== 'custom') {
                updateFilter('startDate', undefined);
                updateFilter('endDate', undefined);
              }
            }}
            className={cn(
              'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
              'bg-white border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200'
            )}
          >
            <option value="">All time</option>
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {filters.dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value || undefined)}
                className={cn(
                  'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
                  'bg-white border border-warm-200 rounded-lg',
                  'text-warm-900',
                  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
                  'transition-colors duration-200'
                )}
              />
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value || undefined)}
                className={cn(
                  'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm',
                  'bg-white border border-warm-200 rounded-lg',
                  'text-warm-900',
                  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
                  'transition-colors duration-200'
                )}
              />
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {activeFilterCount > 0 && (
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      {/* Desktop View */}
      <div className="hidden md:block">
        <GlassCard padding="none" hover={false}>
          {/* Header */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-warm-50/50 transition-colors rounded-t-2xl"
          >
            <div className="flex items-center gap-2">
              <IconFilter size={16} className="text-warm-500" />
              <span className="text-sm font-medium text-warm-700">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </div>
            {isExpanded ? (
              <IconChevronUp size={16} className="text-warm-400" />
            ) : (
              <IconChevronDown size={16} className="text-warm-400" />
            )}
          </button>

          {/* Filter Chips (always visible when filters are active) */}
          <AnimatePresence>
            {!isExpanded && filterChips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                style={{ overflow: 'hidden' }}
                className="px-4 pb-3"
              >
                <div className="flex flex-wrap gap-2">
                  {filterChips.map((chip) => (
                    <FilterChip
                      key={chip.key}
                      label={chip.label}
                      colorClass={chip.colorClass}
                      onRemove={chip.onRemove}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expanded Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-4 pb-4 border-t border-warm-100">
                  <div className="pt-4">
                    <FilterFormContent />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>

      {/* Mobile View - Collapsible Drawer */}
      <div className="md:hidden">
        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5',
            'bg-cream-100/82 backdrop-blur-sm border border-warm-200 rounded-xl',
            'text-sm font-medium text-warm-700',
            'hover:bg-warm-50 active:bg-warm-100 transition-colors'
          )}
        >
          <IconFilter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Filter Chips (visible when filters are active) */}
        {filterChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {filterChips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                colorClass={chip.colorClass}
                onRemove={chip.onRemove}
              />
            ))}
          </div>
        )}

        {/* Mobile Drawer */}
        <AnimatePresence>
          {isMobileOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-warm-900/50 backdrop-blur-sm"
                onClick={() => setIsMobileOpen(false)}
              />

              {/* Drawer */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl max-h-[85vh] overflow-auto"
              >
                {/* Handle */}
                <div className="sticky top-0 bg-white pt-3 pb-2 px-6">
                  <div className="w-10 h-1 bg-warm-300 rounded-full mx-auto mb-4" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Filters</h3>
                    <button
                      type="button"
                      onClick={() => setIsMobileOpen(false)}
                      className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors active:bg-warm-200"
                    >
                      <IconX size={20} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 pb-8">
                  <FilterFormContent />
                  <div className="mt-6">
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => setIsMobileOpen(false)}
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
