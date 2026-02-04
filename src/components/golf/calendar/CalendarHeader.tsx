'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void;
}

export function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
}: CalendarHeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const getTitle = () => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(214, 211, 209, 0.2)',
        background: 'transparent',
      }}
    >
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
          {getTitle()}
        </h1>

        {/* Navigation arrows */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('prev')}
            aria-label="Previous"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronLeft className="w-4 h-4 text-stone-600" aria-hidden="true" />
          </button>
          <button
            onClick={() => onNavigate('next')}
            aria-label="Next"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronRight className="w-4 h-4 text-stone-600" aria-hidden="true" />
          </button>
        </div>

        {/* Today Button */}
        <button
          onClick={() => onNavigate('today')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#44403c',
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-3">
        {/* View Toggle - Glass pill */}
        <div
          style={{
            padding: '4px',
            borderRadius: '9999px',
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {/* Mobile: Only show Day view, Desktop: Show all views */}
          {(isMobile ? ['day'] : ['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v as CalendarView)}
              className={cn(
                'px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-full transition-all duration-200 min-h-[44px]',
                view === v
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Add Event Button */}
        {onAddEvent && (
          <button
            onClick={onAddEvent}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: 'white',
              fontWeight: 500,
              fontSize: '14px',
              borderRadius: '10px',
              border: 'none',
              boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
