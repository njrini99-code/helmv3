'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/sonner';
import { IconChevronDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';

interface PlayerStatusBadgeProps {
  playerId: string;
  currentStatus: string | null;
  editable?: boolean; // Allow non-editable display mode
}

// B4/F007: golf_team_members.status only allows pending/active/inactive/removed
// — 'injured' and 'redshirt' were never valid write values, so the picker
// offers Active + Inactive only.
const statuses: Array<{
  value: 'active' | 'inactive';
  label: string;
  dotColor: string;
  tone: BadgeTone;
  /** Original alpha tint + ring recipe, layered over the Badge shell. */
  badgeStyle: string;
}> = [
  {
    value: 'active',
    label: 'Active',
    dotColor: 'bg-primary-500',
    tone: 'primary',
    badgeStyle: 'bg-primary-500/10 text-primary-700 ring-primary-500/20',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    dotColor: 'bg-warm-400',
    tone: 'warm',
    badgeStyle: 'bg-warm-500/10 text-warm-600 ring-warm-500/20',
  },
];

export function PlayerStatusBadge({
  playerId,
  currentStatus,
  editable = true
}: PlayerStatusBadgeProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0]!;

  const handleStatusChange = async (newStatus: 'active' | 'inactive') => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(false);

    const statusLabel = statuses.find(s => s.value === newStatus)?.label || newStatus;

    try {
      const result = await updatePlayerStatus(playerId, newStatus);
      if (result.success) {
        addToast({ type: 'success', title: 'Status updated', description: `Player status changed to ${statusLabel}.` });
        router.refresh();
      } else {
        addToast({ type: 'error', title: 'Failed to update status', description: result.error || 'Please try again.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to update status', description: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Non-editable display mode
  if (!editable) {
    return (
      <Badge
        tone={currentStatusObj.tone}
        size="none"
        className={cn(
          'gap-2 px-2 py-0.5 text-xs',
          // Original used an inset ring (not a border) + alpha tint; preserve.
          'border-transparent ring-1 ring-inset',
          currentStatusObj.badgeStyle
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', currentStatusObj.dotColor)} />
        {currentStatusObj.label}
      </Badge>
    );
  }

  return (
    <div className="relative">
      <Button variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-2 px-2 py-0.5',
          'text-xs font-medium rounded-full',
          'ring-1 ring-inset',
          'transition-all duration-150',
          'hover:ring-2 focus:outline-none focus:ring-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          currentStatusObj.badgeStyle
        )}
      >
        <span className={cn(
          'w-1.5 h-1.5 rounded-full transition-colors',
          loading ? 'animate-pulse bg-warm-400' : currentStatusObj.dotColor
        )} />
        {loading ? 'Updating...' : currentStatusObj.label}
        <IconChevronDown size={12} className={cn(
          'transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </Button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default border-none bg-transparent"
            aria-label="Close"
            onClick={() => setIsOpen(false)}
          />
          <div className={cn(
            'absolute left-0 mt-2 w-40 z-50',
            'bg-white rounded-2xl',
            'border border-warm-200 shadow-lg shadow-warm-200/50',
            'overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}>
            <div className="py-1">
              {statuses.map(status => (
                <Button variant="ghost"
                  key={status.value}
                  onClick={() => handleStatusChange(status.value)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm',
                    'flex items-center gap-2',
                    'transition-colors duration-150',
                    'hover:bg-warm-50 active:bg-warm-100',
                    status.value === currentStatus && 'bg-warm-50'
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', status.dotColor)} />
                  <span className={cn(
                    'flex-1',
                    status.value === currentStatus ? 'font-medium text-warm-900' : 'text-warm-700'
                  )}>
                    {status.label}
                  </span>
                  {status.value === currentStatus && (
                    <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
