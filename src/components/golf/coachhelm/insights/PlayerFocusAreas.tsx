'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FocusAreaCard } from './FocusAreaCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { getPlayerFocusAreas } from '@/app/golf/actions/insights';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';

interface PlayerFocusAreasProps {
  playerId: string;
}

// Bug #75: `getPlayerFocusAreas` has no server-side cap — every `active` row
// ever created for a player renders here, so a player who accumulated many
// focus areas over a season (each never archived because #58 left "no
// target" rows with nothing actionable) turned this into a multi-thousand-
// pixel wall of near-identical cards. Cap what renders up front; a coach/
// player with more than this can see the rest in My Development (the same
// destination every card's `onClick` already sends them to).
const VISIBLE_CAP = 3;

export function PlayerFocusAreas({ playerId }: PlayerFocusAreasProps) {
  const router = useRouter();
  const [focusAreas, setFocusAreas] = useState<PlayerFocusArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const loadFocusAreas = async () => {
      setLoading(true);
      setError(null);
      setShowAll(false);

      const result = await getPlayerFocusAreas(playerId);

      if (result.success) {
        setFocusAreas(result.focus_areas as PlayerFocusArea[]);
      } else {
        setError(result.error || 'Failed to load focus areas');
      }

      setLoading(false);
    };

    loadFocusAreas();
  }, [playerId]);

  const visibleAreas = useMemo(
    () => (showAll ? focusAreas : focusAreas.slice(0, VISIBLE_CAP)),
    [focusAreas, showAll],
  );
  const hiddenCount = focusAreas.length - visibleAreas.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (focusAreas.length === 0) {
    return (
      <EmptyState
        variant="compact"
        title="No Focus Areas Yet"
        description="Your coach will set personalized focus areas based on your performance."
      />
    );
  }

  return (
    <div className="space-y-3">
      {visibleAreas.map((area) => (
        // conn-golf-player Finding 2: these cards were a dead-end duplicate of
        // My Development (no onClick at all). My Development is the SAME
        // golf_player_focus_areas row (id-for-id) rendered with the full
        // detail + actions (progress, complete, drills) — send the player
        // there instead of leaving a plain, unclickable card.
        <FocusAreaCard
          key={area.id}
          focusArea={area}
          onClick={() => router.push('/golf/dashboard/my-development')}
        />
      ))}
      {hiddenCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more focus area{hiddenCount !== 1 ? 's' : ''}
        </Button>
      ) : null}
    </div>
  );
}
