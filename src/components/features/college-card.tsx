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
    <PaperCard className="h-full p-5 transition-shadow hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.04)]">
      {/*
        STRETCHED LINK, not a wrapping one. The card used to be `<Link>` around
        everything, with the interest IconButton INSIDE it — a control inside a
        control: two focusable elements for one card, an ambiguous click target,
        and a screen reader announcing a button nested in a link.

        `asChild` does not apply here (the card is not button-shaped), and lifting
        the IconButton out into an absolute corner would mean guessing at pixels.
        This pattern avoids both: the link is an overlay with NO layout impact, so
        the card's geometry is unchanged by construction, the whole card stays
        clickable, and the two controls are siblings. The overlay sits inside
        PaperCard so hovering it still triggers PaperCard's own `hover:shadow-*`
        (:hover applies to ancestors; a sibling overlay would have broken it).

        Known tradeoff, inherent to stretched links: text on the card can no longer
        be selected with the mouse.
      */}
      <Link
        href={`/baseball/program/${college.id}`}
        aria-label={`View ${college.name}`}
        className="absolute inset-0 z-10 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2"
      />
      <div className="relative">
        <div className="flex items-start gap-4">
          <Avatar decorative name={college.name} size="lg" src={college.logo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-annual text-body-lg font-semibold text-text-primary">{college.name}</h3>
              {showInterestButton && (
                <IconButton
                  variant="ghost"
                  onClick={handleInterestClick}
                  disabled={loading}
                  className={cn(
                    // z-20 keeps this above the stretched-link overlay (z-10);
                    // without it the link would swallow every click on the heart.
                    'relative z-20 flex-shrink-0 p-1.5',
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
      </div>
    </PaperCard>
  );
}
