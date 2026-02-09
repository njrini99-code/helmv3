'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, HelpCircle, XCircle, Loader2 } from 'lucide-react';

export type BaseballRSVPStatus = 'going' | 'maybe' | 'not_going';

interface RSVPButtonsProps {
  currentStatus: BaseballRSVPStatus | null;
  onRespond: (status: BaseballRSVPStatus) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  variant?: 'full' | 'compact';
  className?: string;
}

interface RSVPOption {
  value: BaseballRSVPStatus;
  label: string;
  icon: typeof CheckCircle2;
  activeStyles: string;
  inactiveStyles: string;
}

const RSVP_OPTIONS: RSVPOption[] = [
  {
    value: 'going',
    label: 'Going',
    icon: CheckCircle2,
    activeStyles: 'bg-emerald-600 text-white shadow-lg shadow-emerald-200/50',
    inactiveStyles: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200',
  },
  {
    value: 'maybe',
    label: 'Maybe',
    icon: HelpCircle,
    activeStyles: 'bg-amber-500 text-white shadow-lg shadow-amber-200/50',
    inactiveStyles: 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200',
  },
  {
    value: 'not_going',
    label: "Can't Go",
    icon: XCircle,
    activeStyles: 'bg-rose-500 text-white shadow-lg shadow-rose-200/50',
    inactiveStyles: 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300',
  },
];

export function RSVPButtons({
  currentStatus,
  onRespond,
  disabled = false,
  variant = 'full',
  className,
}: RSVPButtonsProps) {
  const [loadingStatus, setLoadingStatus] = useState<BaseballRSVPStatus | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<BaseballRSVPStatus | null>(null);

  const displayStatus = optimisticStatus ?? currentStatus;

  const handleRespond = useCallback(
    async (status: BaseballRSVPStatus) => {
      if (disabled || loadingStatus) return;

      setOptimisticStatus(status);
      setLoadingStatus(status);

      try {
        const result = await onRespond(status);
        if (!result.success) {
          setOptimisticStatus(null);
        }
      } catch {
        setOptimisticStatus(null);
      } finally {
        setLoadingStatus(null);
      }
    },
    [disabled, loadingStatus, onRespond],
  );

  if (variant === 'compact') {
    return (
      <div className={cn('flex gap-2', className)}>
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = displayStatus === option.value;
          const isLoading = loadingStatus === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleRespond(option.value)}
              disabled={disabled || isLoading}
              className={cn(
                'flex-1 flex items-center justify-center gap-2',
                'min-h-[44px] px-3 py-2 rounded-xl border-2 border-transparent',
                'transition-all duration-200 ease-out',
                'touch-manipulation select-none',
                isActive ? cn(option.activeStyles, 'scale-[1.02]') : option.inactiveStyles,
                disabled && 'opacity-50 cursor-not-allowed',
                isLoading && 'animate-pulse',
                'active:scale-95',
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="text-xs font-semibold whitespace-nowrap">{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {RSVP_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = displayStatus === option.value;
        const isLoading = loadingStatus === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleRespond(option.value)}
            disabled={disabled || isLoading}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2',
              'min-h-[72px] p-3 rounded-2xl border-2 border-transparent',
              'transition-all duration-200 ease-out',
              'touch-manipulation select-none',
              isActive ? cn(option.activeStyles, 'scale-[1.02]') : option.inactiveStyles,
              disabled && 'opacity-50 cursor-not-allowed',
              isLoading && 'animate-pulse',
              'active:scale-95',
            )}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Icon className={cn('w-6 h-6', isActive && 'scale-110')} />
            )}
            <span className="text-sm font-bold">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
