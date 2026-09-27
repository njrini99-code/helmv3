/**
 * ============================================================================
 * Fairway · Overlays · shared internals (LOCAL to the overlays group)
 * ----------------------------------------------------------------------------
 * Tiny helpers shared ONLY by the overlay primitives (ModalShell / Sheet /
 * PopoverPanel). Intentionally kept inside the overlays folder so no top-level
 * shared file is created that other primitive agents might also touch.
 *
 * Everything here is presentation-only: warm-tinted Liquid Glass recipes (the
 * §4.3 allow-list — overlays are the floating layer, so glass is permitted),
 * the cinematic motion variants honoring prefers-reduced-motion, and the
 * z-ladder tokens. No business logic.
 * ============================================================================
 */

import * as React from 'react';
import type { Variants, Transition } from 'framer-motion';

/* ── Escalation rule (documented, lightest wins) ────────────────────────────
 *
 *      PopoverPanel   <   Sheet   <   ModalShell
 *      (anchored,         (drawer,      (centered, fully
 *       non-modal-ish)     focus-trap)   blocking, scrim)
 *
 * Reach for the LIGHTEST overlay that does the job:
 *   • PopoverPanel — a quick anchored panel (menus, day-detail, quick-pick).
 *                    Dismiss on outside-click/Esc; does NOT block the page.
 *   • Sheet        — a side/bottom drawer for a focused secondary task
 *                    (filters, chat, a detail peek). Draggable, focus-trapped.
 *   • ModalShell   — the ONE blocking modal. Use only when the user MUST deal
 *                    with it before continuing (confirm/destroy, a form that
 *                    owns the screen). Retires the 27 hand-rolled modals.
 * ─────────────────────────────────────────────────────────────────────────── */

/** App-wide z-ladder (mirrors --fw-z-* in design-tokens.css). */
export const FW_Z = {
  overlay: 40,
  modal: 50,
  toast: 60,
  command: 70,
} as const;

/* ── Cinematic easing curves (mirror --fw-ease-* tokens) ──────────────────── */

/** Apple "emphasized" — glass morph / overlay materialize. */
export const EASE_EMPH: Transition['ease'] = [0.32, 0.72, 0, 1];
/** Cinematic settle — sheet / route / hero reveal. */
export const EASE_GLIDE: Transition['ease'] = [0.16, 1, 0.3, 1];
/** Gentle decelerate — default reveal. */
export const EASE_SOFT: Transition['ease'] = [0.22, 0.61, 0.36, 1];

/* ── Durations (seconds, mirror --fw-dur-* tokens) ────────────────────────── */
const DUR_FAST = 0.18;
const DUR_BASE = 0.28;
const DUR_MEDIUM = 0.38;
const DUR_SLOW = 0.52;

/**
 * The dim scrim shared by ModalShell. Per §4.3 a full-viewport modal backdrop
 * is a CHEAP dim scrim (warm near-black, low alpha) — NOT a blurred one (perf).
 * The glass material lives on the modal body, not the scrim.
 */
export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/**
 * Glass overlay panels MATERIALIZE: opacity 0→1 + a gentle scale 0.97→1.
 * (We never animate `backdrop-filter` blur on hover/enter — that janks; the
 * blur is static, the panel just fades+scales in under it.)
 */
export const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

/** Reduced-motion: opacity only, no transform, fast. */
export const panelVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/**
 * Build the enter/exit transition for a glass panel, honoring reduced motion.
 * @param reduced result of useReducedMotionGuard()
 * @param slow    use the slow cinematic duration (modals/sheets) vs medium (popovers)
 */
export function panelTransition(reduced: boolean, slow = false): Transition {
  if (reduced) return { duration: DUR_FAST, ease: 'linear' };
  return { duration: slow ? DUR_SLOW : DUR_MEDIUM, ease: EASE_EMPH };
}

/** Scrim transition — always a touch slower than the panel so it leads in. */
export function scrimTransition(reduced: boolean): Transition {
  return { duration: reduced ? DUR_FAST : DUR_BASE, ease: EASE_SOFT };
}

/* ── Warm Liquid-Glass class recipes (Tailwind arbitrary props on tokens) ───
 *
 * These compose the §4.3 "Regular / Strong" glass material directly from the
 * --fw-glass-* tokens, so the look stays locked to the design system and
 * degrades correctly under prefers-reduced-transparency / forced-colors via
 * the @media fallbacks declared in fairway-overlays.css (imported by index).
 * Cream-tinted over cream — never white over gray.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Strong glass (modals / command palette): more opaque = more legible. */
export const GLASS_STRONG_CLASS = 'fw-glass-strong';
/** Regular glass (popovers / lighter floating chrome). */
export const GLASS_REGULAR_CLASS = 'fw-glass-regular';

/** Shared focus-visible ring that survives black + cream (green, 2px + offset). */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-elevated';

/** Minimum-size + interactive-state recipe for the close affordance (>=24px target, §7.4). */
export const CLOSE_BUTTON_CLASS =
  'inline-flex h-9 w-9 min-h-[24px] min-w-[24px] items-center justify-center rounded-full ' +
  'text-text-tertiary transition-colors duration-fast ' +
  'hover:bg-surface-sunken hover:text-text-secondary ' +
  'active:translate-y-[0.5px] ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  FOCUS_RING;

