'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

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
  // iOS UISegmentedControl sizing: ~32pt compact / ~40pt regular
  const sizeClasses = compact
    ? 'min-h-[32px] px-3 py-1 text-xs'
    : 'min-h-[40px] px-3.5 py-1.5 text-footnote';

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
          // iOS segmented control: fully rounded pill with subtle inset background
          'inline-flex items-center gap-0.5 rounded-full bg-warm-100 p-1',
          'shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.04)]',
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
              onClick={() => {
                if (!isActive) void triggerHaptic('light');
                onChange(tab.id);
              }}
              className={cn(
                // iOS: active pill slides with spring via transform-friendly shadow/bg
                'relative flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium',
                'transition-[background-color,box-shadow,color,transform] duration-200 ease-out',
                sizeClasses,
                stretch && 'flex-1',
                isActive
                  ? 'bg-white text-warm-900 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]'
                  : 'text-warm-500 hover:text-warm-700 active:scale-[0.97]',
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
