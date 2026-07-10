'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FocusAreaCard } from './FocusAreaCard';
import { EmptyState } from '@/components/ui/empty-state';
import { getPlayerFocusAreas } from '@/app/golf/actions/insights';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';

interface PlayerFocusAreasProps {
  playerId: string;
}

export function PlayerFocusAreas({ playerId }: PlayerFocusAreasProps) {
  const router = useRouter();
  const [focusAreas, setFocusAreas] = useState<PlayerFocusArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFocusAreas = async () => {
      setLoading(true);
      setError(null);

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
      {focusAreas.map((area) => (
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
    </div>
  );
}
