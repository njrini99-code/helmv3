'use client';

/**
 * ============================================================================
 * Fairway · Tooltip — desktop-only discoverability hint (Radix Tooltip)
 * ----------------------------------------------------------------------------
 * A quiet, fast label for icon-only controls, truncated text, and keyboard
 * shortcuts. NOT a mobile pattern (§11 "no hover-only behavior" is about
 * INTERACTION, but a tooltip's whole reason to exist — reveal on hover — has
 * no equivalent on a touch device) — on a coarse/no-hover pointer this renders
 * `children` alone, no trigger wiring, no wasted Radix listeners.
 *
 *   <Tooltip content="Duplicate event">
 *     <IconButton aria-label="Duplicate"><Copy /></IconButton>
 *   </Tooltip>
 *
 * Material: small opaque ink chip (brief's "control label" register), not a
 * frosted floating panel — a tooltip is a caption, not chrome. No arrow (the
 * chip is small enough that a pointer is noise); 120ms enter honors the
 * brief's "fast 120–160" motion band.
 *
 * Mount one <TooltipProvider> near the app root (or per-story/test); nested
 * providers are harmless (Radix allows it) but this guards against a second
 * accidental one changing `delayDuration` for a subtree.
 * ============================================================================
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Fast fade only — a caption chip, not a panel; no scale/translate to keep
 *  the 120ms enter feeling instant rather than "materializing". */
const TOOLTIP_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export interface TooltipProviderProps {
  children: React.ReactNode;
  /** Delay before the first tooltip in a group opens (ms). Default 400. */
  delayDuration?: number;
  /** Grace period to move between adjacent triggers without re-delaying (ms). Default 200. */
  skipDelayDuration?: number;
}

/**
 * Mount-guarded provider — a second nested `<TooltipProvider>` reuses the
 * ambient one instead of stacking Radix context (a nested provider would
 * silently win with its own `delayDuration`, surprising a consumer who
 * expects the app-root value).
 */
const TooltipProviderContext = React.createContext(false);

export function TooltipProvider({
  children,
  delayDuration = 400,
  skipDelayDuration = 200,
}: TooltipProviderProps) {
  const hasAncestorProvider = React.useContext(TooltipProviderContext);
  if (hasAncestorProvider) return <>{children}</>;
  return (
    <TooltipProviderContext.Provider value={true}>
      <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
        {children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext.Provider>
  );
}

export interface TooltipProps {
  /** The trigger — wrapped via Radix `asChild`, so pass exactly one focusable/hoverable child. */
  children: React.ReactElement;
  /** Tooltip label. */
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Gap between trigger and chip (px). Default 6. */
  sideOffset?: number;
  /** Open delay override (ms) for this one tooltip. */
  delay?: number;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  'data-slot'?: string;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delay,
  open,
  onOpenChange,
  defaultOpen,
  className,
  'data-slot': dataSlot = 'fw-tooltip',
}: TooltipProps) {
  // No native hover surface (coarse pointer / touch): a tooltip can never be
  // discovered there, so skip Radix entirely and just render the trigger.
  const canHover = useMediaQuery('(hover: hover)');
  const reduced = useReducedMotion() ?? false;

  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isOpen = isControlled ? !!open : internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  if (!canHover) return children;

  return (
    <TooltipProvider>
      <TooltipPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} delayDuration={delay}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <AnimatePresence>
          {isOpen ? (
            <TooltipPrimitive.Portal forceMount>
              <TooltipPrimitive.Content
                asChild
                forceMount
                side={side}
                align={align}
                sideOffset={sideOffset}
              >
                <motion.div
                  data-slot={dataSlot}
                  className={cn(
                    'z-[70] select-none rounded-fw-sm bg-text-primary px-2.5 py-1.5 text-caption text-elevated shadow-soft',
                    className,
                  )}
                  variants={TOOLTIP_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: reduced ? 0 : 0.12, ease: 'easeOut' }}
                >
                  {content}
                </motion.div>
              </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
          ) : null}
        </AnimatePresence>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}
Tooltip.displayName = 'Tooltip';
