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

interface FilterPanelProps {
  filters: FilterGroup[];
  activeFilters: Record<string, any>;
  onFilterChange: (filterId: string, value: any) => void;
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
          'fixed top-0 right-0 h-full w-80 bg-white shadow-elevation-4 transform transition-transform duration-300 ease-out z-50',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <div className="flex items-center gap-2">
            <IconFilter size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {activeFilterCount > 0 && (
              <Badge variant="primary" className="px-2 py-0.5">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <IconX size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-140px)] custom-scrollbar">
          <div className="p-4 space-y-6">
            {filters.map(group => (
              <div key={group.id} className="space-y-3">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between text-sm font-medium text-gray-900 hover:text-brand-600 transition-colors"
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
                          const isChecked = activeFilters[group.id]?.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const current = activeFilters[group.id] || [];
                                  const next = e.target.checked
                                    ? [...current, option.value]
                                    : current.filter((v: string) => v !== option.value);
                                  onFilterChange(group.id, next.length > 0 ? next : undefined);
                                }}
                                className="w-4 h-4 text-brand-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-brand-100 transition-colors cursor-pointer"
                              />
                              <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">
                                {option.label}
                              </span>
                              {option.count !== undefined && (
                                <span className="text-xs text-gray-400">{option.count}</span>
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
                              className="flex items-center gap-2 cursor-pointer group"
                            >
                              <input
                                type="radio"
                                checked={isChecked}
                                onChange={() => onFilterChange(group.id, option.value)}
                                className="w-4 h-4 text-brand-600 bg-white border-gray-300 focus:ring-2 focus:ring-brand-100 transition-colors cursor-pointer"
                              />
                              <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">
                                {option.label}
                              </span>
                              {option.count !== undefined && (
                                <span className="text-xs text-gray-400">{option.count}</span>
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
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{group.min}</span>
                          <span className="font-medium text-gray-900">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border-light bg-white">
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
          className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 animate-fade-in"
        />
      )}
    </>
  );
}
