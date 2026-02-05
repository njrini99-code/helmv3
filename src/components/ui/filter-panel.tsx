'use client';

import { useState } from 'react';
import { IconFilter, IconX, IconChevronDown } from '@/components/icons';
import { Button } from './button';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterGroup {
  id: string;
  label: string;
  type: 'checkbox' | 'radio' | 'range' | 'select';
  options?: FilterOption[];
  min?: number;
  max?: number;
  step?: number;
}

// Union type for all possible filter values
type FilterValue = string | string[] | number | undefined;

interface FilterPanelProps {
  filters: FilterGroup[];
  activeFilters: Record<string, FilterValue>;
  onFilterChange: (filterId: string, value: FilterValue) => void;
  onClearAll: () => void;
  className?: string;
}

export function FilterPanel({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  className
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(filters.map(f => f.id)));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const activeFilterCount = Object.keys(activeFilters).filter(
    key => activeFilters[key] !== undefined && activeFilters[key] !== null &&
    (Array.isArray(activeFilters[key]) ? activeFilters[key].length > 0 : true)
  ).length;

  return (
    <>
      {/* Toggle Button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <IconFilter size={16} />
        Filters
        {activeFilterCount > 0 && (
          <Badge className="ml-2 px-1.5 py-0.5 text-2xs bg-brand-600 text-white border-0">
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      {/* Slide-out Panel */}
      <div
        className={cn(
          'fixed bg-white shadow-elevation-4 z-50',
          'transition-transform duration-300 ease-out',

          // Mobile: bottom sheet, full-width, rounded top
          'bottom-0 left-0 right-0 w-full max-h-[85vh] rounded-t-2xl',

          // Desktop: right sidebar, fixed width, full height
          'sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:w-80 sm:h-full sm:max-h-full sm:rounded-none',

          // Mobile slides up from bottom, desktop slides in from right
          isOpen
            ? 'translate-y-0 sm:translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-y-0 sm:translate-x-full',

          className
        )}
      >
        {/* Drag handle - mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <div className="flex items-center gap-2">
            <IconFilter size={20} className="text-slate-600" />
            <h3 className="font-semibold text-slate-900">Filters</h3>
            {activeFilterCount > 0 && (
              <Badge variant="primary" className="px-2 py-0.5">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close filters"
          >
            <IconX size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-140px)] custom-scrollbar overscroll-contain">
          <div className="p-4 space-y-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {filters.map(group => (
              <div key={group.id} className="space-y-3">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between text-sm font-medium text-slate-900 hover:text-brand-600 transition-colors min-h-[44px]"
                >
                  <span>{group.label}</span>
                  <IconChevronDown
                    size={16}
                    className={cn(
                      'transition-transform duration-200',
                      expandedGroups.has(group.id) ? 'rotate-180' : ''
                    )}
                  />
                </button>

                {/* Group Content */}
                {expandedGroups.has(group.id) && (
                  <div className="space-y-2 animate-fade-in">
                    {group.type === 'checkbox' && group.options && (
                      <div className="space-y-2">
                        {group.options.map(option => {
                          const filterValue = activeFilters[group.id];
                          const isChecked = Array.isArray(filterValue) && filterValue.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 cursor-pointer group min-h-[44px]"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = (activeFilters[group.id] as string[]) || [];
                                  const next = e.target.checked
                                    ? [...current, option.value]
                                    : current.filter((v) => v !== option.value);
                                  onFilterChange(group.id, next.length > 0 ? next : undefined);
                                }}
                                className="w-4 h-4 text-brand-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-brand-100 transition-colors cursor-pointer"
                              />
                              <span className="text-sm leading-relaxed text-slate-700 group-hover:text-slate-900 flex-1">
                                {option.label}
                              </span>
                              {option.count !== undefined && (
                                <span className="text-xs text-slate-400">{option.count}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {group.type === 'radio' && group.options && (
                      <div className="space-y-2">
                        {group.options.map(option => {
                          const isChecked = activeFilters[group.id] === option.value;
                          return (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 cursor-pointer group min-h-[44px]"
                            >
                              <input
                                type="radio"
                                checked={isChecked}
                                onChange={() => onFilterChange(group.id, option.value)}
                                className="w-4 h-4 text-brand-600 bg-white border-slate-300 focus:ring-2 focus:ring-brand-100 transition-colors cursor-pointer"
                              />
                              <span className="text-sm leading-relaxed text-slate-700 group-hover:text-slate-900 flex-1">
                                {option.label}
                              </span>
                              {option.count !== undefined && (
                                <span className="text-xs text-slate-400">{option.count}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {group.type === 'range' && (
                      <div className="space-y-3">
                        <input
                          type="range"
                          min={group.min}
                          max={group.max}
                          step={group.step || 1}
                          value={activeFilters[group.id] || group.min}
                          onChange={(e) => onFilterChange(group.id, parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{group.min}</span>
                          <span className="font-medium text-slate-900">
                            {activeFilters[group.id] || group.min}
                          </span>
                          <span>{group.max}</span>
                        </div>
                      </div>
                    )}

                    {group.type === 'select' && group.options && (
                      <select
                        value={activeFilters[group.id] || ''}
                        onChange={(e) => onFilterChange(group.id, e.target.value || undefined)}
                        className="w-full px-3 py-2 text-sm bg-white border border-border rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      >
                        <option value="">All</option>
                        {group.options.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="absolute bottom-0 left-0 right-0 p-4 border-t border-border-light bg-white sm:rounded-none rounded-b-none"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClearAll}
              disabled={activeFilterCount === 0}
              className="flex-1"
            >
              Clear All
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 animate-fade-in"
        />
      )}
    </>
  );
}
