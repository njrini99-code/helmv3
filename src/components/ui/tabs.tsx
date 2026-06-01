'use client';

/**
 * Tabs — Radix-backed compound for switching panels within a surface.
 *
 * Migrated Apr 2026 from a hand-rolled implementation to
 * @radix-ui/react-tabs so we get keyboard navigation (arrow keys,
 * Home/End), ARIA correctness, and focus management for free.
 *
 * The legacy API (`onChange`, `value`, `icon`, `badge`, haptic feedback)
 * is preserved so existing call sites keep working.
 *
 * Variants on TabsList:
 *   - "pills" (default): chip-shaped tabs on a cream-200 inset rail.
 *     Compact toolbars, hero header switchers, ≤4 tabs.
 *   - "underline": editorial bottom-border with active hairline underline.
 *     Long-form pages (stats sections, intelligence dashboards, ≥5 tabs).
 */

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

/** Legacy alias for `onValueChange` — preserved so old call sites keep working.
 *  If both are provided, both fire. We strip the native HTMLDivElement
 *  `onChange` (FormEventHandler) so our value-typed `onChange` doesn't
 *  collide with React's native form-event signature. */
type WrappedTabsProps = Omit<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>,
  'onChange'
> & {
  onChange?: (value: string) => void;
};

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  WrappedTabsProps
>(({ onChange, onValueChange, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    onValueChange={(v) => {
      void triggerHaptic('light');
      onValueChange?.(v);
      onChange?.(v);
    }}
    {...props}
  />
));
Tabs.displayName = 'Tabs';

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: 'pills' | 'underline';
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = 'pills', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(
      'inline-flex items-center',
      variant === 'pills' &&
        'gap-1 rounded-full bg-cream-100 p-1 text-warm-500',
      variant === 'underline' &&
        'gap-6 border-b border-warm-200/55 text-warm-500',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  variant?: 'pills' | 'underline';
  icon?: React.ReactNode;
  badge?: number | string;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = 'pills', icon, badge, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-variant={variant}
    className={cn(
      'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap outline-none',
      'transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
      'disabled:pointer-events-none disabled:opacity-40',
      'focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-0',
      variant === 'pills' && [
        'min-h-[44px] rounded-full px-4 py-1.5 text-[13px] font-medium tracking-[-0.005em]',
        'data-[state=active]:bg-white data-[state=active]:text-warm-900',
        'data-[state=active]:shadow-[0_1px_2px_hsl(42_14%_22%/0.06),0_4px_10px_hsl(42_14%_22%/0.08)]',
        'data-[state=inactive]:hover:text-warm-800',
      ],
      variant === 'underline' && [
        'pb-3 text-[14px] font-medium tracking-[-0.005em]',
        'before:absolute before:inset-x-0 before:-bottom-px before:h-[2px] before:scale-x-0 before:bg-warm-900',
        'before:transition-transform before:duration-300 before:[transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        'data-[state=active]:text-warm-900 data-[state=active]:before:scale-x-100',
        'data-[state=inactive]:hover:text-warm-700',
      ],
      className,
    )}
    {...props}
  >
    {icon && <span className="flex-shrink-0">{icon}</span>}
    {children}
    {badge !== undefined && (
      <span className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-micro font-bold rounded-full',
        'transition-colors duration-300',
        'group-data-[state=active]:bg-primary-100 group-data-[state=active]:text-primary-700',
        'group-data-[state=inactive]:bg-warm-200 group-data-[state=inactive]:text-warm-600',
      )}>
        {badge}
      </span>
    )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-6 outline-none',
      'data-[state=active]:animate-in data-[state=active]:fade-in-0',
      'data-[state=active]:duration-300 data-[state=active]:[transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
