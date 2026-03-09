'use client';

/**
 * RSVPButtonsEnhanced - Premium touch-optimized RSVP buttons for mobile
 *
 * Features:
 * - 56px minimum touch targets (exceeds AAA accessibility)
 * - Prominent visual feedback with scale and color transitions
 * - Haptic feedback on interaction
 * - Optimistic updates with loading states
 * - Full-width layout for easy thumb access
 * - Icon + text labels for clarity
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, HelpCircle, XCircle, Loader2 } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/use-mobile-detection';

export type RSVPResponseType = 'accepted' | 'tentative' | 'declined';

interface RSVPButtonsEnhancedProps {
  currentResponse: RSVPResponseType | null;
  onRespond: (response: RSVPResponseType) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  isPending?: boolean;
  variant?: 'full' | 'compact' | 'icon-only';
  className?: string;
}

interface RSVPOption {
  value: RSVPResponseType;
  label: string;
  shortLabel: string;
  icon: typeof CheckCircle2;
  activeStyles: string;
  inactiveStyles: string;
  ringColor: string;
}

const RSVP_OPTIONS: RSVPOption[] = [
  {
    value: 'accepted',
    label: 'Going',
    shortLabel: 'Yes',
    icon: CheckCircle2,
    activeStyles: 'bg-primary-600 text-white shadow-lg shadow-primary-200/50',
    inactiveStyles: 'bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200',
    ringColor: 'ring-primary-300',
  },
  {
    value: 'tentative',
    label: 'Maybe',
    shortLabel: 'Maybe',
    icon: HelpCircle,
    activeStyles: 'bg-amber-500 text-white shadow-lg shadow-amber-200/50',
    inactiveStyles: 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200',
    ringColor: 'ring-amber-300',
  },
  {
    value: 'declined',
    label: "Can't Go",
    shortLabel: 'No',
    icon: XCircle,
    activeStyles: 'bg-rose-500 text-white shadow-lg shadow-rose-200/50',
    inactiveStyles: 'bg-rose-50 text-rose-700 hover:bg-rose-100 active:bg-rose-200',
    ringColor: 'ring-rose-300',
  },
];

export function RSVPButtonsEnhanced({
  currentResponse,
  onRespond,
  disabled = false,
  isPending = false,
  variant = 'full',
  className,
}: RSVPButtonsEnhancedProps) {
  const [loadingResponse, setLoadingResponse] = useState<RSVPResponseType | null>(null);
  const [optimisticResponse, setOptimisticResponse] = useState<RSVPResponseType | null>(null);
  const { triggerHaptic } = useHapticFeedback();

  const displayResponse = optimisticResponse ?? currentResponse;

  const handleRespond = useCallback(async (response: RSVPResponseType) => {
    if (disabled || loadingResponse) return;

    // Haptic feedback on tap
    triggerHaptic('light');

    // Optimistic update
    setOptimisticResponse(response);
    setLoadingResponse(response);

    try {
      const result = await onRespond(response);

      if (result.success) {
        triggerHaptic('success');
      } else {
        // Revert optimistic update on failure
        setOptimisticResponse(null);
        triggerHaptic('error');
      }
    } catch {
      // Revert optimistic update on error
      setOptimisticResponse(null);
      triggerHaptic('error');
    } finally {
      setLoadingResponse(null);
    }
  }, [disabled, loadingResponse, onRespond, triggerHaptic]);

  // Full variant - large buttons with icons and labels
  if (variant === 'full') {
    return (
      <div className={cn('grid grid-cols-2 md:grid-cols-3 gap-3', className)}>
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = displayResponse === option.value;
          const isLoading = loadingResponse === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleRespond(option.value)}
              disabled={disabled || isLoading}
              className={cn(
                // Base styles
                'relative flex flex-col items-center justify-center gap-2',
                'min-h-[80px] p-4 rounded-2xl border-2 border-transparent',
                'transition-all duration-200 ease-out',
                'touch-manipulation select-none',
                // Focus styles
                'focus-visible:outline-none focus-visible:ring-4',
                option.ringColor,
                // State styles
                isActive
                  ? cn(option.activeStyles, 'scale-[1.02]')
                  : option.inactiveStyles,
                // Disabled state
                disabled && 'opacity-50 cursor-not-allowed',
                // Loading state
                isLoading && 'animate-pulse',
                // Active press effect
                'active:scale-95'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <Icon className={cn('w-7 h-7', isActive && 'scale-110')} />
              )}
              <span className="text-sm font-bold">
                {option.label}
              </span>

              {/* Pending indicator */}
              {isPending && isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Compact variant - smaller buttons in a row
  if (variant === 'compact') {
    return (
      <div className={cn('flex gap-2', className)}>
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = displayResponse === option.value;
          const isLoading = loadingResponse === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleRespond(option.value)}
              disabled={disabled || isLoading}
              className={cn(
                'flex-1 flex items-center justify-center gap-2',
                'min-h-[48px] px-3 py-2 rounded-xl border-2 border-transparent',
                'transition-all duration-200 ease-out',
                'touch-manipulation select-none',
                'focus-visible:outline-none focus-visible:ring-2',
                option.ringColor,
                isActive
                  ? cn(option.activeStyles, 'scale-[1.02]')
                  : option.inactiveStyles,
                disabled && 'opacity-50 cursor-not-allowed',
                isLoading && 'animate-pulse',
                'active:scale-95'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Icon className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-xs font-semibold whitespace-nowrap">
                {option.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Icon-only variant - just icons for very compact spaces
  return (
    <div className={cn('flex gap-2', className)}>
      {RSVP_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = displayResponse === option.value;
        const isLoading = loadingResponse === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleRespond(option.value)}
            disabled={disabled || isLoading}
            className={cn(
              'flex items-center justify-center',
              'min-w-[44px] min-h-[44px] p-2 rounded-lg',
              'transition-all duration-200 ease-out',
              'touch-manipulation select-none',
              'focus-visible:outline-none focus-visible:ring-2',
              option.ringColor,
              isActive
                ? option.activeStyles
                : option.inactiveStyles,
              disabled && 'opacity-50 cursor-not-allowed',
              'active:scale-95'
            )}
            title={option.label}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Icon className="w-5 h-5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline RSVP status display with tap to change
 */
export function RSVPStatusBadge({
  status,
  onTap,
  size = 'md',
}: {
  status: RSVPResponseType | null;
  onTap?: () => void;
  size?: 'sm' | 'md';
}) {
  const getStatusConfig = (s: RSVPResponseType | null) => {
    switch (s) {
      case 'accepted':
        return { label: 'Going', icon: CheckCircle2, className: 'bg-primary-100 text-primary-700' };
      case 'tentative':
        return { label: 'Maybe', icon: HelpCircle, className: 'bg-amber-100 text-amber-700' };
      case 'declined':
        return { label: "Can't Go", icon: XCircle, className: 'bg-rose-100 text-rose-700' };
      default:
        return { label: 'RSVP', icon: HelpCircle, className: 'bg-warm-100 text-warm-500' };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-2';

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        'transition-all duration-200',
        'touch-manipulation',
        sizeClasses,
        config.className,
        onTap && 'hover:opacity-80 active:scale-95',
        !onTap && 'cursor-default'
      )}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span>{config.label}</span>
    </button>
  );
}
