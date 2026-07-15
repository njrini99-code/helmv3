'use client';

/**
 * ============================================================================
 * Fairway · Sheet — side / bottom drawer (vaul)
 * ----------------------------------------------------------------------------
 * The mid-weight overlay: heavier than a PopoverPanel, lighter than a
 * ModalShell. A focused secondary task that slides in from an edge — filters,
 * chat, a detail peek. Built on vaul (drag-to-dismiss, snap points, scroll-lock,
 * focus management all handled by the library).
 *
 *   • direction: bottom (default) | right | left | top
 *   • drag handle on the bottom variant; rounded leading edge
 *   • matte `Elevated` body (sheets carry primary content → matte, §4.3),
 *     warm border, shadow-modal; cheap dim warm scrim (not blurred)
 *   • Header / Body / Footer / Title / Description compound parts
 *   • Escape + scrim click close; green focus-visible ring (§7.2)
 *   • prefers-reduced-motion respected (vaul falls back to opacity-only via
 *     the reduced-motion media query in the consumer's global CSS; we also
 *     keep the transform distances small)
 *
 * Escalation: PopoverPanel < Sheet < ModalShell.
 * ============================================================================
 */

import * as React from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { FW_Z, CLOSE_BUTTON_CLASS } from './_shared';

export type SheetSide = 'bottom' | 'top' | 'left' | 'right';

/** Per-side panel position + leading-edge radius + slide axis sizing. */
const SIDE_CLASS: Record<SheetSide, string> = {
  bottom:
    'inset-x-0 bottom-0 mt-24 max-h-[88dvh] rounded-t-fw-lg ' +
    'border-t border-border-subtle',
  top:
    'inset-x-0 top-0 mb-24 max-h-[88dvh] rounded-b-fw-lg ' +
    'border-b border-border-subtle',
  left:
    'inset-y-0 left-0 mr-24 w-[min(26rem,calc(100vw-3rem))] rounded-r-fw-lg ' +
    'border-r border-border-subtle',
  right:
    'inset-y-0 right-0 ml-24 w-[min(26rem,calc(100vw-3rem))] rounded-l-fw-lg ' +
    'border-l border-border-subtle',
};

export interface SheetProps {
  /** Controlled open state. */
  open?: boolean;
  /** Open-change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled default. */
  defaultOpen?: boolean;
  /** Optional trigger element (rendered via vaul `asChild`). */
  trigger?: React.ReactNode;
  /** Edge the sheet slides in from. Default `bottom`. */
  side?: SheetSide;
  /**
   * OPT-IN responsive override: below `md` (768px) the sheet renders as
   * `mobileSide` instead of `side` — e.g. `side="right"` (a desktop docked
   * panel) with `mobileSide="bottom"` gets Doctrine rule 4's "every
   * input/create flow under `md` is a bottom sheet" for free, without every
   * consumer hand-rolling its own `useMediaQuery` + ternary. Ignored (so
   * `side` alone drives every render — byte-identical) when absent.
   */
  mobileSide?: SheetSide;
  /**
   * Accessible title. REQUIRED — vaul/Radix needs a Dialog.Title in the tree.
   * A string renders as the styled header title; pass `hideTitle` to keep it
   * for screen-readers only.
   */
  title: React.ReactNode;
  /** Render the title for screen-readers only. */
  hideTitle?: boolean;
  /** Optional description (announced + shown under title). */
  description?: React.ReactNode;
  /** Hide the top-right close affordance. */
  hideClose?: boolean;
  /** Show the drag handle (default: only on bottom/top). */
  showHandle?: boolean;
  /** Optional snap points for a partial-height bottom sheet, e.g. [0.4, 1]. */
  snapPoints?: (number | string)[];
  /**
   * iOS-native half-height detent for `side='bottom'` sheets. When `true` (the
   * default for bottom sheets), the sheet opens to a 50% detent the user can
   * drag up to full height — instead of slamming to full height on open.
   * Ignored when explicit `snapPoints` are passed, when `side !== 'bottom'`,
   * or when set to `false` (restores the old full-height behavior).
   * @default true (bottom sheets only)
   */
  peek?: boolean;
  /** Whether the sheet is dismissible by drag / scrim. Default true. */
  dismissible?: boolean;
  /** Sheet content. */
  children?: React.ReactNode;
  /** Extra classes merged (last-wins) onto the panel. */
  className?: string;
  'data-slot'?: string;
}

