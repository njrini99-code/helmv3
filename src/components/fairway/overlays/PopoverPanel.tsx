'use client';

/**
 * ============================================================================
 * Fairway · PopoverPanel — the lightest overlay (Radix Popover)
 * ----------------------------------------------------------------------------
 * An anchored, non-blocking floating panel: menus, day-detail, quick-pick.
 * The bottom of the escalation ladder — reach for this FIRST, before a Sheet
 * or a ModalShell.
 *
 *   • anchored to a trigger, auto-flips/shifts to stay in view (Radix)
 *   • dismiss on outside-click + Escape; does NOT lock scroll or trap focus
 *     hard (it's a transient panel, not a blocking surface)
 *   • Regular warm `.glass-regular` body OR matte `Elevated` (variant), shadow-raise
 *   • slow-ish cinematic materialize (opacity + scale 0.97→1), reduced-motion honored
 *   • green focus-visible ring (§7.2); arrow optional
 *
 * Escalation: PopoverPanel < Sheet < ModalShell.
 * ============================================================================
 */

import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  FW_Z,
  panelVariants,
  panelVariantsReduced,
  panelTransition,
  GLASS_REGULAR_CLASS,
} from './_shared';

export type PopoverPanelSurface = 'glass' | 'matte';

export interface PopoverPanelProps {
  /** Controlled open state. */
  open?: boolean;
  /** Open-change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled default. */
  defaultOpen?: boolean;
  /** The anchor — rendered via Radix `asChild`. REQUIRED. */
  trigger: React.ReactNode;
  /** Panel content. */
  children?: React.ReactNode;
  /** Side relative to the trigger. Default `bottom`. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side. Default `center`. */
  align?: 'start' | 'center' | 'end';
  /** Gap between trigger and panel (px). Default 8. */
  sideOffset?: number;
  /** Surface material. `glass` (default) or matte `Elevated`. */
  surface?: PopoverPanelSurface;
  /** Show the little pointer arrow. Default false. */
  showArrow?: boolean;
  /**
   * Accessible label for the panel when it has no heading of its own
   * (Radix Popover does not require a title, but a label aids SR users).
   */
  ariaLabel?: string;
  /** Extra classes merged (last-wins) onto the panel. */
  className?: string;
  /** Width preset; `auto` hugs content (good for menus). Default `auto`. */
  width?: 'auto' | 'sm' | 'md' | 'lg';
  'data-slot'?: string;
}

const WIDTH_CLASS = {
  auto: 'w-auto',
  sm: 'w-56',
  md: 'w-72',
  lg: 'w-80',
} as const;

function PopoverPanelRoot({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  children,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  surface = 'glass',
  showArrow = false,
  ariaLabel,
  className,
  width = 'auto',
  'data-slot': dataSlot = 'popover-panel',
}: PopoverPanelProps) {
  const reduced = useReducedMotion() ?? false;

  // Track open so framer-motion can run the exit tween before Radix unmounts.
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

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <AnimatePresence>
        {isOpen ? (
          <Popover.Portal forceMount>
            <Popover.Content
              asChild
              forceMount
              side={side}
              align={align}
              sideOffset={sideOffset}
              aria-label={ariaLabel}
              className="fairway-ds"
            >
              <motion.div
                data-slot={dataSlot}
                style={{ zIndex: FW_Z.command }}
                className={cn(
                  'origin-[var(--radix-popover-content-transform-origin)]',
                  'rounded-card p-2 text-text-primary outline-none',
                  surface === 'glass'
                    ? GLASS_REGULAR_CLASS
                    : 'bg-elevated border border-border-subtle shadow-raise',
                  WIDTH_CLASS[width],
                  className,
                )}
                variants={reduced ? panelVariantsReduced : panelVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={panelTransition(reduced, false)}
              >
                {children}
                {showArrow ? (
                  <Popover.Arrow
                    className={cn(
                      surface === 'glass'
                        ? 'fill-[var(--fw-glass-bg-strong)]'
                        : 'fill-elevated',
                    )}
                    width={12}
                    height={6}
                  />
                ) : null}
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </AnimatePresence>
    </Popover.Root>
  );
}
PopoverPanelRoot.displayName = 'PopoverPanel';

/* ── compound parts (light menu vocabulary) ──────────────────────────────── */

/** Optional small heading row inside the panel. */
const PopoverPanelHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="popover-panel-header"
    className={cn(
      'px-2 pb-2 pt-1 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary',
      className,
    )}
    {...props}
  />
));
PopoverPanelHeader.displayName = 'PopoverPanel.Header';

/** A selectable row. Use for menu items / quick-picks. */
const PopoverPanelItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type, ...props }, ref) => (
  // helm/no-raw-button: PopoverPanel.Item IS the menu-item primitive (the
  // button being wrapped), exactly the case the rule allowlists for
  // src/components/ui/*. It ships its own focus-ring + keyboard + disabled
  // states below, so a raw <button> is the correct, intentional choice here.
  // eslint-disable-next-line helm/no-raw-button
  <button
    ref={ref}
    type={type ?? 'button'}
    data-slot="popover-panel-item"
    className={cn(
      'flex w-full items-center gap-2.5 rounded-fw-sm px-2.5 py-2',
      // 44px tap-target floor (WCAG 2.2 AA 2.5.8) — was min-h-[36px], 8px
      // short. Every PopoverPanel menu app-wide inherits the fix.
      'min-h-11 text-left font-fw-sans text-body text-text-primary',
      'transition-colors duration-fast',
      'hover:bg-surface-sunken active:translate-y-[0.5px]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-elevated',
      'disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
PopoverPanelItem.displayName = 'PopoverPanel.Item';

/** Thin warm separator between groups. */
const PopoverPanelSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    data-slot="popover-panel-separator"
    className={cn('my-1.5 h-px bg-border-subtle', className)}
    {...props}
  />
));
PopoverPanelSeparator.displayName = 'PopoverPanel.Separator';

/** Radix Close passthrough (asChild) for "dismiss on action" controls. */
const PopoverPanelClose = Popover.Close;

/* ── public compound component ───────────────────────────────────────────── */

type PopoverPanelComponent = typeof PopoverPanelRoot & {
  Header: typeof PopoverPanelHeader;
  Item: typeof PopoverPanelItem;
  Separator: typeof PopoverPanelSeparator;
  Close: typeof PopoverPanelClose;
};

export const PopoverPanel = PopoverPanelRoot as PopoverPanelComponent;
PopoverPanel.Header = PopoverPanelHeader;
PopoverPanel.Item = PopoverPanelItem;
PopoverPanel.Separator = PopoverPanelSeparator;
PopoverPanel.Close = PopoverPanelClose;
