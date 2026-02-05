'use client';

/**
 * QuickAddEventFAB - Floating Action Button for quick event creation on mobile
 *
 * Features:
 * - Fixed position floating button in bottom-right corner
 * - Safe area aware (respects notches/home indicators)
 * - Expandable quick actions menu
 * - Touch-optimized with haptic feedback
 * - Smooth animations
 * - Backdrop blur when expanded
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  X,
  Calendar,
  Dumbbell,
  Trophy,
  Users,
  ClipboardList,
  Plane,
} from 'lucide-react';
import { useSafeAreaInsets, useHapticFeedback } from '@/hooks/use-mobile-detection';

type QuickEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

interface QuickAddEventFABProps {
  onAddEvent: (eventType?: QuickEventType) => void;
  className?: string;
  disabled?: boolean;
}

interface QuickAction {
  type: QuickEventType;
  label: string;
  icon: typeof Plus;
  color: string;
  bgColor: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    type: 'practice',
    label: 'Practice',
    icon: Dumbbell,
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
  {
    type: 'tournament',
    label: 'Tournament',
    icon: Trophy,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
  },
  {
    type: 'qualifier',
    label: 'Qualifier',
    icon: ClipboardList,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
  },
  {
    type: 'meeting',
    label: 'Meeting',
    icon: Users,
    color: 'text-sky-700',
    bgColor: 'bg-sky-100',
  },
  {
    type: 'travel',
    label: 'Travel',
    icon: Plane,
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
  },
];

export function QuickAddEventFAB({
  onAddEvent,
  className,
  disabled = false,
}: QuickAddEventFABProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const { triggerHaptic } = useHapticFeedback();

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  // Prevent body scroll when expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [isExpanded]);

  const handleToggle = useCallback(() => {
    triggerHaptic('light');
    setIsExpanded(!isExpanded);
  }, [isExpanded, triggerHaptic]);

  const handleQuickAction = useCallback((type: QuickEventType) => {
    triggerHaptic('medium');
    setIsExpanded(false);
    onAddEvent(type);
  }, [onAddEvent, triggerHaptic]);

  const handleGenericAdd = useCallback(() => {
    triggerHaptic('medium');
    setIsExpanded(false);
    onAddEvent();
  }, [onAddEvent, triggerHaptic]);

  const handleBackdropClick = useCallback(() => {
    triggerHaptic('light');
    setIsExpanded(false);
  }, [triggerHaptic]);

  return (
    <>
      {/* Backdrop when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={handleBackdropClick}
        />
      )}

      {/* FAB Container */}
      <div
        className={cn(
          'fixed right-4 z-50',
          className
        )}
        style={{
          bottom: Math.max(safeAreaBottom, 16) + 16,
        }}
      >
        {/* Quick actions menu */}
        <div
          className={cn(
            'absolute bottom-20 right-0 flex flex-col gap-3',
            'transition-all duration-300 ease-out origin-bottom-right',
            isExpanded
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          )}
        >
          {QUICK_ACTIONS.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.type}
                type="button"
                onClick={() => handleQuickAction(action.type)}
                className={cn(
                  'flex items-center gap-3 pr-4 pl-3 py-2.5 rounded-full',
                  'bg-white shadow-lg',
                  'transition-all duration-200',
                  'hover:shadow-xl active:scale-95',
                  'touch-manipulation'
                )}
                style={{
                  transitionDelay: isExpanded ? `${(QUICK_ACTIONS.length - 1 - index) * 50}ms` : '0ms',
                }}
              >
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  action.bgColor
                )}>
                  <Icon className={cn('w-5 h-5', action.color)} />
                </div>
                <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                  {action.label}
                </span>
              </button>
            );
          })}

          {/* Generic "New Event" option */}
          <button
            type="button"
            onClick={handleGenericAdd}
            className={cn(
              'flex items-center gap-3 pr-4 pl-3 py-2.5 rounded-full',
              'bg-white shadow-lg',
              'transition-all duration-200',
              'hover:shadow-xl active:scale-95',
              'touch-manipulation'
            )}
            style={{
              transitionDelay: isExpanded ? `${QUICK_ACTIONS.length * 50}ms` : '0ms',
            }}
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-slate-700" />
            </div>
            <span className="text-sm font-semibold text-slate-900">
              Other Event
            </span>
          </button>
        </div>

        {/* Main FAB button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            'relative w-14 h-14 rounded-2xl',
            'flex items-center justify-center',
            'transition-all duration-300 ease-out',
            'touch-manipulation',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300',
            isExpanded
              ? 'bg-slate-900 rotate-0 rounded-xl'
              : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-600/40',
            'active:scale-95',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={isExpanded ? 'Close menu' : 'Add new event'}
        >
          <div className={cn(
            'transition-all duration-300',
            isExpanded && 'rotate-45'
          )}>
            {isExpanded ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
            )}
          </div>
        </button>
      </div>
    </>
  );
}

/**
 * Simple FAB without expandable menu - just opens the event form
 */
export function SimpleAddEventFAB({
  onAddEvent,
  className,
  disabled = false,
}: {
  onAddEvent: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const { triggerHaptic } = useHapticFeedback();

  const handleClick = useCallback(() => {
    triggerHaptic('medium');
    onAddEvent();
  }, [onAddEvent, triggerHaptic]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'fixed right-4 z-40',
        'w-14 h-14 rounded-full',
        'bg-emerald-600 hover:bg-emerald-700',
        'flex items-center justify-center',
        'shadow-xl hover:shadow-2xl',
        'transition-all duration-200',
        'touch-manipulation',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300',
        'hover:scale-105 active:scale-95',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      style={{
        bottom: Math.max(safeAreaBottom, 16) + 16,
      }}
      aria-label="Add new event"
    >
      <Plus className="w-7 h-7 text-white" />
    </button>
  );
}

/**
 * Mini FAB for inline use (e.g., inside empty states)
 */
export function MiniAddEventButton({
  onClick,
  label = 'Add Event',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  const { triggerHaptic } = useHapticFeedback();

  const handleClick = () => {
    triggerHaptic('light');
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2',
        'px-4 py-2.5 rounded-xl',
        'bg-emerald-600 text-white',
        'font-semibold text-sm',
        'hover:bg-emerald-700 active:scale-95',
        'transition-all duration-200',
        'touch-manipulation min-h-[44px]',
        className
      )}
    >
      <Plus className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );
}
