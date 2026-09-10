'use client';

/**
 * ============================================================================
 * Fairway · Menu — the canonical action/overflow menu (Radix Dropdown Menu)
 * ----------------------------------------------------------------------------
 * Supersedes the hand-rolled dropdowns scattered through the app —
 * `src/components/ui/dropdown-menu.tsx` (shadcn primitive, unstyled to
 * Fairway tokens) and `src/components/ui/row-actions-menu.tsx` (bespoke
 * absolute-positioned panel: raw hex colors, manual outside-click/Escape
 * wiring, no roving-tabindex keyboard nav, `rounded-2xl`/arbitrary shadow).
 * Do not import either — this is the one menu going forward.
 *
 *   <Menu trigger={<IconButton aria-label="More" ...>} align="end">
 *     <Menu.Label>Section</Menu.Label>
 *     <Menu.Item icon={<Pencil />} onSelect={...}>Rename</Menu.Item>
 *     <Menu.Item shortcut="⌘D" onSelect={...}>Duplicate</Menu.Item>
 *     <Menu.Separator />
 *     <Menu.Group>
 *       <Menu.Item destructive icon={<Trash />} onSelect={...}>Delete</Menu.Item>
 *     </Menu.Group>
 *   </Menu>
 *
 * Material: floating chrome (brief §2 material 4) — `fw-frost fw-frost-floating`.
 * Never on calendar body / tables / dense stats; this IS the floating layer.
 *
 * Portal: renders into the nearest ModalShell/Drawer content node via
 * ModalPortalContext when present (so it stays a real DOM descendant of an
 * open modal's focus trap — see overlays/_shared.ts docblock), else
 * `document.body` (Radix's own default).
 *
 * Keyboard: Radix owns roving tabindex, type-ahead, Home/End, Esc-to-close and
 * focus return to the trigger — nothing to wire by hand.
 * ============================================================================
 */

import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FW_Z, panelVariants, panelVariantsReduced, panelTransition } from './_shared';
import { useModalPortalContainer } from './_shared';

export interface MenuProps {
  /** The trigger element (e.g. an `<IconButton>`), rendered via Radix `asChild`. */
  trigger: React.ReactNode;
  children?: React.ReactNode;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Side relative to the trigger. Default `bottom`. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side. Default `end` (overflow menus hug the trigger's edge). */
  align?: 'start' | 'center' | 'end';
  /** Gap between trigger and panel (px). Default 6. */
  sideOffset?: number;
  /** Width preset; `auto` hugs content. Default `auto`. */
  width?: 'auto' | 'sm' | 'md' | 'lg';
  /** Accessible label when the panel has no visible heading. */
  ariaLabel?: string;
  className?: string;
  'data-slot'?: string;
}

const WIDTH_CLASS = {
  auto: 'w-auto min-w-[10rem]',
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-80',
} as const;

function MenuRoot({
  trigger,
  children,
  open,
  onOpenChange,
  defaultOpen,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
  width = 'auto',
  ariaLabel,
  className,
  'data-slot': dataSlot = 'fw-menu',
}: MenuProps) {
  const reduced = useReducedMotion() ?? false;
  const portalContainer = useModalPortalContainer();

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
    <DropdownMenu.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

      <AnimatePresence>
        {isOpen ? (
          <DropdownMenu.Portal forceMount container={portalContainer ?? undefined}>
            <DropdownMenu.Content
              asChild
              forceMount
              side={side}
              align={align}
              sideOffset={sideOffset}
              aria-label={ariaLabel}
              // Radix defaults `aria-labelledby` to the trigger — a reasonable
              // fallback name when the caller has no `ariaLabel`, but
              // `aria-labelledby` wins over `aria-label` in accessible-name
              // computation when both are present, silently defeating a
              // caller-supplied label. Only clear it when we actually have a
              // replacement name (an explicit `undefined` key removes the
              // attribute; omitting the key entirely leaves Radix's default
              // untouched — those are NOT the same thing for a prop spread).
              {...(ariaLabel ? { 'aria-labelledby': undefined } : {})}
              className="fairway-ds"
              collisionPadding={8}
            >
              <motion.div
                data-slot={dataSlot}
                style={{ zIndex: FW_Z.command }}
                className={cn(
                  'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
                  'fw-frost fw-frost-floating rounded-fw-md p-1 text-text-primary outline-none',
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
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        ) : null}
      </AnimatePresence>
    </DropdownMenu.Root>
  );
}
MenuRoot.displayName = 'Menu';

/* ── compound parts ─────────────────────────────────────────────────────── */

export interface MenuItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenu.Item>, 'onSelect' | 'className'> {
  icon?: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  className?: string;
  onSelect?: (event: Event) => void;
}

const MenuItem = React.forwardRef<React.ElementRef<typeof DropdownMenu.Item>, MenuItemProps>(
  function MenuItem({ icon, shortcut, destructive = false, className, children, disabled, ...props }, ref) {
    return (
      <DropdownMenu.Item
        ref={ref}
        disabled={disabled}
        data-slot="fw-menu-item"
        className={cn(
          'flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-fw-sm px-3 text-body-sm outline-none md:min-h-9',
          'transition-colors duration-fast',
          destructive ? 'text-fw-danger-ink' : 'text-text-primary',
          'data-[highlighted]:bg-surface-tint',
          destructive && 'data-[highlighted]:bg-fw-danger-bg',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          className,
        )}
        {...props}
      >
        {icon ? (
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        ) : null}
        <span className="flex-1 truncate text-left">{children}</span>
        {shortcut ? (
          <span className="flex-shrink-0 font-fw-mono text-caption text-text-tertiary">
            {shortcut}
          </span>
        ) : null}
      </DropdownMenu.Item>
    );
  },
);

const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Separator
    ref={ref}
    data-slot="fw-menu-separator"
    className={cn('my-1 h-px bg-border-subtle', className)}
    {...props}
  />
));
MenuSeparator.displayName = 'Menu.Separator';

const MenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Label
    ref={ref}
    data-slot="fw-menu-label"
    className={cn(
      'px-3 pb-1 pt-1.5 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary',
      className,
    )}
    {...props}
  />
));
MenuLabel.displayName = 'Menu.Label';

const MenuGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Group>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Group>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Group ref={ref} data-slot="fw-menu-group" className={cn(className)} {...props} />
));
MenuGroup.displayName = 'Menu.Group';

/* ── public compound component ───────────────────────────────────────────── */

type MenuComponent = typeof MenuRoot & {
  Item: typeof MenuItem;
  Separator: typeof MenuSeparator;
  Label: typeof MenuLabel;
  Group: typeof MenuGroup;
};

export const Menu = MenuRoot as MenuComponent;
Menu.Item = MenuItem;
Menu.Separator = MenuSeparator;
Menu.Label = MenuLabel;
Menu.Group = MenuGroup;

export type { MenuItemProps as FwMenuItemProps };
