'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface GolfTabBarItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
  dot?: boolean;
}

interface GolfTabBarProps<T extends string> {
  tabs: GolfTabBarItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  listClassName?: string;
  stretch?: boolean;
  scrollable?: boolean;
  compact?: boolean;
}

export function GolfTabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
  listClassName,
  stretch = false,
  scrollable = false,
  compact = false,
}: GolfTabBarProps<T>) {
  const sizeClasses = compact
    ? 'min-h-[38px] px-3 py-1.5 text-xs'
    : 'min-h-[42px] px-3.5 py-2 text-sm';

  return (
    <div
      className={cn(
        scrollable && 'pills-scroll overscroll-x-contain touch-pan-x -mx-4 px-4 md:mx-0 md:px-0',
        className,
      )}
      style={scrollable ? { WebkitOverflowScrolling: 'touch' } : undefined}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center gap-1 rounded-2xl border border-warm-200/70 bg-warm-100/80 p-1 shadow-sm backdrop-blur-sm',
          stretch ? 'w-full' : 'w-max',
          listClassName,
        )}
      >
        {tabs.map((tab) => {
          const isActive = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors',
                sizeClasses,
                stretch && 'flex-1',
                isActive
                  ? 'bg-white text-warm-900 shadow-sm ring-1 ring-white/80'
                  : 'text-warm-500 hover:bg-white/60 hover:text-warm-700 active:bg-white/80',
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-200/80 text-warm-500',
                  )}
                >
                  {tab.count}
                </span>
              )}
              {tab.dot && (
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    isActive ? 'bg-primary-500' : 'bg-red-500',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
