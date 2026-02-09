'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Plus, X, Calendar } from 'lucide-react';
import { BASEBALL_EVENT_TYPES, type BaseballEventType } from './event-type-config';

interface QuickAddEventFABProps {
  onAddEvent: (eventType?: BaseballEventType) => void;
  className?: string;
  disabled?: boolean;
}

export function QuickAddEventFAB({ onAddEvent, className, disabled = false }: QuickAddEventFABProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) setIsExpanded(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

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
    setIsExpanded((prev) => !prev);
  }, []);

  const handleQuickAction = useCallback(
    (type: BaseballEventType) => {
      setIsExpanded(false);
      onAddEvent(type);
    },
    [onAddEvent],
  );

  const handleGenericAdd = useCallback(() => {
    setIsExpanded(false);
    onAddEvent();
  }, [onAddEvent]);

  return (
    <>
      {/* Backdrop */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* FAB Container */}
      <div className={cn('fixed right-4 bottom-20 z-50', className)}>
        {/* Quick actions menu */}
        <div
          className={cn(
            'absolute bottom-20 right-0 flex flex-col gap-3',
            'transition-all duration-300 ease-out origin-bottom-right',
            isExpanded
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none',
          )}
        >
          {BASEBALL_EVENT_TYPES.filter((t) => t.type !== 'other').map((action, index) => {
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
                  'touch-manipulation',
                )}
                style={{
                  transitionDelay: isExpanded
                    ? `${(BASEBALL_EVENT_TYPES.length - 2 - index) * 40}ms`
                    : '0ms',
                }}
              >
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', action.bgColor)}>
                  <Icon className={cn('w-5 h-5', action.textColor)} />
                </div>
                <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                  {action.label}
                </span>
              </button>
            );
          })}

          {/* Generic "Other" option */}
          <button
            type="button"
            onClick={handleGenericAdd}
            className={cn(
              'flex items-center gap-3 pr-4 pl-3 py-2.5 rounded-full',
              'bg-white shadow-lg',
              'transition-all duration-200',
              'hover:shadow-xl active:scale-95',
              'touch-manipulation',
            )}
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-slate-700" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Other Event</span>
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
              ? 'bg-slate-900 rounded-xl'
              : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-600/40',
            'active:scale-95',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          aria-label={isExpanded ? 'Close menu' : 'Add new event'}
        >
          <div className={cn('transition-all duration-300', isExpanded && 'rotate-45')}>
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
