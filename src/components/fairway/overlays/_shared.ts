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
export const DUR_FAST = 0.18;
export const DUR_BASE = 0.28;
export const DUR_MEDIUM = 0.38;
export const DUR_SLOW = 0.52;

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
 * @param reduced result of useReducedMotion()
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
