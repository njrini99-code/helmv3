'use client';

import { cn } from '@/lib/utils';
import type { CoachStatus } from '../page';

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
  statusConfig: Record<CoachStatus, { label: string; icon: string }>;
}

export function CoachFilters({
  filters,
  setFilters,
  conferences,
}: CoachFiltersProps) {
  const activeFilterCount = [
    filters.division !== 'all',
    filters.conference !== 'all',
    filters.program !== 'all',
    filters.priority !== 'all',
    filters.followUpDue,
    filters.starred,
    filters.hasNotes,
    filters.noContact30Days,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilters({
      status: 'all',
      division: 'all',
      conference: 'all',
      program: 'all',
      priority: 'all',
      search: '',
      followUpDue: false,
      starred: false,
      hasNotes: false,
      noContact30Days: false,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search coaches, schools, emails..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Division */}
        <select
          value={filters.division}
          onChange={(e) => setFilters(f => ({ ...f, division: e.target.value as Filters['division'] }))}
          className={cn(
            'px-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500',
            filters.division !== 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
          )}
        >
          <option value="all">All Divisions</option>
          <option value="D2">🔵 D2</option>
          <option value="D3">🟣 D3</option>
        </select>

        {/* Conference */}
        <select
          value={filters.conference}
          onChange={(e) => setFilters(f => ({ ...f, conference: e.target.value }))}
          className={cn(
            'px-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[200px]',
            filters.conference !== 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
          )}
        >
          <option value="all">All Conferences</option>
          {conferences.map(conf => (
            <option key={conf} value={conf}>{conf}</option>
          ))}
        </select>

        {/* Priority */}
        <select
          value={filters.priority}
          onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value }))}
          className={cn(
            'px-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500',
            filters.priority !== 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
          )}
        >
          <option value="all">All Priorities</option>
          <option value="2">🔥 Hot</option>
          <option value="1">⚡ High</option>
          <option value="0">Normal</option>
        </select>

        {/* Quick Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}
            className={cn(
              'px-3 py-2 rounded-xl text-sm font-medium transition-all',
              filters.starred 
                ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            ⭐ Starred
          </button>
          <button
            onClick={() => setFilters(f => ({ ...f, followUpDue: !f.followUpDue }))}
            className={cn(
              'px-3 py-2 rounded-xl text-sm font-medium transition-all',
              filters.followUpDue 
                ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-300' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            ⏰ Due
          </button>
        </div>

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            ✕ Clear ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
}