/* ── Portal-container context (focus-trap fix) ───────────────────────────────
 *
 * Radix's Dialog FocusScope traps focus via real DOM containment
 * (`container.contains(target)`), not React-tree containment (verified:
 * @radix-ui/react-focus-scope). A floating popup (Select, Combobox, …) that
 * portals to `document.body` by default renders as a DOM SIBLING of the
 * Dialog, not a descendant — so the instant the popup tries to take/keep
 * focus, FocusScope's document-wide `focusin` listener sees focus land
 * outside its container and yanks it straight back into the modal. The
 * popup becomes unusable: options can't be focused or clicked-through. This
 * is the "dead dropdown inside a modal" bug class (CoachHelm Prescribe
 * focus-area modal, 2026-07-21).
 *
 * ModalShell — and the vaul-backed Drawer in src/components/ui/drawer.tsx,
 * which wraps the SAME @radix-ui/react-dialog primitive internally and so
 * inherits the identical trap — provide the DOM node of their own
 * Dialog.Content/Drawer.Content here once mounted. A floating popup
 * consumes it (e.g. fairway/forms/Select.tsx passes it as Base UI Select's
 * `Portal container` prop) so its popup renders as a genuine DOM descendant
 * of the overlay instead of a document.body sibling — Base UI Select (via
 * floating-ui) is containing-block-aware, so this works correctly even
 * though the overlay panel itself is a transformed/animated ancestor.
 *
 * `null` outside any overlay (the default) — consumers MUST treat `null` as
 * "no override, use the floating library's own default (document.body)",
 * never pass `null` straight through as an explicit portal `container` prop
 * (libraries built on floating-ui-react treat an explicit `null` container
 * as "wait for a real target", not "use body", which would silently break
 * every standalone Select outside a modal).
 * ─────────────────────────────────────────────────────────────────────────── */
export const ModalPortalContext = React.createContext<HTMLElement | null>(null);

/* ── Material: content surfaces are OPAQUE ───────────────────────────────────
 *
 * Glass (backdrop blur over translucent fill) is for chrome only: the
 * translucent nav bar, a floating toolbar. A modal or sheet that carries
 * reading content or form fields is a content surface and must be opaque —
 * otherwise the page behind reads through the labels and inputs (audit
 * 2026-09-23, the see-through New-goal sheet). `glass` stays available as an
 * explicit opt-in for chrome-like overlays only.
 * ─────────────────────────────────────────────────────────────────────────── */
export type OverlayMaterial = 'surface' | 'glass';

/** Opaque content surface: --fw-color-surface, hairline, modal shadow. */
export const SURFACE_CLASS = 'bg-surface border border-border-subtle shadow-fw-modal';

/* ── Dialog focus: move in on open, return to the opener on close ────────────
 *
 * Radix Dialog (and vaul, which wraps it) gets both wrong in this app:
 *   • vaul's Root defaults `autoFocus` to false, and its Content then calls
 *     `preventDefault()` on Radix's open-autofocus — focus stays on the page
 *     behind every Sheet / Drawer (More, Log progress, event detail).
 *   • Radix's modal `onCloseAutoFocus` returns focus to `triggerRef`, which is
 *     null for every overlay driven by external `open` state (no
 *     Dialog.Trigger) — focus drops to <body> on close.
 *
 * Callers must ALSO pass `autoFocus` to vaul's Root so vaul stops cancelling
 * the open event. Behavior:
 *   • open, fine pointer  → Radix default: first tabbable element, or the
 *     content container (FocusScope renders it with tabIndex=-1).
 *   • open, coarse pointer → the content container itself: focusing a text
 *     field on touch summons the iOS keyboard over the sheet just opened
 *     (owner TestFlight report 2026-08-26, same rule as ModalShell).
 *   • close → the element focused when the dialog opened, if still attached;
 *     otherwise Radix's default (correct for a real Dialog.Trigger).
 *
 * The opener is captured inside onOpenAutoFocus: FocusScope dispatches that
 * event BEFORE it moves focus, so `document.activeElement` is still the
 * opener — this works for controlled and uncontrolled roots alike.
 * ─────────────────────────────────────────────────────────────────────────── */
export interface DialogFocusHandlers {
  onOpenAutoFocus: (event: Event) => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function useDialogFocus(
  user?: Partial<DialogFocusHandlers>,
): DialogFocusHandlers {
  const openerRef = React.useRef<HTMLElement | null>(null);
  const userRef = React.useRef(user);
  userRef.current = user;

  const onOpenAutoFocus = React.useCallback((event: Event) => {
    const active = document.activeElement;
    openerRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    userRef.current?.onOpenAutoFocus?.(event);
    if (event.defaultPrevented) return;
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      event.preventDefault();
      (event.target as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }, []);

  const onCloseAutoFocus = React.useCallback((event: Event) => {
    userRef.current?.onCloseAutoFocus?.(event);
    if (event.defaultPrevented) {
      openerRef.current = null;
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      event.preventDefault();
      opener.focus({ preventScroll: true });
    }
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}

/** The nearest ModalShell/Drawer's content DOM node, or `null` outside one. */
export function useModalPortalContainer(): HTMLElement | null {
  return React.useContext(ModalPortalContext);
}

/**
 * Escape = one level per keypress. Radix's dialog listens for Escape on
 * `document` in the CAPTURE phase, before a nested Base UI popup (Select,
 * Combobox) sees it, so one press closed the popup AND the sheet. While any
 * descendant carries Base UI's `data-popup-open`, cancel the dialog-level
 * dismiss; the popup's own listener still closes it, and the next Escape
 * reaches the dialog. Same guard as ModalShell's handleContentEscapeKeyDown.
 */
export function preventEscapeWhilePopupOpen(
  event: KeyboardEvent,
  contentNode: HTMLElement | null,
): void {
  if (contentNode?.querySelector('[data-popup-open]')) event.preventDefault();
}
