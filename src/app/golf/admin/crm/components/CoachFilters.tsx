'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CoachStatus, Division, ProgramType } from '../page';
import { IconSearch, IconFilter, IconChevronDown, IconX } from '@/components/icons';

export interface Filters {
  status: CoachStatus | 'all';
  stage: 'lead' | 'active' | 'closing' | 'closed' | 'all';
  division: Division | 'all';
  conference: string | 'all';
  program: ProgramType | 'all';
  priority: string | 'all';
  search: string;
  followUpDue: boolean;
  starred: boolean;
  hasNotes: boolean;
  noContact30Days: boolean;
}

interface CoachFiltersProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  conferences: string[];
  statusConfig: Record<CoachStatus, { label: string; stage: string }>;
}

const STAGE_OPTIONS = [
  { value: 'all', label: 'All Stages' },
  { value: 'lead', label: '🎯 Leads' },
  { value: 'active', label: '💬 Active' },
  { value: 'closing', label: '🤝 Closing' },
  { value: 'closed', label: '✓ Closed' },
];

const DIVISION_OPTIONS = [
  { value: 'all', label: 'All Divisions' },
  { value: 'D2', label: 'D2' },
  { value: 'D3', label: 'D3' },
];

const PROGRAM_OPTIONS = [
  { value: 'all', label: 'All Programs' },
  { value: 'mens', label: "Men's" },
  { value: 'womens', label: "Women's" },
  { value: 'both', label: 'Both' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: '3', label: '🔥 Hot' },
  { value: '2', label: '!! Urgent' },
  { value: '1', label: '! High' },
  { value: '0', label: 'Normal' },
];

export function CoachFilters({ filters, setFilters, conferences, statusConfig }: CoachFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const activeFilterCount = [
    filters.status !== 'all',
    filters.stage !== 'all',
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
      stage: 'all',
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

  const statusOptions = Object.entries(statusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  }));

  return (
    <div className="bg-white rounded-xl border border-warm-200 overflow-hidden">
      {/* Main Filter Row */}
      <div className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[250px]">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="text"
              placeholder="Search name, school, email, conference..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ ...filters, search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
              >
                <IconX className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Stage Filter - Primary */}
          <select
            value={filters.stage}
            onChange={(e) => setFilters({ ...filters, stage: e.target.value as Filters['stage'] })}
            className={cn(
              'px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm font-medium',
              filters.stage !== 'all' ? 'border-emerald-300 bg-emerald-50' : 'border-warm-200'
            )}
          >
            {STAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Division Filter */}
          <select
            value={filters.division}
            onChange={(e) => setFilters({ ...filters, division: e.target.value as Division | 'all' })}
            className={cn(
              'px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm',
              filters.division !== 'all' ? 'border-emerald-300 bg-emerald-50' : 'border-warm-200'
            )}
          >
            {DIVISION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className={cn(
              'px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm',
              filters.priority !== 'all' ? 'border-orange-300 bg-orange-50' : 'border-warm-200'
            )}
          >
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Advanced Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
              showAdvanced || activeFilterCount > 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-warm-200 text-warm-600 hover:bg-warm-50'
            )}
          >
            <IconFilter className="w-4 h-4" />
            Advanced
            {activeFilterCount > 0 && (
              <span className="bg-emerald-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
            <IconChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
          </button>

          {/* Clear All */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-warm-500 hover:text-warm-700 underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="border-t border-warm-200 bg-warm-50 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Status (specific) */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-warm-600">Status:</span>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as CoachStatus | 'all' })}
                className="px-3 py-1.5 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
              >
                <option value="all">All</option>
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Conference */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-warm-600">Conference:</span>
              <select
                value={filters.conference}
                onChange={(e) => setFilters({ ...filters, conference: e.target.value })}
                className="px-3 py-1.5 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm max-w-[200px]"
              >
                <option value="all">All</option>
                {conferences.map(conf => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </div>

            {/* Program */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-warm-600">Program:</span>
              <select
                value={filters.program}
                onChange={(e) => setFilters({ ...filters, program: e.target.value as ProgramType | 'all' })}
                className="px-3 py-1.5 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
              >
                {PROGRAM_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-warm-300" />

            {/* Toggle Filters */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.followUpDue}
                onChange={(e) => setFilters({ ...filters, followUpDue: e.target.checked })}
                className="w-4 h-4 rounded border-warm-300 text-orange-600 focus:ring-orange-500"
              />
              <span className={cn('text-sm', filters.followUpDue ? 'text-orange-600 font-medium' : 'text-warm-600')}>
                Follow-ups due
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.starred}
                onChange={(e) => setFilters({ ...filters, starred: e.target.checked })}
                className="w-4 h-4 rounded border-warm-300 text-yellow-500 focus:ring-yellow-500"
              />
              <span className={cn('text-sm', filters.starred ? 'text-yellow-600 font-medium' : 'text-warm-600')}>
                ⭐ Starred only
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.hasNotes}
                onChange={(e) => setFilters({ ...filters, hasNotes: e.target.checked })}
                className="w-4 h-4 rounded border-warm-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className={cn('text-sm', filters.hasNotes ? 'text-emerald-600 font-medium' : 'text-warm-600')}>
                Has notes
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.noContact30Days}
                onChange={(e) => setFilters({ ...filters, noContact30Days: e.target.checked })}
                className="w-4 h-4 rounded border-warm-300 text-red-600 focus:ring-red-500"
              />
              <span className={cn('text-sm', filters.noContact30Days ? 'text-red-600 font-medium' : 'text-warm-600')}>
                No contact 30+ days
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