function SheetRoot({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  side = 'bottom',
  mobileSide,
  title,
  hideTitle = false,
  description,
  hideClose = false,
  showHandle,
  snapPoints,
  peek,
  dismissible = true,
  children,
  className,
  'data-slot': dataSlot = 'sheet',
}: SheetProps) {
  const titleIsString = typeof title === 'string';

  // Below `md`, `mobileSide` (when given) overrides `side` — e.g. a desktop
  // docked `side="right"` panel becomes a bottom sheet on phone for free.
  // `mobileSide` absent ⇒ `resolvedSide === side` always, regardless of
  // viewport, so default behavior never reads `isDesktop` at all.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const resolvedSide: SheetSide = mobileSide !== undefined && !isDesktop ? mobileSide : side;

  const handleVisible =
    showHandle ?? (resolvedSide === 'bottom' || resolvedSide === 'top');

  // iOS-native detents: bottom sheets open to a half-height peek the user can
  // drag up. Explicit `snapPoints` always win; `peek={false}` opts out back to
  // full-height. vaul manages the active snap point uncontrolled, so consumers
  // need no extra wiring — purely additive.
  const resolvedSnapPoints =
    snapPoints ??
    (resolvedSide === 'bottom' && peek !== false ? [0.5, 1] : undefined);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
      direction={resolvedSide}
      snapPoints={resolvedSnapPoints}
      dismissible={dismissible}
      modal
    >
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}

      <Drawer.Portal>
        {/* Cheap dim warm scrim — not blurred (§4.3 perf). */}
        <Drawer.Overlay
          className="fixed inset-0"
          style={{
            zIndex: FW_Z.overlay,
            backgroundColor: 'oklch(0.18 0.01 50 / 0.32)',
          }}
        />

        <Drawer.Content
          data-slot={dataSlot}
          // fairway-ds scope = warm tokens/fonts for everything inside.
          className={cn(
            'fairway-ds fixed flex flex-col outline-none',
            'bg-elevated text-text-primary shadow-fw-modal',
            SIDE_CLASS[resolvedSide],
            className,
          )}
          style={{ zIndex: FW_Z.modal }}
        >
          {handleVisible && resolvedSide === 'bottom' ? (
            <div className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" />
          ) : null}

          {/* a11y title always present; visually-hidden when asked / non-string. */}
          {hideTitle || !titleIsString ? (
            <Drawer.Title className="sr-only">
              {titleIsString ? title : 'Sheet'}
            </Drawer.Title>
          ) : null}

          {!hideTitle && (titleIsString || description) ? (
            <SheetHeader>
              {titleIsString ? <SheetTitle>{title}</SheetTitle> : null}
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : null}
            </SheetHeader>
          ) : description ? (
            <Drawer.Description className="sr-only">
              {description}
            </Drawer.Description>
          ) : null}

          {children}

          {!hideClose ? (
            <Drawer.Close
              aria-label="Close"
              className={cn(
                CLOSE_BUTTON_CLASS,
                // Invisible hit-slop expands the tap target to 44px without
                // changing the 36px visual (iOS touch floor, §7.4). The button
                // is already `absolute`, so it establishes the positioning
                // context for `::before` — no extra `relative` needed.
                "before:absolute before:-inset-1.5 before:content-['']",
                'absolute right-4 top-4',
              )}
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </Drawer.Close>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
SheetRoot.displayName = 'Sheet';

/* ── compound parts ──────────────────────────────────────────────────────── */

const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-header"
    className={cn('flex flex-col gap-1.5 px-6 pt-5 pb-4 pr-14', className)}
    {...props}
  />
));
SheetHeader.displayName = 'Sheet.Header';

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Drawer.Title>
>(({ className, ...props }, ref) => (
  <Drawer.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn(
      'font-fw-display text-h2 font-medium tracking-[-0.005em] text-text-primary',
      className,
    )}
    {...props}
  />
));
SheetTitle.displayName = 'Sheet.Title';

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Drawer.Description>
>(({ className, ...props }, ref) => (
  <Drawer.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn('font-fw-sans text-body text-text-secondary', className)}
    {...props}
  />
));
SheetDescription.displayName = 'Sheet.Description';

const SheetBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-body"
    className={cn(
      'flex-1 overflow-y-auto px-6 py-2 font-fw-sans text-body text-text-secondary',
      // When the body is the last child it owns the bottom edge → keep its
      // content clear of the iOS home indicator.
      'first:pt-6 last:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
      className,
    )}
    {...props}
  />
));
SheetBody.displayName = 'Sheet.Body';

const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-footer"
    className={cn(
      'flex flex-col-reverse gap-2 px-6 pt-4 sm:flex-row sm:justify-end',
      // Footer pins the bottom edge → pad past the iOS home indicator.
      'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
      'border-t border-border-subtle',
      className,
    )}
    {...props}
  />
));
SheetFooter.displayName = 'Sheet.Footer';

const SheetCloseAction = Drawer.Close;

/* ── public compound component ───────────────────────────────────────────── */

type SheetComponent = typeof SheetRoot & {
  Header: typeof SheetHeader;
  Title: typeof SheetTitle;
  Description: typeof SheetDescription;
  Body: typeof SheetBody;
  Footer: typeof SheetFooter;
  Close: typeof SheetCloseAction;
};

export const Sheet = SheetRoot as SheetComponent;
Sheet.Header = SheetHeader;
Sheet.Title = SheetTitle;
Sheet.Description = SheetDescription;
Sheet.Body = SheetBody;
Sheet.Footer = SheetFooter;
Sheet.Close = SheetCloseAction;
