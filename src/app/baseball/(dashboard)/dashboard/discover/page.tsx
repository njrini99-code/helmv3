'use client';

import { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { getDiscoverPlayers, getDiscoverTeams, getWatchlistIds, getStateCounts, type DiscoverFilters, type CoachType } from '@/app/baseball/actions/discover';
import { FilterPanel } from '@/components/coach/discover/FilterPanel';
import { DiscoverView } from '@/components/coach/discover/DiscoverView';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { TeamPeekPanel } from '@/components/panels/TeamPeekPanel';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { IconFilter, IconX } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import type { Player, Organization } from '@/lib/types';

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Extended types for discover
interface DiscoverPlayer extends Player {
  high_school_org?: { name: string } | null;
  videos?: Array<{ thumbnail_url: string | null }> | null;
}

interface DiscoverTeam extends Organization {
  player_count?: number;
  recruiting_active_count?: number;
  top_prospects?: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url?: string | null;
  }>;
}

function DiscoverContent() {
  const searchParams = useSearchParams();
  const { coach, loading: authLoading } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();

  // Mobile filter drawer state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // State
  const [players, setPlayers] = useState<DiscoverPlayer[]>([]);
  const [teams, setTeams] = useState<DiscoverTeam[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [playerPages, setPlayerPages] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [teamPages, setTeamPages] = useState(0);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [playersFetching, setPlayersFetching] = useState(false);
  const [teamsFetching, setTeamsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [playerStateCounts, setPlayerStateCounts] = useState<Record<string, number>>({});
  const [teamStateCounts, setTeamStateCounts] = useState<Record<string, number>>({});

  // Abort controllers for request cancellation
  const playersAbortRef = useRef<AbortController | null>(null);
  const teamsAbortRef = useRef<AbortController | null>(null);

  // Parse filters from URL
  const filters = useMemo(
    () => {
      // Support multiple states (comma-separated in URL)
      const stateParam = searchParams.get('state');
      const states = stateParam ? stateParam.split(',').filter(Boolean) : undefined;

      return {
        mode: (searchParams.get('mode') as 'players' | 'teams') || 'players',
        gradYear: searchParams.get('gradYear')
          ? parseInt(searchParams.get('gradYear')!)
          : undefined,
        position: searchParams.get('position') || undefined,
        states, // Now supports multiple states
        minVelo: searchParams.get('minVelo')
          ? parseInt(searchParams.get('minVelo')!)
          : undefined,
        maxVelo: searchParams.get('maxVelo')
          ? parseInt(searchParams.get('maxVelo')!)
          : undefined,
        minExit: searchParams.get('minExit')
          ? parseInt(searchParams.get('minExit')!)
          : undefined,
        maxExit: searchParams.get('maxExit')
          ? parseInt(searchParams.get('maxExit')!)
          : undefined,
        hasVideo: searchParams.get('hasVideo') === 'true' || undefined,
        search: searchParams.get('search') || undefined,
        teamType: searchParams.get('teamType') as
          | 'high_school'
          | 'showcase'
          | 'juco'
          | undefined,
      };
    },
    [searchParams]
  );

  const page = parseInt(searchParams.get('page') || '1');
  const perPage = 24;

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(filters.search, 300);

  // Track if this is the initial load to avoid showing loading states on filter changes
  const isInitialLoad = useRef(true);

  // Fetch players - only when in players mode
  useEffect(() => {
    // Skip if not in players mode (we'll lazy load when switching)
    if (filters.mode !== 'players') {
      return;
    }

    // Cancel any in-flight request
    if (playersAbortRef.current) {
      playersAbortRef.current.abort();
    }
    playersAbortRef.current = new AbortController();
    const signal = playersAbortRef.current.signal;

    async function fetchPlayers() {
      if (authLoading || !coach?.id) {
        if (!authLoading && !coach?.id) {
          setPlayersLoading(false);
        }
        return;
      }

      // Show loading skeleton only on initial load (no data yet)
      // Otherwise show fetching state (keeps old data visible)
      if (isInitialLoad.current || players.length === 0) {
        setPlayersLoading(true);
      } else {
        setPlayersFetching(true);
      }
      setError(null);

      try {
        // Use server action to avoid RLS recursion issues
        // Include coach info for discoverability filtering
        const serverFilters: DiscoverFilters = {
          gradYear: filters.gradYear,
          position: filters.position,
          states: filters.states,
          minVelo: filters.minVelo,
          maxVelo: filters.maxVelo,
          minExit: filters.minExit,
          maxExit: filters.maxExit,
          hasVideo: filters.hasVideo,
          search: debouncedSearch,
          page,
          perPage,
          coachId: coach.id,
          coachType: coach.coach_type as CoachType,
        };

        const result = await getDiscoverPlayers(serverFilters);

        // Check if request was aborted
        if (signal.aborted) return;

        setPlayers(result.players || []);
        setPlayerCount(result.count || 0);
        setPlayerPages(result.pages || 0);
      } catch (err) {
        // Ignore aborted requests
        if (err instanceof Error && err.name === 'AbortError') return;
        if (signal.aborted) return;

        console.error('Unexpected error fetching players:', err);
        setError('An unexpected error occurred. Please try again.');
        setPlayers([]);
        setPlayerCount(0);
        setPlayerPages(0);
      } finally {
        if (!signal.aborted) {
          setPlayersLoading(false);
          setPlayersFetching(false);
          isInitialLoad.current = false;
        }
      }
    }

    fetchPlayers();

    // Cleanup: abort on unmount or when effect re-runs
    return () => {
      if (playersAbortRef.current) {
        playersAbortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- players.length is used for loading state only; adding it would cause an infinite re-fetch loop
  }, [authLoading, coach?.id, coach?.coach_type, filters.mode, filters.gradYear, filters.position, filters.states, filters.minVelo, filters.maxVelo, filters.minExit, filters.maxExit, filters.hasVideo, debouncedSearch, page, perPage]);

  // Fetch teams - only when in teams mode
  useEffect(() => {
    // Skip if not in teams mode
    if (filters.mode !== 'teams') {
      return;
    }

    // Cancel any in-flight request
    if (teamsAbortRef.current) {
      teamsAbortRef.current.abort();
    }
    teamsAbortRef.current = new AbortController();
    const signal = teamsAbortRef.current.signal;

    async function fetchTeams() {
      if (authLoading || !coach?.id) {
        if (!authLoading && !coach?.id) {
          setTeamsLoading(false);
        }
        return;
      }

      // Show loading skeleton only on initial load
      if (teams.length === 0) {
        setTeamsLoading(true);
      } else {
        setTeamsFetching(true);
      }

      try {
        // Use server action to avoid RLS recursion issues
        // Include coach info for consistency (teams don't filter by coach type, but future-proofing)
        const serverFilters: DiscoverFilters = {
          teamType: filters.teamType,
          states: filters.states,
          search: debouncedSearch,
          page,
          perPage,
          coachId: coach.id,
          coachType: coach.coach_type as CoachType,
        };

        const result = await getDiscoverTeams(serverFilters);

        // Check if request was aborted
        if (signal.aborted) return;

        setTeams(result.teams || []);
        setTeamCount(result.count || 0);
        setTeamPages(result.pages || 0);
      } catch (err) {
        // Ignore aborted requests
        if (err instanceof Error && err.name === 'AbortError') return;
        if (signal.aborted) return;

        console.error('Unexpected error fetching teams:', err);
        setTeams([]);
        setTeamCount(0);
        setTeamPages(0);
      } finally {
        if (!signal.aborted) {
          setTeamsLoading(false);
          setTeamsFetching(false);
        }
      }
    }

    fetchTeams();

    // Cleanup: abort on unmount or when effect re-runs
    return () => {
      if (teamsAbortRef.current) {
        teamsAbortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teams.length is used for loading state only; adding it would cause an infinite re-fetch loop
  }, [authLoading, coach?.id, coach?.coach_type, filters.mode, filters.teamType, filters.states, debouncedSearch, page, perPage]);

  // Fetch watchlist
  useEffect(() => {
    async function fetchWatchlist() {
      if (!coach?.id) return;

      try {
        // Use server action to avoid RLS issues (gets coach ID from auth)
        const watchlistIds = await getWatchlistIds();
        setWatchlistIds(watchlistIds);
      } catch (err) {
        console.error('Error fetching watchlist:', err);
        setWatchlistIds([]);
      }
    }

    fetchWatchlist();
  }, [coach?.id]);

  // Fetch state counts for map visualization (all discoverable players/teams, not just current page)
  useEffect(() => {
    async function fetchStateCounts() {
      if (!coach?.id) return;

      try {
        const [playerCounts, teamCounts] = await Promise.all([
          getStateCounts('players', coach.id, coach.coach_type as CoachType),
          getStateCounts('teams', coach.id, coach.coach_type as CoachType),
        ]);
        setPlayerStateCounts(playerCounts);
        setTeamStateCounts(teamCounts);
      } catch (err) {
        console.error('Error fetching state counts:', err);
      }
    }

    fetchStateCounts();
  }, [coach?.id, coach?.coach_type]);

  // Show loading while checking auth and route permission
  if (authLoading || routeLoading) return <PageLoading />;

  // If not allowed, the hook will redirect
  if (!isAllowed) return <PageLoading />;

  if (!coach) {
    return (
      <>
        <Header title="Discover" subtitle="Coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">
              Please log in as a coach to access discovery.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Count active filters for badge display
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

  return (
    <>
      <Header
        title="Discover"
        subtitle={
          filters.mode === 'players'
            ? `Find your next recruit${playerCount > 0 ? ` \u2014 ${playerCount.toLocaleString()} players found` : ''}`
            : `Explore programs with talent${teamCount > 0 ? ` \u2014 ${teamCount.toLocaleString()} programs found` : ''}`
        }
      />

      <div className="p-6 lg:p-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar - hidden on mobile */}
          <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
            <FilterPanel currentFilters={filters} mode={filters.mode} />
          </aside>

          {/* Mobile filter button with active count badge */}
          <div className="lg:hidden">
            <Button
              variant="secondary"
              onClick={() => setMobileFiltersOpen(true)}
              className="w-full min-h-[44px]"
            >
              <IconFilter size={16} className="mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-green-600 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {/* Results - full width on mobile */}
          <div className="flex-1 min-w-0">
            <DiscoverView
              players={players}
              watchlistIds={watchlistIds}
              coachId={coach.id}
              playerCount={playerCount}
              playerPages={playerPages}
              teams={teams}
              teamCount={teamCount}
              teamPages={teamPages}
              currentPage={page}
              filters={filters}
              onPlayerClick={(id) => setSelectedPlayerId(id)}
              onTeamClick={(id) => setSelectedTeamId(id)}
              playersLoading={playersLoading}
              teamsLoading={teamsLoading}
              playersFetching={playersFetching}
              teamsFetching={teamsFetching}
              playerStateCounts={playerStateCounts}
              teamStateCounts={teamStateCounts}
            />
          </div>
        </div>

        {/* Mobile filter drawer with slide-in animation */}
        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
              onClick={() => setMobileFiltersOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-full max-w-sm bg-white shadow-xl overflow-y-auto animate-slide-in-left">
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  aria-label="Close filters"
                >
                  <IconX size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-6">
                <FilterPanel currentFilters={filters} mode={filters.mode} />
              </div>
              {/* Apply button at the bottom of filter sheet */}
              <div className="sticky bottom-0 p-4 bg-white border-t border-slate-200">
                <Button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="w-full min-h-[44px]"
                >
                  Show Results
                  {filters.mode === 'players' && playerCount > 0 && (
                    <span className="ml-1">({playerCount.toLocaleString()})</span>
                  )}
                  {filters.mode === 'teams' && teamCount > 0 && (
                    <span className="ml-1">({teamCount.toLocaleString()})</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player Peek Panel */}
      <PlayerPeekPanel
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />

      {/* Team Peek Panel */}
      <TeamPeekPanel
        teamId={selectedTeamId}
        onClose={() => setSelectedTeamId(null)}
      />
    </>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DiscoverContent />
    </Suspense>
  );
}
