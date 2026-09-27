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
 *   • OPAQUE `Surface` body (sheets carry content/forms → never glass, §4.3),
 *     warm border, shadow-modal; cheap dim warm scrim (not blurred)
 *   • focus moves INTO the sheet on open and back to the opener on close
 *     (useDialogFocus — vaul cancels Radix's autofocus by default)
 *   • body `overscroll-behavior: contain` so a scroll never chains to the
 *     page behind (page rubber-band is on)
 *   • optional HIG header row: `leadingAction` (Cancel) · title ·
 *     `trailingAction` (primary) — replaces the corner close button
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
import {
  FW_Z,
  CLOSE_BUTTON_CLASS,
  SURFACE_CLASS,
  ModalPortalContext,
  useDialogFocus,
  preventEscapeWhilePopupOpen,
} from './_shared';

export type SheetSide = 'bottom' | 'top' | 'left' | 'right';

/** Per-side panel position + leading-edge radius + slide axis sizing. */
// The soft keyboard never resizes the WebView (`resize: 'ionic'`, no
// <ion-app>), and Safari never resizes its layout viewport, so a sheet pinned
// to `bottom-0` sits under the keys the moment a field inside it is tapped —
// 27 sheets/modals carry text inputs (audit 2026-09-02). Every edge that
// touches the bottom of the screen is lifted by the `--keyboard-height`
// CapacitorProvider publishes (0px on desktop and with the keyboard down),
// and the bottom sheet's cap shrinks by the same amount so it still clears
// the status bar. The 250 ms `bottom` transition tracks the keyboard's own
// slide; vaul's inline transform transition is only present while it opens
// or closes, so the two never fight.
const KEYBOARD_LIFT =
  'bottom-[var(--keyboard-height,0px)] transition-[bottom] duration-[250ms] motion-reduce:transition-none ';

const SIDE_CLASS: Record<SheetSide, string> = {
  bottom:
    KEYBOARD_LIFT +
    'inset-x-0 mt-24 max-h-[calc(88dvh-var(--keyboard-height,0px))] rounded-t-fw-lg ' +
    'border-t border-border-subtle',
  top:
    'inset-x-0 top-0 mb-24 max-h-[88dvh] rounded-b-fw-lg ' +
    'border-b border-border-subtle',
  left:
    KEYBOARD_LIFT +
    'top-0 left-0 mr-24 w-[min(26rem,calc(100vw-3rem))] rounded-r-fw-lg ' +
    'border-r border-border-subtle',
  right:
    KEYBOARD_LIFT +
    'top-0 right-0 ml-24 w-[min(26rem,calc(100vw-3rem))] rounded-l-fw-lg ' +
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
  /**
   * The children render their own visible `<Sheet.Title>` (a custom header
   * with an eyebrow, badge or bespoke layout). Skips the automatic title —
   * both the styled header and the sr-only fallback — so the dialog has
   * exactly ONE `Drawer.Title` (two would share Radix's title id). `title`
   * is still required so the prop contract reads the same at every site.
   */
  customTitle?: boolean;
  /** Optional description (announced + shown under title). */
  description?: React.ReactNode;
  /** Hide the top-right close affordance. */
  hideClose?: boolean;
  /**
   * HIG sheet header: a leading action (typically a Cancel button) left of
   * the centred title. Supplying either action switches the header to the
   * three-slot nav-bar row and drops the corner close button — Cancel is the
   * close affordance then.
   */
  leadingAction?: React.ReactNode;
  /** HIG sheet header: the trailing primary action (Save / Add / Done). */
  trailingAction?: React.ReactNode;
  /** Show the drag handle (default: only on bottom/top). */
  showHandle?: boolean;
  /** Optional snap points for a partial-height bottom sheet, e.g. [0.4, 1]. */
  snapPoints?: (number | string)[];
  /**
   * OPT-IN iOS-native half-height detent for `side='bottom'` sheets. When
   * `true`, the sheet opens to a 50% detent the user can drag up to full
   * height, via vaul's numeric `snapPoints`.
   *
   * Defaults to `false` — audit W2: vaul's fraction snap points compute their
   * translateY offset from the VIEWPORT height (`window.innerHeight`), on the
   * assumption the drawer itself renders at ~that height. This primitive
   * instead sizes bottom sheets to their CONTENT (shrink-wrap, capped by
   * `max-h-[88dvh]`, per SIDE_CLASS.bottom) — a deliberately shorter box for
   * anything but a near-full-height sheet. Combining the two produced the
   * reported bug: the peek-state offset overshoots/undershoots the real
   * content height, leaving screen-heights of dead space, AND — since vaul's
   * own CSS forces the scrim to `opacity: 0` at every snap point except the
   * final ("full") one — the page underneath rendered completely un-scrimmed
   * until the user dragged all the way up. Every current consumer had
   * already discovered this and opted out by hand (`peek={false}`); this
   * flips the primitive's default to match instead of trusting each new
   * consumer to remember the workaround. Only re-enable for a sheet whose
   * content genuinely fills most of the viewport — otherwise you'll
   * reproduce the exact bug this default now prevents.
   * Ignored when explicit `snapPoints` are passed or when `side !== 'bottom'`.
   * @default false
   */
  peek?: boolean;
  /** Whether the sheet is dismissible by drag / scrim. Default true. */
  dismissible?: boolean;
  /**
   * Skip vaul's Safari-only `position: fixed` body hack. The WKWebView has
   * no collapsing toolbar for it to protect, and the hack re-lays out the
   * page behind the scrim on open/close (motion spec §6.1 #7). OPT-IN so
   * existing sheets keep today's behaviour.
   * @default false
   */
  noBodyStyles?: boolean;
  /**
   * Fires once after the sheet has finished closing, for EVERY close path
   * (Escape, scrim, drag, Cancel, or a parent flipping `open` to false).
   * Driven by the panel's `transform` transitionend while closed, with a
   * 600 ms fallback for reduced motion / no transition. Use it for cleanup
   * that must not flash mid-exit (resetting a form, clearing a selection).
   */
  onExited?: () => void;
  /**
   * Escape pressed while the sheet is the top layer and no nested popup is
   * open. Runs before the sheet closes; `preventDefault()` keeps it open.
   * With `dismissible={false}` it is the only Escape signal a caller gets,
   * e.g. to ask "Discard your changes?" instead of closing.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Sheet content. */
  children?: React.ReactNode;
  /** Extra classes merged (last-wins) onto the panel. */
  className?: string;
  'data-slot'?: string;
  /** CSS animation lifecycle for consumers deferring nonessential work. */
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
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
  customTitle = false,
  description,
  hideClose = false,
  leadingAction,
  trailingAction,
  showHandle,
  snapPoints,
  peek,
  dismissible = true,
  noBodyStyles = false,
  onExited,
  onEscapeKeyDown,
  children,
  className,
  'data-slot': dataSlot = 'sheet',
  onAnimationEnd,
}: SheetProps) {
  const titleIsString = typeof title === 'string';
  const navHeader = leadingAction != null || trailingAction != null;
  const focus = useDialogFocus();
  // Same portal-container wiring as ModalShell / ui/drawer: a floating popup
  // (fairway/forms Select, Combobox, date picker) rendered inside this sheet
  // must portal INTO the Drawer.Content subtree, or Radix's focus trap and
  // outside-pointer layer treat it as "outside" (dead dropdown / tapping an
  // option dismisses the sheet). State, not a ref, so children re-render.
  const [contentNode, setContentNode] = React.useState<HTMLDivElement | null>(null);

  // Open state as the sheet sees it — the prop when controlled, otherwise
  // tracked through onOpenChange — so onExited can tell a close apart.
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isOpen = isControlled ? !!open : uncontrolledOpen;
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const onExitedRef = React.useRef(onExited);
  React.useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);
  // The panel node, readable from the close effect without making it a
  // dependency: Radix unmounts the panel when the exit ends, and that node
  // change must not cancel the pending onExited.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const setPanelNode = React.useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setContentNode(node);
  }, []);
  const wasOpen = React.useRef(isOpen);
  React.useEffect(() => {
    const closing = wasOpen.current && !isOpen;
    wasOpen.current = isOpen;
    if (!closing) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onExitedRef.current?.();
    };
    const node = panelRef.current;
    const onEnd = (event: TransitionEvent) => {
      if (event.target === node && event.propertyName === 'transform') finish();
    };
    node?.addEventListener('transitionend', onEnd);
    // Fallback: reduced motion, no transition, or the panel unmounted first.
    const fallback = window.setTimeout(finish, 600);
    return () => {
      // Re-opened (or the Sheet itself unmounted) before the exit finished.
      done = true;
      window.clearTimeout(fallback);
      node?.removeEventListener('transitionend', onEnd);
    };
  }, [isOpen]);

  // Below `md`, `mobileSide` (when given) overrides `side` — e.g. a desktop
  // docked `side="right"` panel becomes a bottom sheet on phone for free.
  // `mobileSide` absent ⇒ `resolvedSide === side` always, regardless of
  // viewport, so default behavior never reads `isDesktop` at all.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const resolvedSide: SheetSide = mobileSide !== undefined && !isDesktop ? mobileSide : side;

  const handleVisible =
    showHandle ?? (resolvedSide === 'bottom' || resolvedSide === 'top');

  // iOS-native detents: OPT-IN. `peek={true}` on a bottom sheet asks for the
  // vaul half-height-drag-to-full behavior via numeric snapPoints; explicit
  // `snapPoints` always win over `peek`. Defaults to off (see `peek` doc
  // comment — audit W2 content-vs-viewport height mismatch).
  const resolvedSnapPoints =
    snapPoints ??
    (resolvedSide === 'bottom' && peek === true ? [0.5, 1] : undefined);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      defaultOpen={defaultOpen}
      direction={resolvedSide}
      noBodyStyles={noBodyStyles}
      snapPoints={resolvedSnapPoints}
      dismissible={dismissible}
      modal
      // vaul defaults this to false and then cancels Radix's open-autofocus,
      // leaving focus on the page behind. useDialogFocus owns the policy
      // (container focus on touch — never a text field, so no keyboard pop).
      // eslint-disable-next-line jsx-a11y/no-autofocus -- vaul's dialog-focus flag, not the HTML autofocus attribute
      autoFocus
    >
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}

      <Drawer.Portal>
        {/* Cheap dim warm scrim — not blurred (§4.3 perf). */}
        <Drawer.Overlay
          data-slot={`${dataSlot}-overlay`}
          className="fixed inset-0"
          style={{
            zIndex: FW_Z.overlay,
            backgroundColor: 'oklch(0.18 0.01 50 / 0.32)',
          }}
        />

        <Drawer.Content
          ref={setPanelNode}
          data-slot={dataSlot}
          onAnimationEnd={onAnimationEnd}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            preventEscapeWhilePopupOpen(event, contentNode);
            if (!event.defaultPrevented) onEscapeKeyDown?.(event);
          }}
          // Lifted above the keyboard by SIDE_CLASS; the provider's global
          // keyboardWillShow scroll-into-view must not also scroll the page
          // behind the scrim.
          data-fw-keyboard-aware
          // fairway-ds scope = warm tokens/fonts for everything inside.
          className={cn(
            'fairway-ds fixed flex flex-col outline-none',
            SURFACE_CLASS,
            'text-text-primary',
            SIDE_CLASS[resolvedSide],
            className,
          )}
          style={{ zIndex: FW_Z.modal }}
        >
          {handleVisible && resolvedSide === 'bottom' ? (
            <div aria-hidden data-slot="sheet-grabber" className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" />
          ) : null}

          {/* a11y title always present; visually-hidden when asked / non-string. */}
          {!customTitle && (hideTitle || !titleIsString) ? (
            <Drawer.Title className="sr-only">
              {titleIsString ? title : 'Sheet'}
            </Drawer.Title>
          ) : null}

          <ModalPortalContext.Provider value={contentNode}>
          {customTitle ? null : navHeader ? (
            <SheetNavHeader
              leading={leadingAction}
              trailing={trailingAction}
              title={
                !hideTitle && titleIsString ? (
                  <SheetTitle className="truncate text-center text-body-lg font-semibold font-fw-sans tracking-normal">
                    {title}
                  </SheetTitle>
                ) : null
              }
              description={description ?? null}
            />
          ) : !hideTitle && (titleIsString || description) ? (
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
          </ModalPortalContext.Provider>

          {!hideClose && !navHeader ? (
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

/**
 * HIG nav-bar header row: [leading] · centred title · [trailing]. The two
 * action columns share one width so the title stays optically centred.
 */
function SheetNavHeader({
  leading,
  trailing,
  title,
  description,
}: {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
}) {
  return (
    <div data-slot="sheet-header" className="shrink-0 border-b border-border-subtle px-4 pt-2 pb-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 justify-start">{leading}</div>
        <div className="min-w-0">{title}</div>
        <div className="flex min-w-0 justify-end">{trailing}</div>
      </div>
      {description ? (
        <SheetDescription className="mt-1 text-center text-body-sm">{description}</SheetDescription>
      ) : null}
    </div>
  );
}

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
      // `flex-auto min-h-0`, NOT `flex-1`: defensive parity with
      // ModalShell.Body, where iOS Safari resolved flex-1's percentage basis
      // (0%) against the panel's intrinsic-keyword height as 0 and collapsed
      // the body (full story there). Sheets size with plain auto height and
      // haven't shown the collapse, but content-based basis + min-h-0 gives
      // the same layout without ever depending on how an engine resolves a
      // percentage basis against an indefinite height.
      'min-h-0 flex-auto overflow-y-auto px-6 py-2 font-fw-sans text-body text-text-secondary',
      // Page rubber-band is ON; a scroll that hits this body's edge must not
      // chain to (and bounce) the page behind the scrim.
      'overscroll-contain',
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
