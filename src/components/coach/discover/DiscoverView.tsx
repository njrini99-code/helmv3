'use client';

import { useState, useMemo, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Player, Organization } from '@/lib/types';
import { DiscoverToggle, type DiscoverMode } from './DiscoverToggle';
import { PlayerCardData } from './PlayerCard';
import { PlayerCardGrid } from './PlayerCardGrid';
import { TeamCardData, TeamCardGrid } from './TeamCard';
import { USAMap } from './USAMap';
import { ActiveFiltersBar } from './ActiveFiltersBar';
import { CompareBar } from './CompareBar';
import { SmartEmptyState } from './SmartEmptyState';
import { PlayerHoverPreview } from './PlayerHoverPreview';
import { ViewToggle, ViewMode } from '@/components/ui/view-toggle';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiscoverPreferences } from '@/hooks/use-local-storage';
import {
  addToWatchlist,
  removeFromWatchlist,
} from '@/app/baseball/actions/watchlist';

// Extended player type with joined data
interface DiscoverPlayer extends Player {
  high_school_org?: { name: string } | null;
  videos?: Array<{ thumbnail_url: string | null }> | null;
}

// Team type for discovery
interface DiscoverTeam extends Organization {
  player_count?: number;
  recruiting_active_count?: number;
  head_coach_name?: string | null;
  top_prospects?: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url?: string | null;
  }>;
}

interface DiscoverViewProps {
  // Player data
  players: DiscoverPlayer[];
  watchlistIds: string[];
  coachId: string;
  playerCount: number;
  playerPages: number;

  // Team data
  teams: DiscoverTeam[];
  teamCount: number;
  teamPages: number;

  // Current state
  currentPage: number;
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
    teamType?: string;
  };

  // Callbacks
  onPlayerClick?: (playerId: string) => void;
  onTeamClick?: (teamId: string) => void;

  // Loading states
  playersLoading?: boolean;
  teamsLoading?: boolean;
  playersFetching?: boolean;
  teamsFetching?: boolean;

  // State counts for map (from server - all discoverable, not just current page)
  playerStateCounts?: Record<string, number>;
  teamStateCounts?: Record<string, number>;
}

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently Active' },
  { value: 'velo_desc', label: 'Velocity (High → Low)' },
  { value: 'velo_asc', label: 'Velocity (Low → High)' },
  { value: 'exit_velo_desc', label: 'Exit Velo (High → Low)' },
  { value: 'gpa_desc', label: 'GPA (High → Low)' },
  { value: 'grad_year_asc', label: 'Grad Year (Earliest)' },
  { value: 'grad_year_desc', label: 'Grad Year (Latest)' },
];

