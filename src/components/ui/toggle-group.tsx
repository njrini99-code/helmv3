'use client';

/**
 * ToggleGroup — Radix-backed segmented control. Use for period
 * switchers (7d / 30d / 90d / season), sort orders, view-mode
 * switchers (grid / list), or any small mutually-exclusive set of
 * options that doesn't warrant a full <Tabs>.
 *
 * Single mode (default) = exactly one option selected at a time.
 * Multiple mode = independent toggles (filters, etc.).
 *
 * Surface vocabulary matches Tabs pills variant: cream-100 rail,
 * white pill on active, soft warm shadow.
 */

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 rounded-full bg-cream-100 p-1 text-warm-500',
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, onPointerDown, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    onPointerDown={(e) => {
      void triggerHaptic('light');
      onPointerDown?.(e);
    }}
    className={cn(
      'relative inline-flex items-center justify-center whitespace-nowrap outline-none',
      'min-h-[36px] rounded-full px-3.5 text-[12.5px] font-medium tracking-[-0.005em]',
      'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
      'disabled:pointer-events-none disabled:opacity-40',
      'focus-visible:ring-2 focus-visible:ring-primary-500/30',
      'data-[state=on]:bg-white data-[state=on]:text-warm-900',
      'data-[state=on]:shadow-[0_1px_2px_hsl(42_14%_22%/0.06),0_4px_10px_hsl(42_14%_22%/0.08)]',
      'data-[state=off]:hover:text-warm-800',
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
