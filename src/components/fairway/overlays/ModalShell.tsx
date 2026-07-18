'use client';

/**
 * ============================================================================
 * Fairway · ModalShell — the ONE modal (retires the 27 hand-rolled ones)
 * ----------------------------------------------------------------------------
 * A single Radix-Dialog wrapper that gives every blocking modal in the app the
 * same correct behavior + warm-premium look:
 *
 *   • Focus TRAP + focus RESTORE on close      (Radix Dialog, free)
 *   • Escape to close, scrim-click to close    (Radix Dialog, free)
 *   • Body scroll-lock while open              (Radix Dialog, free)
 *   • Cheap dim warm scrim (NOT blurred — §4.3 perf rule)
 *   • `.glass-strong` Elevated body, rounded-lg (28px), shadow-modal
 *   • Slow cinematic materialize (opacity + scale 0.97→1), prefers-reduced-motion honored
 *   • Green focus-visible ring that survives black + cream (§7.2)
 *   • Header / Body / Footer / Title / Description compound parts
 *
 * Animation: Radix mounts with `forceMount` so framer-motion's <AnimatePresence>
 * owns the enter/exit (Radix's CSS data-state animations are bypassed). The open
 * state is controlled internally (or by the caller) and AnimatePresence keeps the
 * tree mounted through the exit tween before Radix unmounts.
 *
 * Escalation: PopoverPanel < Sheet < ModalShell. Use this ONLY when the user
 * must deal with the overlay before continuing.
 * ============================================================================
 */

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FW_Z,
  scrimVariants,
  scrimTransition,
  panelVariants,
  panelVariantsReduced,
  panelTransition,
  GLASS_STRONG_CLASS,
  CLOSE_BUTTON_CLASS,
} from './_shared';

/* ── size variants ────────────────────────────────────────────────────────── */

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-[min(56rem,calc(100vw-2rem))]',
} as const;

export type ModalShellSize = keyof typeof SIZE_CLASS;

export interface ModalShellProps {
  /** Controlled open state. Omit for uncontrolled (use with `trigger`). */
  open?: boolean;
  /** Open-change handler (fires on Esc, scrim click, close button, trigger). */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled default open state. */
  defaultOpen?: boolean;
  /** Optional trigger element (rendered via Radix `asChild`). */
  trigger?: React.ReactNode;
  /** Max-width preset. Default `md`. */
  size?: ModalShellSize;
  /**
   * Accessible title. REQUIRED for a11y. Either pass a string (rendered as the
   * styled `ModalShell.Title`) or render your own `<ModalShell.Title>` in
   * `children` and pass a string here for the visually-hidden fallback — Radix
   * requires a Dialog.Title in the tree.
   */
  title: React.ReactNode;
  /** When `title` is custom JSX you place in the body, hide the auto header title. */
  hideTitle?: boolean;
  /** Optional description (announced to screen readers + shown under title). */
  description?: React.ReactNode;
  /** Hide the top-right close affordance (e.g. forced-choice confirms). */
  hideClose?: boolean;
  /** Modal body content. */
  children?: React.ReactNode;
  /** Extra classes merged (last-wins) onto the modal panel. */
  className?: string;
  /** data-slot override for instrumentation. */
  'data-slot'?: string;
}

