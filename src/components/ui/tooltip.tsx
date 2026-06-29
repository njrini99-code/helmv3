'use client';

/**
 * Tooltip — Radix-backed primitive with the California-modern recipe.
 * Two surfaces are exported:
 *   1. The original `<Tooltip content="...">{trigger}</Tooltip>` API
 *      kept as a thin wrapper for legacy call sites.
 *   2. The standard Radix compound API (`Tooltip`, `TooltipTrigger`,
 *      `TooltipContent`, `TooltipProvider`) for new code that wants
 *      keyboard nav, controlled state, or custom content.
 *
 * Mount `<TooltipProvider delayDuration={300}>` once at the app root.
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-full px-3 py-1.5 text-caption font-medium tracking-[-0.005em]',
        'bg-warm-900/95 text-cream-50',
        'shadow-[0_2px_8px_hsl(42_14%_22%/0.18),0_8px_18px_hsl(42_14%_22%/0.12)]',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
        'duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface LegacyTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
  className?: string;
}

/**
 * Legacy `<Tooltip content="...">{trigger}</Tooltip>` API kept for
 * backward compatibility. Internally delegates to Radix so we get
 * keyboard navigation, focus management, and ARIA correctness.
 */
function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 300,
  className,
}: LegacyTooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayMs}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {/* span wrapper so non-button triggers (icons, plain text) get
              the necessary event handlers without forcing a button role */}
          <span className="inline-flex">{children}</span>
        </TooltipPrimitive.Trigger>
        <TooltipContent side={side} className={className}>
          {content}
        </TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip, TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider };
