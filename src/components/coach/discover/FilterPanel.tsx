'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { IconSearch, IconX } from '@/components/icons';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029];
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

interface FilterPanelProps {
  currentFilters: {
    gradYear?: number;
    position?: string;
    state?: string;
    minVelo?: number;
    maxVelo?: number;
    minExit?: number;
    maxExit?: number;
    hasVideo?: boolean;
    search?: string;
  };
}

export function FilterPanel({ currentFilters }: FilterPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentFilters.search || '');

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when filters change
    params.delete('page');

    startTransition(() => {
      router.push(`/baseball/dashboard/discover?${params.toString()}`);
    });
  };

  const clearAllFilters = () => {
    startTransition(() => {
      router.push('/baseball/dashboard/discover');
    });
    setSearch('');
  };

  const hasActiveFilters = Object.values(currentFilters).some(v => v !== undefined && v !== '');

  return (
    <div className="bg-white/70 backdrop-blur-xl saturate-150 rounded-2xl border border-white/20 shadow-lg p-6 sticky top-6 overflow-hidden">
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-slate-900 tracking-tight">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-slate-500 hover:text-slate-900 transition-colors duration-200"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Search
        </label>
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateFilter('search', search || undefined);
              }
            }}
            placeholder="Name or school..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                updateFilter('search', undefined);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <IconX size={16} className="text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Grad Year */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Graduation Year
        </label>
        <div className="flex flex-wrap gap-2">
          {GRAD_YEARS.map((year) => (
            <button
              key={year}
              onClick={() => updateFilter('gradYear',
                currentFilters.gradYear === year ? undefined : year.toString()
              )}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
                ${currentFilters.gradYear === year
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white/50 text-slate-700 hover:bg-white/80 hover:shadow-sm border border-slate-200/50'
                }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Position */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Position
        </label>
        <select
          value={currentFilters.position || ''}
          onChange={(e) => updateFilter('position', e.target.value || undefined)}
          className="w-full px-4 py-2 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-sm text-slate-900 bg-white"
        >
          <option value="">All Positions</option>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </div>

      {/* State */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          State
        </label>
        <select
          value={currentFilters.state || ''}
          onChange={(e) => updateFilter('state', e.target.value || undefined)}
          className="w-full px-4 py-2 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-sm text-slate-900 bg-white"
        >
          <option value="">All States</option>
          {STATES.map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
      </div>

      {/* Pitch Velocity */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Pitch Velocity (mph)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={currentFilters.minVelo || ''}
            onChange={(e) => updateFilter('minVelo', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            placeholder="Max"
            value={currentFilters.maxVelo || ''}
            onChange={(e) => updateFilter('maxVelo', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
        </div>
      </div>

      {/* Exit Velocity */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Exit Velocity (mph)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={currentFilters.minExit || ''}
            onChange={(e) => updateFilter('minExit', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            placeholder="Max"
            value={currentFilters.maxExit || ''}
            onChange={(e) => updateFilter('maxExit', e.target.value || undefined)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900"
          />
        </div>
      </div>

      {/* Has Video */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentFilters.hasVideo || false}
            onChange={(e) => updateFilter('hasVideo', e.target.checked ? 'true' : undefined)}
            className="w-4 h-4 rounded border-slate-300 text-green-600
                       focus:ring-green-500"
          />
          <span className="text-sm text-slate-700">Has highlight video</span>
        </label>
      </div>

      {isPending && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
          <div className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full" />
          <span>Updating...</span>
        </div>
      )}
    </div>
  );
}
