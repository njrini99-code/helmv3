'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchAutocomplete } from '@/components/ui/search-autocomplete';
import type { Player } from '@/lib/types';
import { IconUsers, IconBuilding } from '@/components/icons';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL'];
const GRAD_YEARS = [2025, 2026, 2027, 2028, 2029];
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];
const TEAM_TYPES = [
  { value: 'high_school', label: 'High School' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'travel_ball', label: 'Travel Ball' },
  { value: 'juco', label: 'JUCO' },
];

interface FilterPanelProps {
  currentFilters: {
    gradYear?: number;
    position?: string;
    states?: string[]; // Now supports multiple states
    minVelo?: number;
    maxVelo?: number;
    minExit?: number;
    maxExit?: number;
    hasVideo?: boolean;
    search?: string;
    teamType?: string;
    mode?: 'players' | 'teams';
  };
  mode?: 'players' | 'teams';
}

export function FilterPanel({ currentFilters, mode = 'players' }: FilterPanelProps) {
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
    const params = new URLSearchParams();
    // Preserve the mode when clearing
    if (mode) {
      params.set('mode', mode);
    }
    startTransition(() => {
      router.push(`/baseball/dashboard/discover?${params.toString()}`);
    });
    setSearch('');
  };

  const hasActiveFilters = Object.entries(currentFilters).some(
    ([key, value]) => key !== 'mode' && value !== undefined && value !== ''
  );

  return (
    <div className="glass-subtle rounded-2xl p-6 sticky top-6 overflow-hidden relative">
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {mode === 'players' ? (
            <IconUsers size={18} className="text-green-600" />
          ) : (
            <IconBuilding size={18} className="text-green-600" />
          )}
          <h2 className="font-semibold text-slate-900 tracking-tight">
            {mode === 'players' ? 'Player Filters' : 'Team Filters'}
          </h2>
        </div>
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
        {mode === 'players' ? (
          <SearchAutocomplete
            value={search}
            onChange={setSearch}
            onSelect={(player: Player) => {
              const fullName = `${player.first_name} ${player.last_name}`;
              setSearch(fullName);
              updateFilter('search', fullName);
            }}
            onSubmit={(value: string) => {
              updateFilter('search', value || undefined);
            }}
            placeholder="Name or school..."
          />
        ) : (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateFilter('search', search || undefined);
              }
            }}
            onBlur={() => {
              if (search !== currentFilters.search) {
                updateFilter('search', search || undefined);
              }
            }}
            placeholder="Team name or city..."
            className="w-full px-4 py-2 rounded-lg border border-slate-200
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-sm text-slate-900 bg-white"
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {mode === 'players' ? (
          <motion.div
            key="player-filters"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
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

            {/* State - Multi-select */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                State {currentFilters.states && currentFilters.states.length > 0 && (
                  <span className="text-green-600 font-normal">
                    ({currentFilters.states.length} selected)
                  </span>
                )}
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const currentStates = currentFilters.states || [];
                  const newState = e.target.value;
                  // Toggle state selection
                  const newStates = currentStates.includes(newState)
                    ? currentStates.filter(s => s !== newState)
                    : [...currentStates, newState];
                  updateFilter('state', newStates.length > 0 ? newStates.join(',') : undefined);
                }}
                className="w-full px-4 py-2 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-sm text-slate-900 bg-white"
              >
                <option value="">Add a state...</option>
                {STATES.map((state) => (
                  <option
                    key={state}
                    value={state}
                  >
                    {state} {currentFilters.states?.includes(state) ? '✓' : ''}
                  </option>
                ))}
              </select>
              {/* Show selected states as chips */}
              {currentFilters.states && currentFilters.states.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {currentFilters.states.map(stateCode => (
                    <button
                      key={stateCode}
                      onClick={() => {
                        const newStates = currentFilters.states!.filter(s => s !== stateCode);
                        updateFilter('state', newStates.length > 0 ? newStates.join(',') : undefined);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                                 rounded-md bg-green-100 text-green-700 hover:bg-green-200
                                 transition-colors"
                    >
                      {stateCode}
                      <span className="text-green-500">×</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">
                Tip: Click states on the map for visual selection
              </p>
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
                <span className="text-sm leading-relaxed text-slate-700">Has highlight video</span>
              </label>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="team-filters"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Team Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Team Type
              </label>
              <div className="flex flex-wrap gap-2">
                {TEAM_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => updateFilter('teamType',
                      currentFilters.teamType === type.value ? undefined : type.value
                    )}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
                      ${currentFilters.teamType === type.value
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white/50 text-slate-700 hover:bg-white/80 hover:shadow-sm border border-slate-200/50'
                      }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* State - Multi-select for Teams */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                State {currentFilters.states && currentFilters.states.length > 0 && (
                  <span className="text-green-600 font-normal">
                    ({currentFilters.states.length} selected)
                  </span>
                )}
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const currentStates = currentFilters.states || [];
                  const newState = e.target.value;
                  // Toggle state selection
                  const newStates = currentStates.includes(newState)
                    ? currentStates.filter(s => s !== newState)
                    : [...currentStates, newState];
                  updateFilter('state', newStates.length > 0 ? newStates.join(',') : undefined);
                }}
                className="w-full px-4 py-2 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-sm text-slate-900 bg-white"
              >
                <option value="">Add a state...</option>
                {STATES.map((state) => (
                  <option
                    key={state}
                    value={state}
                  >
                    {state} {currentFilters.states?.includes(state) ? '✓' : ''}
                  </option>
                ))}
              </select>
              {/* Show selected states as chips */}
              {currentFilters.states && currentFilters.states.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {currentFilters.states.map(stateCode => (
                    <button
                      key={stateCode}
                      onClick={() => {
                        const newStates = currentFilters.states!.filter(s => s !== stateCode);
                        updateFilter('state', newStates.length > 0 ? newStates.join(',') : undefined);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                                 rounded-md bg-green-100 text-green-700 hover:bg-green-200
                                 transition-colors"
                    >
                      {stateCode}
                      <span className="text-green-500">×</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">
                Tip: Click states on the map for visual selection
              </p>
            </div>

            {/* Quick Tips for Teams */}
            <div className="p-4 rounded-xl bg-green-50 border border-green-100">
              <h4 className="text-sm font-medium text-green-900 mb-2">
                Pro Tip
              </h4>
              <p className="text-xs text-green-700 leading-relaxed">
                Teams are sorted by number of recruiting-active players.
                Click "View Roster" to see all available prospects from a program.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isPending && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
          <div className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full" />
          <span>Updating...</span>
        </div>
      )}
    </div>
  );
}