function ModalShellRoot({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  size = 'md',
  title,
  hideTitle = false,
  description,
  hideClose = false,
  children,
  className,
  'data-slot': dataSlot = 'modal-shell',
}: ModalShellProps) {
  const reduced = useReducedMotion() ?? false;

  // Track presence ourselves so framer-motion can run the exit tween before
  // Radix unmounts the forceMount tree.
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

  const titleIsString = typeof title === 'string';

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}

      <AnimatePresence>
        {isOpen ? (
          <Dialog.Portal forceMount>
            {/* Cheap dim warm scrim — NOT blurred (§4.3 perf). */}
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0"
                style={{
                  zIndex: FW_Z.modal,
                  backgroundColor: 'oklch(0.18 0.01 50 / 0.32)',
                }}
                variants={scrimVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={scrimTransition(reduced)}
              />
            </Dialog.Overlay>

            <Dialog.Content
              asChild
              forceMount
              // The fairway-ds scope gives child elements the warm tokens/fonts.
              className="fairway-ds"
              aria-describedby={description ? undefined : ''}
            >
              <motion.div
                data-slot={dataSlot}
                role="dialog"
                // `position: fixed` is set inline because `.fw-glass-strong` is an
                // UNLAYERED rule that sets `position: relative` — and unlayered CSS
                // wins over Tailwind's `@layer utilities` `.fixed`. Centering uses
                // `inset-0 m-auto` (auto-margin) instead of `-translate-*` so the
                // framer-motion enter transform (scale/y) can't clobber it.
                style={{ zIndex: FW_Z.modal, position: 'fixed' }}
                className={cn(
                  'fixed inset-0 m-auto h-fit w-[calc(100vw-2rem)]',
                  'max-h-[calc(100dvh-4rem)] overflow-hidden',
                  'rounded-fw-lg text-text-primary',
                  'flex flex-col',
                  GLASS_STRONG_CLASS,
                  SIZE_CLASS[size],
                  className,
                )}
                variants={reduced ? panelVariantsReduced : panelVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={panelTransition(reduced, true)}
              >
                {/* Always render a Dialog.Title for a11y; visually hide if asked. */}
                {hideTitle || !titleIsString ? (
                  <Dialog.Title className="sr-only">
                    {titleIsString ? title : 'Dialog'}
                  </Dialog.Title>
                ) : null}

                {!hideTitle && (titleIsString || description) ? (
                  <ModalHeader>
                    {titleIsString ? <ModalTitle>{title}</ModalTitle> : null}
                    {description ? (
                      <ModalDescription>{description}</ModalDescription>
                    ) : null}
                  </ModalHeader>
                ) : description ? (
                  <Dialog.Description className="sr-only">
                    {description}
                  </Dialog.Description>
                ) : null}

                {children}

                {!hideClose ? (
                  <Dialog.Close
                    aria-label="Close"
                    className={cn(
                      CLOSE_BUTTON_CLASS,
                      // Invisible hit-slop expands the tap target to 44px
                      // without changing the 36px visual (iOS touch floor,
                      // §7.4). The button is already `absolute`, so it is the
                      // positioning context for `::before` — no `relative` needed.
                      "before:absolute before:-inset-1.5 before:content-['']",
                      'absolute right-4 top-4',
                    )}
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </Dialog.Close>
                ) : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
ModalShellRoot.displayName = 'ModalShell';

/* ── compound parts ──────────────────────────────────────────────────────── */

const ModalHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="modal-shell-header"
    className={cn(
      'flex flex-col gap-1.5 px-6 pt-6 pb-4 pr-14',
      className,
    )}
    {...props}
  />
));
ModalHeader.displayName = 'ModalShell.Header';

const ModalTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    data-slot="modal-shell-title"
    className={cn(
      'font-fw-display text-h2 font-medium tracking-[-0.005em] text-text-primary',
      className,
    )}
    {...props}
  />
));
ModalTitle.displayName = 'ModalShell.Title';

const ModalDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    data-slot="modal-shell-description"
    className={cn('font-fw-sans text-body text-text-secondary', className)}
    {...props}
  />
));
ModalDescription.displayName = 'ModalShell.Description';

const ModalBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="modal-shell-body"
    className={cn(
      // `flex-auto min-h-0`, NOT `flex-1`: the panel column is `h-fit`
      // (height: fit-content), and iOS Safari resolves flex-1's percentage
      // basis (0%) against that as a literal 0 — the body rendered ~0px tall,
      // its content clipped to a sliver, on iPhone while desktop engines
      // sized it from content (owner report 2026-07-18: the aspect drill-down
      // showed title + a clipped chip strip + Done and nothing else; Sheet
      // bodies — plain auto-height, no h-fit — never collapsed). `flex-auto`
      // sizes from content in every engine, then shrinks (min-h-0) into the
      // panel's max-h cap where overflow-y-auto takes over — identical layout
      // where it already worked, unbroken on iOS.
      'min-h-0 flex-auto overflow-y-auto px-6 py-2 font-fw-sans text-body text-text-secondary',
      // breathing room when there is no header/footer
      'first:pt-6 last:pb-6',
      className,
    )}
    {...props}
  />
));
ModalBody.displayName = 'ModalShell.Body';

const ModalFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="modal-shell-footer"
    className={cn(
      'flex flex-col-reverse gap-2 px-6 pt-4 sm:flex-row sm:justify-end',
      className,
    )}
    // Safe-area bottom inset so the footer buttons are never clipped by the
    // iPhone home indicator (Capacitor contentInset:'never' means the web
    // code is responsible for honouring env(safe-area-inset-bottom)).
    style={{
      paddingBottom: 'max(1.5rem, calc(1rem + env(safe-area-inset-bottom)))',
      ...style,
    }}
    {...props}
  />
));
ModalFooter.displayName = 'ModalShell.Footer';

/** Radix Close passthrough for footer "Cancel"/"Done" buttons (asChild). */
const ModalCloseAction = Dialog.Close;

/* ── public compound component ───────────────────────────────────────────── */

type ModalShellComponent = typeof ModalShellRoot & {
  Header: typeof ModalHeader;
  Title: typeof ModalTitle;
  Description: typeof ModalDescription;
  Body: typeof ModalBody;
  Footer: typeof ModalFooter;
  Close: typeof ModalCloseAction;
};

export const ModalShell = ModalShellRoot as ModalShellComponent;
ModalShell.Header = ModalHeader;
ModalShell.Title = ModalTitle;
ModalShell.Description = ModalDescription;
ModalShell.Body = ModalBody;
ModalShell.Footer = ModalFooter;
ModalShell.Close = ModalCloseAction;
