'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Player } from '@/lib/types';
import { PlayerCardData } from './PlayerCard';
import { PlayerCardGrid } from './PlayerCardGrid';
import { USAMap } from './USAMap';
import { ActiveFiltersBar } from './ActiveFiltersBar';
import { CompareBar } from './CompareBar';
import { SmartEmptyState } from './SmartEmptyState';
import { PlayerHoverPreview } from './PlayerHoverPreview';
import { ViewToggle, ViewMode } from '@/components/ui/view-toggle';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { useDiscoverPreferences } from '@/hooks/use-local-storage';
import { addToWatchlist, removeFromWatchlist } from '@/app/baseball/actions/watchlist';

// Extended player type with joined data from discover query
interface DiscoverPlayer extends Player {
  high_school_org?: { name: string } | null;
  videos?: Array<{ thumbnail_url: string | null }> | null;
}

interface DiscoverResultsProps {
  players: DiscoverPlayer[];
  watchlistIds: string[];
  coachId: string;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  onPlayerClick?: (playerId: string) => void;
  filters?: {
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
  // For smart empty state suggestions
  stateCounts?: Record<string, number>;
  totalPlayersUnfiltered?: number;
}

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'velo_desc', label: 'Velocity (High → Low)' },
  { value: 'velo_asc', label: 'Velocity (Low → High)' },
  { value: 'gpa_desc', label: 'GPA (High → Low)' },
  { value: 'grad_year_asc', label: 'Grad Year (Earliest)' },
  { value: 'grad_year_desc', label: 'Grad Year (Latest)' },
];