export function DiscoverView({
  players,
  watchlistIds: initialWatchlistIds,
  coachId,
  playerCount,
  playerPages,
  teams,
  teamCount,
  teamPages,
  currentPage,
  filters = {},
  onPlayerClick,
  onTeamClick,
  playersLoading,
  teamsLoading,
  playersFetching,
  teamsFetching,
  playerStateCounts = {},
  teamStateCounts = {},
}: DiscoverViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Mode: players or teams
  const [mode, setMode] = useState<DiscoverMode>(
    (searchParams.get('mode') as DiscoverMode) || 'players'
  );

  // Persisted preferences
  const { viewMode, sortBy, setViewMode, setSortBy } = useDiscoverPreferences();

  // Local state
  const [watchlistIds, setWatchlistIds] = useState<string[]>(
    initialWatchlistIds
  );
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [hoveredPlayer, setHoveredPlayer] = useState<PlayerCardData | null>(
    null
  );
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Transform players to card data
  const transformedPlayers: PlayerCardData[] = useMemo(
    () =>
      players.map((p) => ({
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
          height:
            p.height_feet && p.height_inches
              ? `${p.height_feet}'${p.height_inches}"`
              : undefined,
          weight: p.weight_lbs || undefined,
        },
        verified: p.recruiting_activated || false,
        status: watchlistIds.includes(p.id) ? 'watchlist' : undefined,
        hasVideo: p.has_video || false,
        videoThumbnail: p.videos?.[0]?.thumbnail_url || undefined,
      })),
    [players, watchlistIds]
  );

  // Sort players
  const sortedPlayers = useMemo(() => {
    const sorted = [...transformedPlayers];
    switch (sortBy) {
      case 'exit_velo_desc':
        return sorted.sort(
          (a, b) => (b.stats?.exitVelo || 0) - (a.stats?.exitVelo || 0)
        );
      case 'velo_desc':
        return sorted.sort(
          (a, b) => (b.stats?.velocity || 0) - (a.stats?.velocity || 0)
        );
      case 'velo_asc':
        return sorted.sort(
          (a, b) => (a.stats?.velocity || 0) - (b.stats?.velocity || 0)
        );
      case 'gpa_desc':
        return sorted.sort(
          (a, b) => (b.stats?.gpa || 0) - (a.stats?.gpa || 0)
        );
      case 'grad_year_asc':
        return sorted.sort((a, b) => a.graduationYear - b.graduationYear);
      case 'grad_year_desc':
        return sorted.sort((a, b) => b.graduationYear - a.graduationYear);
      default:
        return sorted;
    }
  }, [transformedPlayers, sortBy]);

  // Featured player IDs
  const featuredIds = useMemo(() => {
    return [...transformedPlayers]
      .filter((p) => p.stats?.velocity)
      .sort((a, b) => (b.stats?.velocity || 0) - (a.stats?.velocity || 0))
      .slice(0, 3)
      .map((p) => p.id);
  }, [transformedPlayers]);

  // Transform teams to card data
  const transformedTeams: TeamCardData[] = useMemo(
    () =>
      teams.map((t) => ({
        id: t.id,
        name: t.name || 'Unknown Team',
        type: (t.type as 'high_school' | 'showcase' | 'travel_ball' | 'juco') || 'high_school',
        city: t.location_city || '',
        state: t.location_state || '',
        logoUrl: t.logo_url,
        primaryColor: t.primary_color || undefined,
        playerCount: t.player_count || 0,
        recruitingActiveCount: t.recruiting_active_count || 0,
        headCoachName: t.head_coach_name || null,
        topProspects: t.top_prospects?.map((p) => ({
          id: p.id,
          name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown',
          position: p.primary_position || '—',
          gradYear: p.grad_year || 0,
          avatarUrl: p.avatar_url || undefined,
        })),
      })),
    [teams]
  );

  // Use server-fetched state counts for map (all discoverable, not just current page)
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

    // Use server-fetched state counts (all discoverable players/teams, not just current page)
    const serverCounts = mode === 'players' ? playerStateCounts : teamStateCounts;

    // Initialize all states with server-fetched counts
    Object.entries(stateNames).forEach(([code, name]) => {
      data[code] = { name, count: serverCounts[code] || 0 };
    });

    return data;
  }, [mode, playerStateCounts, teamStateCounts]);

  // URL update handlers
  const updateURL = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleStateClick = useCallback(
    (stateCode: string) => {
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

      // Switch to grid view first for smooth transition (only on first selection)
      const shouldSwitchView = viewMode === 'map' && newStates.length === 1 && !currentStates.includes(stateCode);
      if (shouldSwitchView) {
        setViewMode('grid');
      }

      // Update URL with transition to prevent blocking
      startTransition(() => {
        updateURL({
          state: newStates.length > 0 ? newStates.join(',') : null,
          page: null,
        });
      });
    },
    [updateURL, viewMode, setViewMode, filters.states, startTransition]
  );

  const handleClearStates = useCallback(() => {
    startTransition(() => {
      updateURL({ state: null, page: null });
    });
  }, [updateURL, startTransition]);

  const handleModeChange = useCallback(
    (newMode: DiscoverMode) => {
      // Immediately update local state for instant UI feedback
      setMode(newMode);
      // Use transition for the URL update to prevent blocking
      startTransition(() => {
        updateURL({ mode: newMode, page: null });
      });
    },
    [updateURL]
  );

  const handleViewModeChange = useCallback(
    (newViewMode: ViewMode) => {
      setViewMode(newViewMode);
    },
    [setViewMode]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      setSortBy(value);
    },
    [setSortBy]
  );

  const goToPage = useCallback(
    (page: number) => {
      startTransition(() => {
        updateURL({ page: page.toString() });
      });
    },
    [updateURL, startTransition]
  );

  // Watchlist handlers
  const handleWatchlist = async (playerId: string) => {
    try {
      // The server actions return { success: false } (no throw) when a
      // add/remove is rejected. Only flip the star when it actually persisted,
      // so the UI can't claim a player is (un)watchlisted when they aren't.
      if (watchlistIds.includes(playerId)) {
        const result = await removeFromWatchlist(coachId, playerId);
        if (result.success) {
          setWatchlistIds((prev) => prev.filter((id) => id !== playerId));
        }
      } else {
        const result = await addToWatchlist(coachId, playerId);
        if (result.success) {
          setWatchlistIds((prev) => [...prev, playerId]);
        }
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
    }
  };

  const handleMessage = (playerId: string) => {
    router.push(`/baseball/dashboard/messages?player=${playerId}`);
  };

  // Compare mode handlers
  const toggleCompareSelection = (playerId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, playerId];
    });
  };

  const clearCompareSelection = () => {
    setSelectedForCompare([]);
  };

  const handleAddAllToWatchlist = async () => {
    for (const playerId of selectedForCompare) {
      if (!watchlistIds.includes(playerId)) {
        const result = await addToWatchlist(coachId, playerId);
        if (result.success) {
          setWatchlistIds((prev) => [...prev, playerId]);
        }
      }
    }
    clearCompareSelection();
  };

  // Hover preview handlers
  const handleCardHover = (player: PlayerCardData, event: React.MouseEvent) => {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
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

  // Team handlers
  const handleViewTeamProfile = (teamId: string) => {
    router.push(`/baseball/program/${teamId}`);
  };

  // Check for active filters
  const hasActiveFilters = Object.values(filters).some(
    (v) => v !== undefined && v !== ''
  );

  // Determine current count and pages based on mode
  const totalCount = mode === 'players' ? playerCount : teamCount;
  const totalPages = mode === 'players' ? playerPages : teamPages;

  return (
    <div className="space-y-6">
      {/* Top Bar: Mode Toggle + View Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left: Mode Toggle */}
        <DiscoverToggle
          mode={mode}
          onChange={handleModeChange}
          playerCount={playerCount}
          teamCount={teamCount}
        />

        {/* Right: View Controls */}
        <div className="flex items-center gap-4">
          {/* Sort (players only) */}
          {mode === 'players' && (
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-warm-500">
                Sort:
              </label>
              <Select
                options={SORT_OPTIONS}
                value={sortBy}
                onChange={handleSortChange}
                className="text-sm min-h-0 px-3 py-1.5"
              />
            </div>
          )}

          {/* View Toggle */}
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />
        </div>
      </div>

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <ActiveFiltersBar filters={filters} totalCount={totalCount} />
      )}

      {/* Results Count (when no filters) */}
      {!hasActiveFilters && (
        <p className="text-sm text-warm-500">
          <span className="font-semibold text-warm-900">
            {totalCount.toLocaleString()}
          </span>{' '}
          {mode === 'players' ? 'players' : 'teams'} found
        </p>
      )}

      {/* Main Content */}
      <div className={cn(
        "min-h-[400px] relative transition-opacity duration-200 ease-out",
        isPending && "opacity-50"
      )}>
        <AnimatePresence mode="wait" initial={false}>
          {viewMode === 'map' ? (
            /* Map View */
            <motion.div
              key="map-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
            >
            <div className="relative glass-standard rounded-2xl overflow-clip p-8">
              {/* Decorative top highlight */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />

              <div className="relative mb-4">
                <h3 className="text-lg font-semibold text-warm-900 mb-2">
                  {mode === 'players'
                    ? 'Player Distribution by State'
                    : 'Team Distribution by State'}
                </h3>
                <p className="text-sm leading-relaxed text-warm-500">
                  Click a state to filter {mode} by location
                </p>
              </div>

              <div className="relative">
                <USAMap
                  stateData={stateData}
                  onStateClick={handleStateClick}
                  onClearStates={handleClearStates}
                  selectedStates={filters.states || []}
                  mode={mode}
                />
              </div>

              {/* Quick tip when state(s) selected */}
              {filters.states && filters.states.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 rounded-xl bg-primary-50 border border-primary-200"
                >
                  <p className="text-sm text-primary-800">
                    <span className="font-semibold">
                      {filters.states.length === 1 && filters.states[0]
                        ? stateData[filters.states[0]]?.name
                        : `${filters.states.length} states`}
                    </span>{' '}
                    selected —{' '}
                    <Button variant="ghost"
                      onClick={() => setViewMode('grid')}
                      className="underline hover:no-underline font-medium"
                    >
                      View {mode === 'players' ? 'players' : 'teams'} from {filters.states.length === 1 ? 'this state' : 'these states'} →
                    </Button>
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : mode === 'players' ? (
          /* Players Grid/List View */
          <motion.div
            key="players-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
          >
            {playersLoading ? (
              <PlayerCardGrid
                players={[]}
                variant={viewMode === 'list' ? 'compact' : 'default'}
                columns={viewMode === 'list' ? 2 : 3}
                onWatchlist={() => {}}
                onMessage={() => {}}
                watchlistIds={[]}
                loading={true}
              />
            ) : sortedPlayers.length === 0 ? (
              <SmartEmptyState
                filters={filters}
                stateCounts={{}}
                totalPlayersUnfiltered={playerCount}
              />
            ) : (
              <div className={cn(
                'transition-opacity duration-200',
                playersFetching && 'opacity-50 pointer-events-none'
              )}>
                {/* Fetching indicator */}
                {playersFetching && (
                  <div className="space-y-3 mb-4">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                )}
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
                  emptyMessage="Try adjusting your filters or search criteria."
                  onCardHover={handleCardHover}
                  onCardLeave={handleCardLeave}
                />
              </div>
            )}
          </motion.div>
        ) : (
          /* Teams Grid View */
          <motion.div
            key="teams-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.4, 0, 0.2, 1] })}
          >
            <div className={cn(
              'transition-opacity duration-200',
              teamsFetching && 'opacity-50 pointer-events-none'
            )}>
              {/* Fetching indicator */}
              {teamsFetching && (
                <div className="space-y-3 mb-4">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              )}
              <TeamCardGrid
                teams={transformedTeams}
                onViewProfile={handleViewTeamProfile}
                onTeamClick={onTeamClick}
                loading={teamsLoading}
                emptyMessage="Try adjusting your filters to find more teams."
              />
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && viewMode !== 'map' && (
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
                <Button variant="primary"
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                    pageNum === currentPage
                      ? 'bg-primary-600 text-white'
                      : 'text-warm-600 hover:bg-warm-100 active:bg-warm-200'
                  )}
                >
                  {pageNum}
                </Button>
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

      {/* Compare Bar (players only) */}
      {mode === 'players' && selectedForCompare.length > 0 && (
        <CompareBar
          selectedPlayers={transformedPlayers
            .filter((p) => selectedForCompare.includes(p.id))
            .map((p) => ({
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
