'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { FilterPanel } from '@/components/coach/discover/FilterPanel';
import { DiscoverResults } from '@/components/coach/discover/DiscoverResults';
import { PlayerPeekPanel } from '@/components/panels/PlayerPeekPanel';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonDiscover } from '@/components/ui/skeleton-loader';
import { useAuth } from '@/hooks/use-auth';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import { getPlayersOptimized } from '@/lib/queries/performance';
import type { Player } from '@/lib/types';

function DiscoverContent() {
  const searchParams = useSearchParams();
  const { coach, loading: authLoading } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();

  const [players, setPlayers] = useState<Player[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Parse filters from URL
  const filters = useMemo(() => ({
    gradYear: searchParams.get('gradYear') ? parseInt(searchParams.get('gradYear')!) : undefined,
    position: searchParams.get('position') || undefined,
    state: searchParams.get('state') || undefined,
    minVelo: searchParams.get('minVelo') ? parseInt(searchParams.get('minVelo')!) : undefined,
    maxVelo: searchParams.get('maxVelo') ? parseInt(searchParams.get('maxVelo')!) : undefined,
    minExit: searchParams.get('minExit') ? parseInt(searchParams.get('minExit')!) : undefined,
    maxExit: searchParams.get('maxExit') ? parseInt(searchParams.get('maxExit')!) : undefined,
    hasVideo: searchParams.get('hasVideo') === 'true',
    search: searchParams.get('search') || undefined,
  }), [searchParams]);

  const page = parseInt(searchParams.get('page') || '1');
  const perPage = 24;

  // Fetch players
  useEffect(() => {
    async function fetchPlayers() {
      if (authLoading) return;
      if (!coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const offset = (page - 1) * perPage;

      // Build query
      let query = supabase
        .from('players')
        .select(`
          *,
          player_videos(id, thumbnail_url, is_primary)
        `, { count: 'exact' })
        .eq('recruiting_activated', true);

      // Apply filters
      if (filters.gradYear) {
        query = query.eq('grad_year', filters.gradYear);
      }
      if (filters.position) {
        query = query.or(`primary_position.eq.${filters.position},secondary_position.eq.${filters.position}`);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }
      if (filters.minVelo) {
        query = query.gte('pitch_velo', filters.minVelo);
      }
      if (filters.maxVelo) {
        query = query.lte('pitch_velo', filters.maxVelo);
      }
      if (filters.minExit) {
        query = query.gte('exit_velo', filters.minExit);
      }
      if (filters.maxExit) {
        query = query.lte('exit_velo', filters.maxExit);
      }
      if (filters.hasVideo) {
        query = query.eq('has_video', true);
      }
      if (filters.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,high_school_name.ilike.%${filters.search}%`);
      }

      // Execute query
      const { data: playersData, count } = await query
        .order('updated_at', { ascending: false })
        .range(offset, offset + perPage - 1);

      // Get watchlist
      const { data: watchlist } = await supabase
        .from('watchlists')
        .select('player_id')
        .eq('coach_id', coach.id);

      setPlayers(playersData || []);
      setTotalCount(count || 0);
      setWatchlistIds(watchlist?.map(w => w.player_id) || []);
      setLoading(false);
    }

    fetchPlayers();
  }, [authLoading, coach?.id, filters, page]);

  const totalPages = Math.ceil(totalCount / perPage);

  // Show loading while checking auth and route permission
  if (authLoading || routeLoading) return <PageLoading />;

  // If not allowed, the hook will redirect, show loading
  if (!isAllowed) return <PageLoading />;

  if (!coach) {
    return (
      <>
        <Header title="Discover Players" subtitle="Coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Please log in as a coach to access player discovery.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Discover Players"
        subtitle="Search and filter to find your next recruit"
      />

      <div className="p-6">
        <div className="flex gap-6">
          {/* Filters Sidebar */}
          <div className="w-64 flex-shrink-0">
            <FilterPanel currentFilters={filters} />
          </div>

          {/* Results */}
          <div className="flex-1">
            {loading ? (
              <SkeletonDiscover />
            ) : (
              <DiscoverResults
                players={players}
                watchlistIds={watchlistIds}
                coachId={coach.id}
                totalCount={totalCount}
                currentPage={page}
                totalPages={totalPages}
                onPlayerClick={(id) => setSelectedPlayerId(id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Player Peek Panel */}
      <PlayerPeekPanel
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
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
