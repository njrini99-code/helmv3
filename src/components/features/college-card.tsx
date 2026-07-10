'use client';

// =============================================================================
// CollegeCard — the player-facing "college search result" card, migrated onto
// "The Living Annual" kit (Lane 3 · THE PASSPORT, green ink; used only by
// CollegesClient). PRESENTATION ONLY: `addToInterests`/`removeFromInterests`,
// the optimistic-update/revert flow, and the loading guard are unchanged.
//
// The legacy "heart" toggle rendered red (an off-palette color for what is
// really just this player's own interest marker, not an error/warning) — it
// now reads in lane ink: green when interested, quiet graphite otherwise.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { IconMapPin, IconHeart, IconHeartFilled } from '@/components/icons';
import { addToInterests, removeFromInterests } from '@/app/baseball/actions/interests';
import { PaperCard, PositionChip, Eyebrow } from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';
import type { College } from '@/lib/types';

interface CollegeCardProps {
  college: College;
  isInterested?: boolean;
  onInterestToggle?: (collegeId: string, isInterested: boolean) => void;
  showInterestButton?: boolean;
}

export function CollegeCard({
  college,
  isInterested = false,
  onInterestToggle,
  showInterestButton = true
}: CollegeCardProps) {
  const [interested, setInterested] = useState(isInterested);
  const [loading, setLoading] = useState(false);

  const handleInterestClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    const newState = !interested;

    // Optimistic update
    setInterested(newState);
    onInterestToggle?.(college.id, newState);

    try {
      if (newState) {
        const result = await addToInterests(college.id);
        if (!result.success) {
          throw new Error('Failed to add interest');
        }
      } else {
        const result = await removeFromInterests(college.id);
        if (!result.success) {
          throw new Error('Failed to remove interest');
        }
      }
    } catch (error) {
      // Revert on error
      setInterested(!newState);
      onInterestToggle?.(college.id, !newState);
      console.error('Failed to update interest:', error);
    }

    setLoading(false);
  };

  return (
    <Link href={`/baseball/program/${college.id}`} className="block h-full">
      <PaperCard className="h-full p-5 transition-shadow hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-4">
          <Avatar name={college.name} size="lg" src={college.logo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-annual text-body-lg font-semibold text-text-primary">{college.name}</h3>
              {showInterestButton && (
                <IconButton
                  variant="ghost"
                  onClick={handleInterestClick}
                  disabled={loading}
                  className={cn(
                    'flex-shrink-0 p-1.5',
                    interested ? 'text-grade-plus' : 'text-text-tertiary hover:text-grade-plus',
                    loading && 'cursor-not-allowed opacity-50',
                  )}
                  aria-label={interested ? 'Remove from interests' : 'Add to interests'}
                >
                  {interested ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
                </IconButton>
              )}
            </div>
            <Eyebrow ink="muted" className="mt-1 inline-flex items-center gap-1">
              <IconMapPin size={13} />
              {college.location_city}, {college.location_state}
            </Eyebrow>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {college.division && <PositionChip label={college.division} ink="team" size="sm" />}
              {college.conference && (
                <PositionChip label={college.conference} ink="neutral" size="sm" className="max-w-[120px] truncate" />
              )}
            </div>
          </div>
        </div>
      </PaperCard>
    </Link>
  );
}
