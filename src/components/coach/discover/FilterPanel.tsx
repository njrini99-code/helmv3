'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchAutocomplete } from '@/components/ui/search-autocomplete';
import { Button } from '@/components/ui/button';
import { useSavedSearches } from '@/hooks/use-dashboard';
import type { Player } from '@/lib/types';
import { IconUsers, IconBuilding, IconBookmark, IconTrash, IconChevronDown, IconChevronUp } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const { searches: savedSearches, saveSearch, deleteSearch } = useSavedSearches();

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

  // Build filters object for saving
  const getCurrentFiltersForSave = (): Record<string, string> => {
    const filters: Record<string, string> = {};
    if (currentFilters.gradYear) filters.gradYear = currentFilters.gradYear.toString();
    if (currentFilters.position) filters.position = currentFilters.position;
    if (currentFilters.states?.length) filters.state = currentFilters.states.join(',');
    if (currentFilters.minVelo) filters.minVelo = currentFilters.minVelo.toString();
    if (currentFilters.maxVelo) filters.maxVelo = currentFilters.maxVelo.toString();
    if (currentFilters.minExit) filters.minExit = currentFilters.minExit.toString();
    if (currentFilters.maxExit) filters.maxExit = currentFilters.maxExit.toString();
    if (currentFilters.hasVideo) filters.hasVideo = 'true';
    if (currentFilters.search) filters.search = currentFilters.search;
    if (currentFilters.teamType) filters.teamType = currentFilters.teamType;
    if (mode) filters.mode = mode;
    return filters;
  };

  const handleSaveSearch = () => {
    if (!saveSearchName.trim()) return;
    const filters = getCurrentFiltersForSave();
    saveSearch(saveSearchName.trim(), filters);
    setSaveSearchName('');
    setShowSaveInput(false);
    setShowSavedSearches(true);
  };

  const handleLoadSearch = (filters: Record<string, string>) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    startTransition(() => {
      router.push(`/baseball/dashboard/discover?${params.toString()}`);
    });
    // Update local search state
    if (filters.search) setSearch(filters.search);
  };

  const getSearchDescription = (filters: Record<string, string>): string => {
    const parts: string[] = [];
    if (filters.gradYear) parts.push(`Class of ${filters.gradYear}`);
    if (filters.position) parts.push(filters.position);
    if (filters.state) parts.push(filters.state.split(',').join(', '));
    if (filters.minVelo || filters.maxVelo) {
      if (filters.minVelo && filters.maxVelo) {
        parts.push(`${filters.minVelo}-${filters.maxVelo} mph`);
      } else if (filters.minVelo) {
        parts.push(`${filters.minVelo}+ mph`);
      } else {
        parts.push(`Up to ${filters.maxVelo} mph`);
      }
    }
    if (filters.hasVideo === 'true') parts.push('Has video');
    return parts.length > 0 ? parts.join(' • ') : 'All players';
  };

  return (
    <div className="glass-subtle rounded-2xl p-6 sticky top-6 overflow-clip relative">
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
            <IconUsers size={18} className="text-primary-600" />
          ) : (
            <IconBuilding size={18} className="text-primary-600" />
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
                       focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                       text-sm text-slate-900 bg-white"
          />
        )}
      </div>

      {/* Saved Searches */}
      <div className="mb-6">
        <button
          onClick={() => setShowSavedSearches(!showSavedSearches)}
          className="flex items-center justify-between w-full text-sm font-medium text-slate-700 mb-2 group"
        >
          <span className="flex items-center gap-2">
            <IconBookmark size={14} className="text-primary-500" />
            Saved Searches
            {savedSearches.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                {savedSearches.length}
              </span>
            )}
          </span>
          {showSavedSearches ? (
            <IconChevronUp size={14} className="text-slate-400" />
          ) : (
            <IconChevronDown size={14} className="text-slate-400" />
          )}
        </button>

        <AnimatePresence>
          {showSavedSearches && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Save Current Search */}
              {hasActiveFilters && (
                <div className="mb-3">
                  {showSaveInput ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={saveSearchName}
                        onChange={(e) => setSaveSearchName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveSearch()}
                        placeholder="Search name..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200
                                   focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                                   text-sm text-slate-900 bg-white"
                        autoFocus
                      />
                      <Button size="sm" onClick={handleSaveSearch} className="min-h-[36px]">
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setShowSaveInput(false); setSaveSearchName(''); }}
                        className="min-h-[36px] px-2"
                      >
                        ×
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowSaveInput(true)}
                      className="w-full justify-center gap-2 min-h-[36px]"
                    >
                      <IconBookmark size={14} />
                      Save Current Search
                    </Button>
                  )}
                </div>
              )}

              {/* Saved Searches List */}
              {savedSearches.length > 0 ? (
                <div className="space-y-2">
                  {savedSearches.map((savedSearch) => (
                    <div
                      key={savedSearch.id}
                      className="group flex items-start justify-between p-3 rounded-xl bg-white/50 
                                 border border-slate-200/50 hover:border-primary-200 hover:bg-primary-50/30
                                 transition-all duration-200 cursor-pointer"
                      onClick={() => handleLoadSearch(savedSearch.filters)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-primary-700 transition-colors">
                          {savedSearch.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {getSearchDescription(savedSearch.filters)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSearch(savedSearch.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50
                                   opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2"
                        aria-label="Delete saved search"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">
                  No saved searches yet. Apply filters and save them for quick access.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
                           focus:border-primary-500 focus:ring-2 focus:ring-primary-100
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
                  <span className="text-primary-600 font-normal">
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
                           focus:border-primary-500 focus:ring-2 focus:ring-primary-100
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
                                 rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200
                                 transition-colors"
                    >
                      {stateCode}
                      <span className="text-primary-500">×</span>
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
                             focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                             text-sm text-slate-900"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={currentFilters.maxVelo || ''}
                  onChange={(e) => updateFilter('maxVelo', e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200
                             focus:border-primary-500 focus:ring-2 focus:ring-primary-100
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
                             focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                             text-sm text-slate-900"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={currentFilters.maxExit || ''}
                  onChange={(e) => updateFilter('maxExit', e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200
                             focus:border-primary-500 focus:ring-2 focus:ring-primary-100
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
                  className="w-4 h-4 rounded border-slate-300 text-primary-600
                             focus:ring-primary-500"
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
                  <span className="text-primary-600 font-normal">
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
                           focus:border-primary-500 focus:ring-2 focus:ring-primary-100
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
                                 rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200
                                 transition-colors"
                    >
                      {stateCode}
                      <span className="text-primary-500">×</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">
                Tip: Click states on the map for visual selection
              </p>
            </div>

            {/* Quick Tips for Teams */}
            <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
              <h4 className="text-sm font-medium text-primary-900 mb-2">
                Pro Tip
              </h4>
              <p className="text-xs text-primary-700 leading-relaxed">
                Teams are sorted by number of recruiting-active players.
                Click "View Roster" to see all available prospects from a program.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isPending && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
    </div>
  );
}
