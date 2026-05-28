'use client';

/**
 * GolfTabBar — editorial tab navigation.
 *
 * Redesigned May 2026 (audited through impeccable + ui-ux-pro-max).
 * The previous treatment was an iOS UISegmentedControl: cream-100 tray,
 * white sticker-shadow active pill, cramped count badges. That pattern
 * clashed with the California-modern matte vocabulary and stacked four
 * colors into a tiny strip.
 *
 * The new treatment matches the Eyebrow + hairline-rule language used
 * by PageHeader and the Round Library period headers:
 *   - No tray. Tabs sit on the page surface, separated by a single
 *     hairline rule below.
 *   - Active state = warm-900 text + 2px primary-accent underline that
 *     animates in on cubic-bezier(0.16, 1, 0.3, 1) — same easing as
 *     every other transition in the system.
 *   - Inactive state = warm-400 text. Hover = warm-700.
 *   - Count is plain tabular-nums text after the label — no badge shell.
 *   - Urgent dot = small primary-500 pip top-right of the label, only
 *     when not active (active state already implies focus).
 *
 * Compact mode drops the vertical padding for tight toolbars; default
 * keeps editorial breath.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';

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
  // Vertical breath: compact = tight (toolbars), default = editorial.
  // 44px touch target preserved either way (UX rule #2).
  const verticalPad = compact ? 'py-2.5' : 'py-3';
  const fontSize = compact ? 'text-body-sm' : 'text-body-sm';

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
          'flex items-center border-b border-warm-200/45',
          stretch ? 'w-full justify-between gap-3 sm:gap-5' : 'w-max gap-5 sm:gap-7 md:gap-9',
          listClassName,
        )}
      >
        {tabs.map((tab) => {
          const isActive = value === tab.id;
          return (
            <Button variant="primary"
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) void triggerHaptic('light');
                onChange(tab.id);
              }}
              className={cn(
                'group relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
                verticalPad,
                fontSize,
                'font-medium tracking-[-0.005em]',
                'transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                'min-h-[44px]', // touch target — UX rule #2
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 rounded-sm',
                stretch && 'flex-1',
                // Animated underline — anchored to the bottom hairline rule.
                'before:absolute before:left-0 before:right-0 before:bottom-[-1px] before:h-[2px]',
                'before:bg-primary-500 before:origin-left before:scale-x-0',
                'before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.16,1,0.3,1)]',
                isActive
                  ? 'text-warm-900 before:scale-x-100'
                  : 'text-warm-400 hover:text-warm-700 active:scale-[0.97]',
              )}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span className="relative">
                {tab.label}
                {/* Urgent indicator — small primary pip at top-right of the
                    label, only when not already active. Inset slightly so
                    it doesn't crowd descenders. */}
                {tab.dot && !isActive && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary-500"
                  />
                )}
              </span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'tabular-nums text-caption font-medium transition-colors duration-200',
                    isActive ? 'text-warm-600' : 'text-warm-400 group-hover:text-warm-500',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
