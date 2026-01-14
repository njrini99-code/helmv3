'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { IconChevronDown } from '@/components/icons';

interface PlayerStatusBadgeProps {
  playerId: string;
  currentStatus: string | null;
  editable?: boolean; // Allow non-editable display mode
}

const statuses = [
  {
    value: 'active',
    label: 'Active',
    dotColor: 'bg-emerald-500',
    badgeStyle: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
  },
  {
    value: 'injured',
    label: 'Injured',
    dotColor: 'bg-rose-500',
    badgeStyle: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',
  },
  {
    value: 'redshirt',
    label: 'Redshirt',
    dotColor: 'bg-amber-500',
    badgeStyle: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    dotColor: 'bg-slate-400',
    badgeStyle: 'bg-slate-500/10 text-slate-600 ring-slate-500/20',
  },
];

export function PlayerStatusBadge({
  playerId,
  currentStatus,
  editable = true
}: PlayerStatusBadgeProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0]!;

  const handleStatusChange = async (newStatus: 'active' | 'injured' | 'redshirt' | 'inactive') => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(false);

    try {
      await updatePlayerStatus(playerId, newStatus);
      router.refresh();
    } catch {
      // Status update failed - UI will show original status
    } finally {
      setLoading(false);
    }
  };

  // Non-editable display mode
  if (!editable) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'text-[11px] font-medium rounded-full',
        'ring-1 ring-inset',
        currentStatusObj.badgeStyle
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full', currentStatusObj.dotColor)} />
        {currentStatusObj.label}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5',
          'text-[11px] font-medium rounded-full',
          'ring-1 ring-inset',
          'transition-all duration-150',
          'hover:ring-2 focus:outline-none focus:ring-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          currentStatusObj.badgeStyle
        )}
      >
        <span className={cn(
          'w-1.5 h-1.5 rounded-full transition-colors',
          loading ? 'animate-pulse bg-slate-400' : currentStatusObj.dotColor
        )} />
        {loading ? 'Updating...' : currentStatusObj.label}
        <IconChevronDown size={12} className={cn(
          'transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className={cn(
            'absolute left-0 mt-2 w-40 z-20',
            'bg-white rounded-xl',
            'border border-slate-200 shadow-lg shadow-slate-200/50',
            'overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}>
            <div className="py-1">
              {statuses.map(status => (
                <button
                  key={status.value}
                  onClick={() => handleStatusChange(status.value as 'active' | 'injured' | 'redshirt' | 'inactive')}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm',
                    'flex items-center gap-2',
                    'transition-colors duration-150',
                    'hover:bg-slate-50',
                    status.value === currentStatus && 'bg-slate-50'
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', status.dotColor)} />
                  <span className={cn(
                    'flex-1',
                    status.value === currentStatus ? 'font-medium text-slate-900' : 'text-slate-700'
                  )}>
                    {status.label}
                  </span>
                  {status.value === currentStatus && (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
