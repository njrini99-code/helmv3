'use client';

/**
 * Popover — Radix-backed compound for click-anchored panels (richer than
 * Tooltip, lighter than Drawer). Use for "Why?" explainers, help/info
 * content, hovercards on player avatars, anywhere a small contextual
 * panel needs to anchor to a trigger and trap focus.
 *
 * Mobile rule: for one-breath explainers we still prefer <Drawer> on
 * narrow viewports. Popover is the desktop companion.
 *
 * Surface vocabulary matches dropdown-menu / tooltip:
 *   - surface-stone matte panel
 *   - 16px rounded
 *   - cubic-bezier(0.16, 1, 0.3, 1) easing, 300ms duration
 *   - hairline shadow on warm-tinted hsl(42 14% 22%) light source
 */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverPortal = PopoverPrimitive.Portal;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl surface-stone p-5 outline-none',
        'shadow-[0_2px_10px_hsl(42_14%_22%/0.10),0_18px_44px_hsl(42_14%_22%/0.14)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        'duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'text-[14px] leading-relaxed text-warm-700',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const PopoverArrow = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Arrow
    ref={ref}
    className={cn('fill-cream-100', className)}
    width={14}
    height={7}
    {...props}
  />
));
PopoverArrow.displayName = PopoverPrimitive.Arrow.displayName;

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverPortal,
  PopoverContent,
  PopoverClose,
  PopoverArrow,
};
