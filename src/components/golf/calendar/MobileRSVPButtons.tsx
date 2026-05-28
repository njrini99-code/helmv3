'use client';

/**
 * MobileRSVPButtons - Touch-optimized RSVP buttons for mobile
 *
 * Features:
 * - 48px minimum touch targets (AAA accessibility)
 * - Haptic feedback on interaction
 * - Visual feedback with scale and color transitions
 * - Pending state indicator for offline support
 * - Swipe gesture support (optional)
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, HelpCircle, XCircle, Loader2, Lock } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/use-mobile-detection';
import { Button } from '@/components/ui/button';

export type RSVPResponse = 'accepted' | 'tentative' | 'declined';

interface MobileRSVPButtonsProps {
  currentResponse: RSVPResponse | null;
  onRespond: (response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  isPending?: boolean; // Shows when RSVP is waiting to sync
  /** Event RSVP deadline (ISO). Buttons lock once it has passed. */
  rsvpDeadline?: string | null;
  /** Optional explicit lock flag; if omitted we derive from rsvpDeadline. */
  isLocked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  className?: string;
}

interface RSVPOption {
  value: RSVPResponse;
  label: string;
  shortLabel: string;
  icon: typeof CheckCircle2;
  activeClass: string;
  inactiveClass: string;
  hoverClass: string;
}

const RSVP_OPTIONS: RSVPOption[] = [
  {
    value: 'accepted',
    label: 'Going',
    shortLabel: 'Going',
    icon: CheckCircle2,
    activeClass: 'bg-primary-600 text-white shadow-lg shadow-primary-200',
    inactiveClass: 'bg-primary-50 text-primary-700 border-primary-200',
    hoverClass: 'hover:bg-primary-100 active:bg-primary-200',
  },
  {
    value: 'tentative',
    label: 'Maybe',
    shortLabel: 'Maybe',
    icon: HelpCircle,
    activeClass: 'bg-amber-500 text-white shadow-lg shadow-amber-200',
    inactiveClass: 'bg-amber-50 text-amber-700 border-amber-200',
    hoverClass: 'hover:bg-amber-100 active:bg-amber-200',
  },
  {
    value: 'declined',
    label: "Can't Go",
    shortLabel: "Can't",
    icon: XCircle,
    activeClass: 'bg-rose-500 text-white shadow-lg shadow-rose-200',
    inactiveClass: 'bg-rose-50 text-rose-700 border-rose-200',
    hoverClass: 'hover:bg-rose-100 active:bg-rose-200',
  },
];

const sizeClasses = {
  sm: {
    button: 'min-h-[44px] min-w-[44px] px-3 py-2',
    icon: 'w-4 h-4',
    text: 'text-xs',
    gap: 'gap-1',
  },
  md: {
    button: 'min-h-[48px] min-w-[48px] px-4 py-2.5',
    icon: 'w-5 h-5',
    text: 'text-sm',
    gap: 'gap-2',
  },
  lg: {
    button: 'min-h-[56px] min-w-[56px] px-5 py-3',
    icon: 'w-6 h-6',
    text: 'text-base',
    gap: 'gap-2',
  },
};

export function MobileRSVPButtons({
  currentResponse,
  onRespond,
  disabled = false,
  isPending = false,
  rsvpDeadline,
  isLocked,
  size = 'md',
  layout = 'horizontal',
  showLabels = true,
  className,
}: MobileRSVPButtonsProps) {
  const [loadingResponse, setLoadingResponse] = useState<RSVPResponse | null>(null);
  const [optimisticResponse, setOptimisticResponse] = useState<RSVPResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { triggerHaptic } = useHapticFeedback();

  const sizeConfig = sizeClasses[size];
  const displayResponse = optimisticResponse ?? currentResponse;

  const lockedByDeadline =
    isLocked ??
    (rsvpDeadline ? new Date(rsvpDeadline).getTime() < Date.now() : false);
  const isInteractionDisabled = disabled || lockedByDeadline;

  const handleRespond = useCallback(async (response: RSVPResponse) => {
    if (isInteractionDisabled || loadingResponse) return;

    // Haptic feedback
    triggerHaptic('light');

    // Optimistic update
    setErrorMessage(null);
    setOptimisticResponse(response);
    setLoadingResponse(response);

    try {
      const result = await onRespond(response);

      if (result.success) {
        triggerHaptic('success');
      } else {
        setOptimisticResponse(null);
        setErrorMessage(result.error ?? 'Could not save your RSVP. Tap to retry.');
        triggerHaptic('error');
      }
    } catch (err) {
      setOptimisticResponse(null);
      setErrorMessage(err instanceof Error ? err.message : 'Could not save your RSVP. Tap to retry.');
      triggerHaptic('error');
    } finally {
      setLoadingResponse(null);
    }
  }, [isInteractionDisabled, loadingResponse, onRespond, triggerHaptic]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'flex',
          layout === 'horizontal' ? 'flex-row gap-2' : 'flex-col gap-2',
        )}
      >
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = displayResponse === option.value;
          const isLoading = loadingResponse === option.value;

          return (
            <Button variant="ghost"
              key={option.value}
              type="button"
              onClick={() => handleRespond(option.value)}
              disabled={isInteractionDisabled || isLoading}
              aria-label={`${option.label} for this event`}
              aria-pressed={isActive}
              className={cn(
                'relative flex items-center justify-center rounded-xl border-2',
                'transition-all duration-200 ease-out',
                'touch-manipulation select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
                sizeConfig.button,
                sizeConfig.gap,
                layout === 'horizontal' && 'flex-1',
                layout === 'vertical' && 'w-full',
                isActive
                  ? cn(option.activeClass, 'border-transparent scale-[1.02]')
                  : cn(option.inactiveClass, option.hoverClass, 'border-transparent'),
                isInteractionDisabled && 'opacity-50 cursor-not-allowed',
                isLoading && 'animate-pulse',
              )}
            >
              {isLoading ? (
                <Loader2 className={cn(sizeConfig.icon, 'animate-spin')} aria-hidden="true" />
              ) : lockedByDeadline ? (
                <Lock className={cn(sizeConfig.icon, 'flex-shrink-0')} aria-hidden="true" />
              ) : (
                <Icon className={cn(sizeConfig.icon, 'flex-shrink-0')} aria-hidden="true" />
              )}

              {showLabels && (
                <span className={cn(sizeConfig.text, 'font-medium whitespace-nowrap')}>
                  {size === 'sm' ? option.shortLabel : option.label}
                </span>
              )}

              {isPending && isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
              )}
            </Button>
          );
        })}
      </div>
      {lockedByDeadline && (
        <p
          role="status"
          className="text-xs text-warm-500 flex items-center gap-1.5 px-1"
        >
          <Lock className="w-3 h-3" aria-hidden="true" />
          RSVP closed for this event
        </p>
      )}
      {errorMessage && !lockedByDeadline && (
        <p role="alert" className="text-xs text-rose-600 px-1">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

