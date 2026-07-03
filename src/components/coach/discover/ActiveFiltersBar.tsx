'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconX } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';

interface ActiveFiltersBarProps {
  filters: {
    gradYear?: number;
    position?: string;
    states?: string[]; // Now supports multiple states
    minVelo?: number;
    maxVelo?: number;
    minExit?: number;
    maxExit?: number;
    hasVideo?: boolean;
    search?: string;
  };
  totalCount: number;
  className?: string;
}

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

export function ActiveFiltersBar({ filters, totalCount, className }: ActiveFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const removeFilter = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Handle velocity filters (remove both min and max when removing velocity)
    if (key === 'minVelo' || key === 'maxVelo') {
      params.delete('minVelo');
      params.delete('maxVelo');
    } else if (key === 'minExit' || key === 'maxExit') {
      params.delete('minExit');
      params.delete('maxExit');
    } else if (key === 'state' && value && filters.states) {
      // Handle removing individual state from multiple states
      const remainingStates = filters.states.filter(s => s !== value);
      if (remainingStates.length > 0) {
        params.set('state', remainingStates.join(','));
      } else {
        params.delete('state');
      }
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/baseball/dashboard/discover?${params.toString()}`);
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Keep mode but clear all filters
    const mode = params.get('mode');
    params.forEach((_, key) => params.delete(key));
    if (mode) params.set('mode', mode);
    router.push(`/baseball/dashboard/discover?${params.toString()}`);
  };

  // Build filter chips
  const chips: { key: string; label: string; value: string; removeValue?: string }[] = [];

  // Add individual state chips for each selected state
  if (filters.states && filters.states.length > 0) {
    filters.states.forEach(stateCode => {
      chips.push({
        key: 'state',
        label: 'State',
        value: STATE_NAMES[stateCode] || stateCode,
        removeValue: stateCode
      });
    });
  }
  if (filters.gradYear) {
    chips.push({ key: 'gradYear', label: 'Class', value: filters.gradYear.toString() });
  }
  if (filters.position) {
    chips.push({ key: 'position', label: 'Position', value: filters.position });
  }
  if (filters.minVelo || filters.maxVelo) {
    const veloText = filters.minVelo && filters.maxVelo 
      ? `${filters.minVelo}-${filters.maxVelo} mph`
      : filters.minVelo ? `${filters.minVelo}+ mph` : `≤${filters.maxVelo} mph`;
    chips.push({ key: 'minVelo', label: 'Pitch Velo', value: veloText });
  }
  if (filters.minExit || filters.maxExit) {
    const exitText = filters.minExit && filters.maxExit 
      ? `${filters.minExit}-${filters.maxExit} mph`
      : filters.minExit ? `${filters.minExit}+ mph` : `≤${filters.maxExit} mph`;
    chips.push({ key: 'minExit', label: 'Exit Velo', value: exitText });
  }
  if (filters.hasVideo) {
    chips.push({ key: 'hasVideo', label: '', value: 'Has Video' });
  }
  if (filters.search) {
    chips.push({ key: 'search', label: 'Search', value: `"${filters.search}"` });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl bg-warm-50/80 border border-warm-100',
      'animate-fade-in',
      className
    )}>
      <span className="text-sm text-warm-500 font-medium whitespace-nowrap">
        <span className="font-semibold text-warm-900">{totalCount.toLocaleString()}</span>
        {' '}{totalCount === 1 ? 'player' : 'players'}
      </span>
      
      <div className="w-px h-5 bg-warm-200" />
      
      <div className="flex items-center gap-2 flex-wrap flex-1">
        {chips.map((chip, index) => (
          <div
            key={`${chip.key}-${chip.removeValue || index}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                       bg-cream-50 border border-warm-200 text-sm
                       animate-scale-in shadow-sm"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {chip.label && (
              <span className="text-warm-400">{chip.label}:</span>
            )}
            <span className="font-medium text-warm-700">{chip.value}</span>
            <IconButton variant="default" aria-label="Close"
              onClick={() => removeFilter(chip.key, chip.removeValue)}
              className="ml-0.5 p-0.5 rounded hover:bg-warm-100 transition-colors active:bg-warm-200 text-warm-400
                         hover:text-warm-600 transition-colors"
            >
              <IconX size={12} />
            </IconButton>
          </div>
        ))}
      </div>

      {chips.length > 1 && (
        <Button variant="ghost"
          onClick={clearAll}
          className="text-sm text-warm-500 hover:text-warm-700 font-medium
                     whitespace-nowrap transition-colors"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
