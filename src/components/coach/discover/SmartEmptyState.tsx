'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { IconSearch, IconMapPin, IconFilter, IconUsers, IconArrowRight } from '@/components/icons';

interface SmartEmptyStateProps {
  // Shape matches DiscoverView's `filters` prop (this component's sole
  // caller, via DiscoverView.tsx) — `states` is a multi-select array, not a
  // single `state` string. The caller's real filters object also carries a
  // `mode: 'players' | 'teams'` field that is intentionally NOT declared
  // here: it is never a user-set filter, so it must stay out of
  // `activeFilterCount` below (see that count's own comment).
  filters: {
    gradYear?: number;
    position?: string;
    states?: string[];
    minVelo?: number;
    maxVelo?: number;
    minExit?: number;
    maxExit?: number;
    hasVideo?: boolean;
    search?: string;
    teamType?: string;
  };
  stateCounts?: Record<string, number>;
  totalPlayersUnfiltered?: number;
  className?: string;
}

// Neighboring states mapping
const NEIGHBORING_STATES: Record<string, string[]> = {
  AL: ['FL', 'GA', 'MS', 'TN'],
  AK: [],
  AZ: ['CA', 'CO', 'NM', 'NV', 'UT'],
  AR: ['LA', 'MO', 'MS', 'OK', 'TN', 'TX'],
  CA: ['AZ', 'NV', 'OR'],
  CO: ['AZ', 'KS', 'NE', 'NM', 'OK', 'UT', 'WY'],
  CT: ['MA', 'NY', 'RI'],
  DE: ['MD', 'NJ', 'PA'],
  FL: ['AL', 'GA'],
  GA: ['AL', 'FL', 'NC', 'SC', 'TN'],
  HI: [],
  ID: ['MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
  IL: ['IA', 'IN', 'KY', 'MO', 'WI'],
  IN: ['IL', 'KY', 'MI', 'OH'],
  IA: ['IL', 'MN', 'MO', 'NE', 'SD', 'WI'],
  KS: ['CO', 'MO', 'NE', 'OK'],
  KY: ['IL', 'IN', 'MO', 'OH', 'TN', 'VA', 'WV'],
  LA: ['AR', 'MS', 'TX'],
  ME: ['NH'],
  MD: ['DE', 'PA', 'VA', 'WV'],
  MA: ['CT', 'NH', 'NY', 'RI', 'VT'],
  MI: ['IN', 'OH', 'WI'],
  MN: ['IA', 'ND', 'SD', 'WI'],
  MS: ['AL', 'AR', 'LA', 'TN'],
  MO: ['AR', 'IA', 'IL', 'KS', 'KY', 'NE', 'OK', 'TN'],
  MT: ['ID', 'ND', 'SD', 'WY'],
  NE: ['CO', 'IA', 'KS', 'MO', 'SD', 'WY'],
  NV: ['AZ', 'CA', 'ID', 'OR', 'UT'],
  NH: ['MA', 'ME', 'VT'],
  NJ: ['DE', 'NY', 'PA'],
  NM: ['AZ', 'CO', 'OK', 'TX', 'UT'],
  NY: ['CT', 'MA', 'NJ', 'PA', 'VT'],
  NC: ['GA', 'SC', 'TN', 'VA'],
  ND: ['MN', 'MT', 'SD'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  OK: ['AR', 'CO', 'KS', 'MO', 'NM', 'TX'],
  OR: ['CA', 'ID', 'NV', 'WA'],
  PA: ['DE', 'MD', 'NJ', 'NY', 'OH', 'WV'],
  RI: ['CT', 'MA'],
  SC: ['GA', 'NC'],
  SD: ['IA', 'MN', 'MT', 'ND', 'NE', 'WY'],
  TN: ['AL', 'AR', 'GA', 'KY', 'MO', 'MS', 'NC', 'VA'],
  TX: ['AR', 'LA', 'NM', 'OK'],
  UT: ['AZ', 'CO', 'ID', 'NV', 'NM', 'WY'],
  VT: ['MA', 'NH', 'NY'],
  VA: ['KY', 'MD', 'NC', 'TN', 'WV'],
  WA: ['ID', 'OR'],
  WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WI: ['IA', 'IL', 'MI', 'MN'],
  WY: ['CO', 'ID', 'MT', 'NE', 'SD', 'UT'],
};

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export function SmartEmptyState({
  filters,
  stateCounts = {},
  totalPlayersUnfiltered = 0,
  className,
}: SmartEmptyStateProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Count how many filters are active. Mirrors the exact curated field list
  // DiscoverClient.tsx's own `activeFilterCount` (the number shown on the
  // "Filters" button badge and the mobile Sheet description) uses — do NOT
  // swap this back to Object.values(filters). The real filters object this
  // component receives also carries a `mode: 'players' | 'teams'` field
  // (always a non-empty string, never a user-set filter) which would
  // permanently over-count by at least one and desync this copy from the
  // badge the coach can actually see and clear.
  const activeFilterCount = [
    filters.gradYear,
    filters.position,
    filters.states && filters.states.length > 0 ? true : undefined,
    filters.minVelo,
    filters.maxVelo,
    filters.minExit,
    filters.maxExit,
    filters.hasVideo,
    filters.search,
    filters.teamType,
  ].filter(Boolean).length;

  // NEIGHBORING_STATES suggestions only make sense for a single selected
  // state; a multi-state selection falls through to the "top states for
  // position" suggestions below instead (no single neighbor set to offer).
  const singleSelectedState =
    filters.states && filters.states.length === 1 ? filters.states[0] : undefined;

  // Generate suggestions based on current filters
  const suggestions = useMemo(() => {
    const result: Array<{
      type: 'state' | 'velocity' | 'gradYear' | 'position' | 'clear';
      label: string;
      description: string;
      count?: number;
      action: () => void;
      icon: typeof IconMapPin;
    }> = [];

    // If filtered by a single state, suggest neighboring states
    if (singleSelectedState && stateCounts) {
      const neighbors = NEIGHBORING_STATES[singleSelectedState] || [];
      const neighboringSuggestions = neighbors
        .filter(code => (stateCounts[code] || 0) > 0)
        .map(code => ({
          code,
          name: STATE_NAMES[code] || code,
          count: stateCounts[code] || 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      neighboringSuggestions.forEach(state => {
        result.push({
          type: 'state' as const,
          label: `Try ${state.name}`,
          description: `${state.count} player${state.count === 1 ? '' : 's'}`,
          count: state.count,
          action: () => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('state', state.code);
            params.delete('page');
            router.push(`?${params.toString()}`);
          },
          icon: IconMapPin,
        });
      });
    }

    // If filtered by velocity, suggest lower threshold
    if (filters.minVelo && filters.minVelo > 85) {
      const lowerThreshold = Math.max(85, filters.minVelo - 5);
      result.push({
        type: 'velocity' as const,
        label: `Lower velocity to ${lowerThreshold}+ mph`,
        description: 'See more pitchers',
        action: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('minVelo', lowerThreshold.toString());
          params.delete('page');
          router.push(`?${params.toString()}`);
        },
        icon: IconFilter,
      });
    }

    // If filtered by grad year, suggest adjacent year
    if (filters.gradYear) {
      const nextYear = filters.gradYear + 1;
      result.push({
        type: 'gradYear' as const,
        label: `Include Class of ${nextYear}`,
        description: 'Expand to younger players',
        action: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('gradYear'); // Remove to show all
          params.delete('page');
          router.push(`?${params.toString()}`);
        },
        icon: IconUsers,
      });
    }

    // If search query, suggest clearing it
    if (filters.search) {
      result.push({
        type: 'clear' as const,
        label: 'Clear search term',
        description: `Remove "${filters.search}"`,
        action: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('search');
          params.delete('page');
          router.push(`?${params.toString()}`);
        },
        icon: IconSearch,
      });
    }

    return result.slice(0, 4); // Max 4 suggestions
  }, [filters, singleSelectedState, stateCounts, searchParams, router]);

  // Clear all filters
  const clearAllFilters = () => {
    router.push('/baseball/dashboard/discover');
  };

  // Get top states for the position if position is filtered
  const topStatesForPosition = useMemo(() => {
    if (!filters.position || !stateCounts) return [];
    
    return Object.entries(stateCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code, count]) => ({
        code,
        name: STATE_NAMES[code] || code,
        count,
      }));
  }, [filters.position, stateCounts]);

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 text-center',
      'animate-fade-in',
      className
    )}>
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-warm-100 flex items-center justify-center mb-6">
        <IconSearch size={36} className="text-warm-400" />
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-warm-900 mb-2">
        No players match your filters
      </h3>

      {/* Subtitle */}
      <p className="text-warm-500 mb-8 max-w-md">
        {activeFilterCount > 1 
          ? `You have ${activeFilterCount} filters active. Try adjusting your criteria to find more players.`
          : 'Try adjusting your search criteria to find more players.'}
      </p>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="w-full max-w-lg mb-8">
          <p className="text-sm font-medium text-warm-700 mb-4">
            Suggestions
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((suggestion, index) => (
              <Button variant="primary"
                key={index}
                onClick={suggestion.action}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl text-left',
                  'bg-cream-50 border border-warm-200',
                  'hover:border-primary-300 hover:bg-primary-50/50',
                  'transition-all duration-200',
                  'group animate-scale-in'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors">
                  <suggestion.icon size={18} className="text-warm-500 group-hover:text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-warm-900 group-hover:text-primary-700 transition-colors">
                    {suggestion.label}
                  </p>
                  <p className="text-sm text-warm-500">
                    {suggestion.description}
                  </p>
                </div>
                <IconArrowRight size={16} className="text-warm-300 group-hover:text-primary-500 transition-colors flex-shrink-0" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Top states for position */}
      {filters.position && topStatesForPosition.length > 0 && !singleSelectedState && (
        <div className="w-full max-w-lg mb-8">
          <p className="text-sm font-medium text-warm-700 mb-4">
            Top states for {filters.position}s
          </p>
          <div className="flex justify-center gap-3">
            {topStatesForPosition.map((state, index) => (
              <Button variant="primary"
                key={state.code}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('state', state.code);
                  params.delete('page');
                  router.push(`?${params.toString()}`);
                }}
                className={cn(
                  'px-4 py-3 rounded-xl bg-cream-50 border border-warm-200',
                  'hover:border-primary-300 hover:bg-primary-50/50',
                  'transition-all duration-200 animate-scale-in'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <p className="font-semibold text-warm-900">{state.name}</p>
                <p className="text-sm text-warm-500">{state.count} players</p>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Clear all button */}
      {activeFilterCount > 0 && (
        <Button
          variant="secondary"
          onClick={clearAllFilters}
          className="gap-2"
        >
          <IconFilter size={16} />
          Clear all filters
          {totalPlayersUnfiltered > 0 && (
            <span className="text-warm-400 font-normal">
              ({totalPlayersUnfiltered.toLocaleString('en-US')} total)
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
