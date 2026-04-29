'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { IconUsers, IconChevronRight, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';

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
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchRequests() {
      const result = await getTeamJoinRequests();
      if (result.success && result.data) {
        setRequests(result.data);
      }
      setLoading(false);
    }
    fetchRequests();
  }, []);

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
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
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
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
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
                'bg-white text-amber-600 font-medium text-sm',
                'hover:bg-amber-50 transition-colors',
                'shadow-sm'
              )}
            >
              Review Requests
              <IconChevronRight size={16} />
            </Link>

            {dismissible && (
              <button
                onClick={handleDismiss}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <IconX size={18} />
              </button>
            )}
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