export function DiscoverResults({
  players,
  watchlistIds: initialWatchlistIds,
  coachId,
  totalCount,
  currentPage,
  totalPages,
  onPlayerClick,
  filters = {},
  stateCounts = {},
  totalPlayersUnfiltered = 0,
}: DiscoverResultsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Persisted preferences
  const { viewMode, sortBy, setViewMode, setSortBy } = useDiscoverPreferences();
  
  const [watchlistIds, setWatchlistIds] = useState<string[]>(initialWatchlistIds);
  const [, setLoadingIds] = useState<string[]>([]);
  
  // Compare mode state
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  
  // Hover preview state
  const [hoveredPlayer, setHoveredPlayer] = useState<PlayerCardData | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Transform database players to PlayerCardData format
  const transformedPlayers: PlayerCardData[] = players.map((p) => ({
    id: p.id,
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    position: p.primary_position || 'Player',
    secondaryPosition: p.secondary_position || undefined,
    graduationYear: p.grad_year || 0,
    highSchool: p.high_school_org?.name || p.high_school_name || '',
    city: p.city || '',
    state: p.state || '',
    avatar: p.avatar_url || undefined,
    coverImage: null,
    stats: {
      velocity: p.pitch_velo || undefined,
      exitVelo: p.exit_velo || undefined,
      sixtyYard: p.sixty_time || undefined,
      gpa: p.gpa || undefined,
      height: p.height_feet && p.height_inches
        ? `${p.height_feet}'${p.height_inches}"`
        : undefined,
      weight: p.weight_lbs || undefined,
    },
    verified: p.recruiting_activated || false,
    status: watchlistIds.includes(p.id) ? 'watchlist' : undefined,
    hasVideo: p.has_video || false,
    videoThumbnail: p.videos?.[0]?.thumbnail_url || undefined,
  }));

  // Sort players
  const sortedPlayers = useMemo(() => {
    const sorted = [...transformedPlayers];
    switch (sortBy) {
      case 'velo_desc':
        return sorted.sort((a, b) => (b.stats?.velocity || 0) - (a.stats?.velocity || 0));
      case 'velo_asc':
        return sorted.sort((a, b) => (a.stats?.velocity || 0) - (b.stats?.velocity || 0));
      case 'gpa_desc':
        return sorted.sort((a, b) => (b.stats?.gpa || 0) - (a.stats?.gpa || 0));
      case 'grad_year_asc':
        return sorted.sort((a, b) => a.graduationYear - b.graduationYear);
      case 'grad_year_desc':
        return sorted.sort((a, b) => b.graduationYear - a.graduationYear);
      default:
        return sorted;
    }
  }, [transformedPlayers, sortBy]);

  // Identify featured players (top 3 by velocity)
  const featuredIds = useMemo(() => {
    return [...transformedPlayers]
      .filter(p => p.stats?.velocity)
      .sort((a, b) => (b.stats?.velocity || 0) - (a.stats?.velocity || 0))
      .slice(0, 3)
      .map(p => p.id);
  }, [transformedPlayers]);

  const handleWatchlist = async (playerId: string) => {
    setLoadingIds((prev) => [...prev, playerId]);

    try {
      if (watchlistIds.includes(playerId)) {
        await removeFromWatchlist(coachId, playerId);
        setWatchlistIds((prev) => prev.filter((id) => id !== playerId));
      } else {
        await addToWatchlist(coachId, playerId);
        setWatchlistIds((prev) => [...prev, playerId]);
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== playerId));
    }
  };

  const handleMessage = (playerId: string) => {
    router.push(`/dashboard/messages/new?player=${playerId}`);
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', page.toString());
    router.push(`?${params.toString()}`);
  };

  // Compare mode handlers
  const toggleCompareSelection = (playerId: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      }
      if (prev.length >= 4) return prev; // Max 4 players
      return [...prev, playerId];
    });
  };

  const clearCompareSelection = () => {
    setSelectedForCompare([]);
  };

  const handleAddAllToWatchlist = async () => {
    for (const playerId of selectedForCompare) {
      if (!watchlistIds.includes(playerId)) {
        await addToWatchlist(coachId, playerId);
        setWatchlistIds(prev => [...prev, playerId]);
      }
    }
    clearCompareSelection();
  };

  // Hover preview handlers
  const handleCardHover = (player: PlayerCardData, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredPlayer(player);
    setHoverPosition({
      x: rect.right + 12,
      y: rect.top,
    });
  };

  const handleCardLeave = () => {
    setHoveredPlayer(null);
    setHoverPosition(null);
  };

  // Compute state data for map view
  const stateData = useMemo(() => {
    const data: Record<string, { name: string; count: number }> = {};
    const stateNames: Record<string, string> = {
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

    // Initialize all states
    Object.keys(stateNames).forEach(code => {
      const stateName = stateNames[code as keyof typeof stateNames];
      if (stateName) {
        data[code] = { name: stateName, count: 0 };
      }
    });

    // Count players by state
    players.forEach(player => {
      if (player.state && data[player.state]) {
        data[player.state]!.count++;
      }
    });

    return data;
  }, [players]);

  const handleStateClick = (stateCode: string) => {
    // Toggle state selection (supports multiple states)
    const currentStates = filters.states || [];
    let newStates: string[];

    if (currentStates.includes(stateCode)) {
      // Remove the state if already selected
      newStates = currentStates.filter(s => s !== stateCode);
    } else {
      // Add the state
      newStates = [...currentStates, stateCode];
    }

    const params = new URLSearchParams(searchParams.toString());
    if (newStates.length > 0) {
      params.set('state', newStates.join(','));
    } else {
      params.delete('state');
    }
    params.delete('page'); // Reset to page 1
    router.push(`?${params.toString()}`);
  };

  const handleClearStates = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('state');
    params.delete('page');
    router.push(`?${params.toString()}`);
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '');

  // Handle view mode change with persistence
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  // Handle sort change with persistence
  const handleSortChange = (value: string) => {
    setSortBy(value);
  };

  return (
    <div className="space-y-6">
      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <ActiveFiltersBar 
          filters={filters} 
          totalCount={totalCount}
        />
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {!hasActiveFilters && (
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-900">{totalCount.toLocaleString()}</span>
              {' '}players found
            </p>
          )}
          
          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm text-slate-500">Sort:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5
                         focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                         focus:outline-none bg-white cursor-pointer"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        
        <ViewToggle value={viewMode} onChange={handleViewModeChange} />
      </div>

      {/* Map View */}
      {viewMode === 'map' ? (
        <div className="relative glass-standard rounded-2xl overflow-clip p-8">
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />
          <div className="relative mb-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Player Distribution by State</h3>
            <p className="text-sm leading-relaxed text-slate-500">Click a state to filter players by location</p>
          </div>
          <div className="relative">
            <USAMap
              stateData={stateData}
              onStateClick={handleStateClick}
              onClearStates={handleClearStates}
              selectedStates={filters.states || []}
            />
          </div>
        </div>
      ) : sortedPlayers.length === 0 ? (
        /* Smart Empty State */
        <SmartEmptyState
          filters={filters}
          stateCounts={stateCounts}
          totalPlayersUnfiltered={totalPlayersUnfiltered}
        />
      ) : (
        /* Results Grid */
        <PlayerCardGrid
          players={sortedPlayers}
          variant={viewMode === 'list' ? 'compact' : 'default'}
          columns={viewMode === 'list' ? 2 : 3}
          onWatchlist={handleWatchlist}
          onMessage={handleMessage}
          onPlayerClick={onPlayerClick}
          watchlistIds={watchlistIds}
          showCheckbox={true}
          selectedIds={selectedForCompare}
          onSelect={toggleCompareSelection}
          featuredIds={featuredIds}
          emptyTitle="No players found"
          emptyMessage="Try adjusting your filters or search criteria to find more players."
          onCardHover={handleCardHover}
          onCardLeave={handleCardLeave}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && viewMode !== 'map' && sortedPlayers.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft size={16} />
            Previous
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                    pageNum === currentPage
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
            <IconChevronRight size={16} />
          </Button>
        </div>
      )}

      {/* Compare Bar */}
      {selectedForCompare.length > 0 && (
        <CompareBar
          selectedPlayers={transformedPlayers
            .filter(p => selectedForCompare.includes(p.id))
            .map(p => ({
              id: p.id,
              firstName: p.firstName,
              lastName: p.lastName,
              avatar: p.avatar,
              position: p.position,
            }))}
          onRemove={toggleCompareSelection}
          onClear={clearCompareSelection}
          onAddAllToWatchlist={handleAddAllToWatchlist}
        />
      )}

      {/* Hover Preview Panel */}
      {hoveredPlayer && hoverPosition && (
        <PlayerHoverPreview
          player={hoveredPlayer}
          position={hoverPosition}
          onWatchlist={() => handleWatchlist(hoveredPlayer.id)}
          onMessage={() => handleMessage(hoveredPlayer.id)}
          onView={() => onPlayerClick?.(hoveredPlayer.id)}
          isOnWatchlist={watchlistIds.includes(hoveredPlayer.id)}
        />
      )}
    </div>
  );
}
