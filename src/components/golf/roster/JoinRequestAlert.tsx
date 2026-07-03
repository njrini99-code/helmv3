'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { IconUsers, IconChevronRight, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';

interface JoinRequest {
  id: string;
  player?: {
    first_name: string;
    last_name: string;
  };
}

interface JoinRequestAlertProps {
  className?: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

/**
 * Alert banner for pending join requests - displays on coach dashboard
 */
export function JoinRequestAlert({ className, onDismiss, dismissible = true }: JoinRequestAlertProps) {
  const prefersReducedMotion = useReducedMotion();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchRequests = useCallback(async () => {
    const result = await getTeamJoinRequests();
    if (result.success && result.data) {
      setRequests(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();

    // Lightweight refresh: pick up new requests without a full reload.
    // getTeamJoinRequests() is auth/team-scoped server-side, so a periodic
    // re-fetch plus a focus/visibility listener keeps the banner current.
    const POLL_INTERVAL_MS = 60_000;
    const interval = setInterval(fetchRequests, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchRequests();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', fetchRequests);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', fetchRequests);
    };
  }, [fetchRequests]);

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  // Don't render if loading, dismissed, or no requests
  if (loading || dismissed || requests.length === 0) {
    return null;
  }

  const playerNames = requests
    .slice(0, 3)
    .map(r => r.player ? `${r.player.first_name} ${r.player.last_name}` : 'A player')
    .join(', ');

  const extraCount = requests.length > 3 ? requests.length - 3 : 0;

  return (
    <AnimatePresence>
      <m.div
        initial={prefersReducedMotion ? false : ({ opacity: 0, y: -10, scale: 0.98 })}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        className={cn(
          'relative overflow-hidden rounded-2xl mb-6',
          'bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500',
          'shadow-lg shadow-amber-500/20',
          className
        )}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />

        <div className="relative flex items-center justify-between p-4 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 glass-prominent rounded-xl flex items-center justify-center flex-shrink-0">
              <IconUsers size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-medium text-white text-base">
                {requests.length} Player{requests.length > 1 ? 's' : ''} Waiting to Join
              </h3>
              <p className="text-white/80 text-sm">
                {playerNames}{extraCount > 0 ? ` and ${extraCount} more` : ''} requested to join your team
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/golf/dashboard/roster"
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-cream-50 text-amber-600 font-medium text-sm',
                'hover:bg-amber-50 transition-colors',
                'shadow-sm'
              )}
            >
              Review Requests
              <IconChevronRight size={16} />
            </Link>

            {dismissible && (
              <IconButton variant="default"
                onClick={handleDismiss}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-cream-50/10 transition-colors"
                aria-label="Dismiss"
              >
                <IconX size={18} />
              </IconButton>
            )}
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
