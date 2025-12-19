'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PlayerCard, PlayerCardData } from './PlayerCard';
import { PlayerCardGrid, PlayerCardSkeleton } from './PlayerCardGrid';
import { ViewToggle, ViewMode } from '@/components/ui/view-toggle';
import { Button } from '@/components/ui/button';
import { IconUsers, IconChevronLeft, IconChevronRight } from '@/components/icons';
import { addToWatchlist, removeFromWatchlist } from '@/app/actions/watchlist';

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
  const [loadingIds, setLoadingIds] = useState<string[]>([]);

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
    status: watchlistIds.includes(p.id) ? 'watching' : undefined,
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

      {/* Results Grid */}
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
