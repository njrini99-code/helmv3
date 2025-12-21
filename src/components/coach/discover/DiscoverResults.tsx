'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PlayerCardData } from './PlayerCard';
import { PlayerCardGrid } from './PlayerCardGrid';
import { USAMap } from './USAMap';
import { ViewToggle, ViewMode } from '@/components/ui/view-toggle';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { addToWatchlist, removeFromWatchlist } from '@/app/baseball/actions/watchlist';

interface DiscoverResultsProps {
  players: any[];
  watchlistIds: string[];
  coachId: string;
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export function DiscoverResults({
  players,
  watchlistIds: initialWatchlistIds,
  coachId,
  totalCount,
  currentPage,
  totalPages,
}: DiscoverResultsProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [watchlistIds, setWatchlistIds] = useState<string[]>(initialWatchlistIds);
  const [, setLoadingIds] = useState<string[]>([]);

  // Transform database players to PlayerCardData format
  const transformedPlayers: PlayerCardData[] = players.map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    position: p.primary_position || 'Player',
    secondaryPosition: p.secondary_position,
    graduationYear: p.grad_year,
    highSchool: p.high_school_name || '',
    city: p.city || '',
    state: p.state || '',
    avatar: p.avatar_url,
    coverImage: null,
    stats: {
      velocity: p.pitch_velo,
      gpa: p.gpa,
      height: p.height_feet && p.height_inches 
        ? `${p.height_feet}'${p.height_inches}"` 
        : undefined,
      weight: p.weight_lbs,
    },
    verified: p.recruiting_activated,
    status: watchlistIds.includes(p.id) ? 'watchlist' : undefined,
  }));

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

  const searchParams = useSearchParams();

  const handleStateClick = (stateCode: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('state', stateCode);
    params.delete('page'); // Reset to page 1
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {totalCount > 0 ? (
              <>
                Showing <span className="font-medium text-slate-900">{(currentPage - 1) * 24 + 1}</span>
                {' - '}
                <span className="font-medium text-slate-900">
                  {Math.min(currentPage * 24, totalCount)}
                </span>
                {' of '}
                <span className="font-medium text-slate-900">{totalCount}</span>
                {' players'}
              </>
            ) : (
              'No results'
            )}
          </p>
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Map View */}
      {viewMode === 'map' ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Player Distribution by State</h3>
            <p className="text-sm text-slate-500">Click a state to filter players by location</p>
          </div>
          <USAMap stateData={stateData} onStateClick={handleStateClick} />
        </div>
      ) : (
        /* Results Grid */
        <PlayerCardGrid
          players={transformedPlayers}
          variant={viewMode === 'list' ? 'compact' : 'default'}
          columns={viewMode === 'list' ? 2 : 3}
          onWatchlist={handleWatchlist}
          onMessage={handleMessage}
          watchlistIds={watchlistIds}
          emptyTitle="No players found"
          emptyMessage="Try adjusting your filters or search criteria to find more players."
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
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
                      ? 'bg-green-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
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
    </div>
  );
}
