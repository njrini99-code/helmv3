'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Search, X, Clock, Star, ChevronDown, ChevronUp, FileText, AlertCircle, Loader2 } from 'lucide-react';
import type { CoachStatus } from '../crm-config';

export interface Filters {
  status: CoachStatus | 'all';
  division: 'all' | 'D2' | 'D3';
  conference: string;
  program: 'all' | 'mens' | 'womens' | 'both';
  priority: string;
  search: string;
  followUpDue: boolean;
  starred: boolean;
  hasNotes: boolean;
  noContact30Days: boolean;
}

interface CoachFiltersProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  conferences: string[];
  statusConfig: Record<CoachStatus, { label: string; icon: React.ReactNode }>;
}

export function CoachFilters({
  filters,
  setFilters,
  conferences,
  statusConfig,
}: CoachFiltersProps) {
  const [showMore, setShowMore] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Debounce search input — 300ms delay before updating parent filter
  useEffect(() => {
    if (localSearch === filters.search) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    const timeout = setTimeout(() => {
      setFilters(f => ({ ...f, search: localSearch }));
      setIsDebouncing(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [localSearch, filters.search, setFilters]);

  // Sync local search when parent clears filters
  useEffect(() => {
    if (filters.search === '' && localSearch !== '') {
      setLocalSearch('');
    }
  }, [filters.search, localSearch]);

  const activeFilterCount = [
    filters.status !== 'all',
    filters.division !== 'all',
    filters.conference !== 'all',
    filters.program !== 'all',
    filters.priority !== 'all',
    filters.followUpDue,
    filters.starred,
    filters.hasNotes,
    filters.noContact30Days,
  ].filter(Boolean).length;

  const hasSecondaryFilters = filters.conference !== 'all' || filters.status !== 'all' || filters.followUpDue || filters.starred || filters.hasNotes || filters.noContact30Days || filters.priority !== 'all';

  const clearFilters = () => {
    setLocalSearch('');
    setFilters({
      status: 'all', division: 'all', conference: 'all', program: 'all', priority: 'all',
      search: '', followUpDue: false, starred: false, hasNotes: false, noContact30Days: false,
    });
  };

  return (
    <div className="glass-standard rounded-2xl p-4 space-y-3">
      {/* Row 1: Search + Division + Program */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          {isDebouncing ? (
            <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400 animate-spin" />
          ) : (
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          )}
          <input
            type="text"
            placeholder="Search coaches, schools, conferences..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className={cn(
              'w-full pl-9 pr-8 py-2 rounded-[10px] text-sm',
              'bg-white/80 border border-warm-200/50',
              'text-warm-900 placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300',
              'transition-all duration-200'
            )}
          />
          {localSearch && (
            <button onClick={() => { setLocalSearch(''); setFilters(f => ({ ...f, search: '' })); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Division segment control */}
        <div className="flex items-center gap-1 bg-warm-100/50 rounded-lg p-0.5">
          {(['all', 'D2', 'D3'] as const).map(div => (
            <button
              key={div}
              onClick={() => setFilters(f => ({ ...f, division: div === 'all' ? 'all' : div }))}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap',
                filters.division === div
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-700'
              )}
            >
              {div === 'all' ? 'All' : div}
            </button>
          ))}
        </div>

        {/* Program segment control */}
        <div className="flex items-center gap-1 bg-warm-100/50 rounded-lg p-0.5">
          {([
            { value: 'all', label: 'All' },
            { value: 'mens', label: "Men's" },
            { value: 'womens', label: "Women's" },
            { value: 'both', label: 'Both' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilters(f => ({ ...f, program: opt.value }))}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap',
                filters.program === opt.value
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* More Filters toggle */}
        <button
          onClick={() => setShowMore(!showMore)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
            showMore || hasSecondaryFilters
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50 active:bg-warm-100'
          )}
        >
          {showMore ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 bg-primary-600 text-white text-micro font-bold rounded-full leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap ml-auto">
            <X size={12} /> Clear {activeFilterCount}
          </button>
        )}
      </div>

      {/* Row 2: Expandable secondary filters */}
      {showMore && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-warm-100/50">
          {/* Conference dropdown */}
          <select
            value={filters.conference}
            onChange={(e) => setFilters(f => ({ ...f, conference: e.target.value }))}
            className={cn(
              'px-3 py-2 rounded-[10px] text-xs font-medium',
              'bg-white/80 border border-warm-200/50 text-warm-600',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
              'max-w-[180px] cursor-pointer',
              filters.conference !== 'all' && 'border-primary-300 bg-primary-50 text-primary-700'
            )}
          >
            <option value="all">All Conferences</option>
            {conferences.map(conf => <option key={conf} value={conf}>{conf}</option>)}
          </select>

          {/* Status dropdown */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value as Filters['status'] }))}
            className={cn(
              'px-3 py-2 rounded-[10px] text-xs font-medium',
              'bg-white/80 border border-warm-200/50 text-warm-600',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
              'cursor-pointer',
              filters.status !== 'all' && 'border-primary-300 bg-primary-50 text-primary-700'
            )}
          >
            <option value="all">All Statuses</option>
            {(Object.keys(statusConfig) as CoachStatus[]).map(s => <option key={s} value={s}>{statusConfig[s].label}</option>)}
          </select>

          {/* Priority dropdown */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value }))}
            className={cn(
              'px-3 py-2 rounded-[10px] text-xs font-medium',
              'bg-white/80 border border-warm-200/50 text-warm-600',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
              'cursor-pointer',
              filters.priority !== 'all' && 'border-primary-300 bg-primary-50 text-primary-700'
            )}
          >
            <option value="all">All Priorities</option>
            <option value="0">Normal</option>
            <option value="1">High</option>
            <option value="2">Hot</option>
          </select>

          {/* Quick filter pills */}
          <button
            onClick={() => setFilters(f => ({ ...f, followUpDue: !f.followUpDue }))}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
              filters.followUpDue
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50 active:bg-warm-100'
            )}
          >
            <Clock size={12} /> Follow-ups Due
          </button>

          <button
            onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
              filters.starred
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50 active:bg-warm-100'
            )}
          >
            <Star size={12} /> Starred
          </button>

          <button
            onClick={() => setFilters(f => ({ ...f, hasNotes: !f.hasNotes }))}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
              filters.hasNotes
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50 active:bg-warm-100'
            )}
          >
            <FileText size={12} /> Has Notes
          </button>

          <button
            onClick={() => setFilters(f => ({ ...f, noContact30Days: !f.noContact30Days }))}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
              filters.noContact30Days
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50 active:bg-warm-100'
            )}
          >
            <AlertCircle size={12} /> No Contact 30 Days
          </button>
        </div>
      )}
    </div>
  );
}
