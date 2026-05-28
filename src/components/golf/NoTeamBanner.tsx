'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { IconUsers, IconX } from '@/components/icons';
import { useGolfUser } from '@/contexts/golf-user-context';
import { IconButton } from '@/components/ui/button';

const DISMISS_KEY = 'golf_no_team_banner_dismissed';

/**
 * Persistent banner shown to players who have completed onboarding
 * but have not yet joined a team. Dismissible per-session.
 */
export function NoTeamBanner() {
  const { role, teamId } = useGolfUser();
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  // Only show for players without a team
  if (role !== 'player' || teamId || dismissed) return null;

  return (
    <div className="mx-4 mt-4 md:mx-6 md:mt-6 rounded-xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
        <IconUsers size={18} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-900">
          <span className="font-medium">You&apos;re not on a team yet.</span>{' '}
          Ask your coach for a join code to access team features.
        </p>
      </div>
      <Link
        href="/golf/join"
        className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
      >
        Join Team
      </Link>
      <IconButton variant="default"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, '1');
          setDismissed(true);
        }}
        className="flex-shrink-0 p-1 rounded-md text-amber-400 hover:text-amber-600 hover:bg-amber-100 transition-colors"
        aria-label="Dismiss banner"
      >
        <IconX size={16} />
      </IconButton>
    </div>
  );
}
