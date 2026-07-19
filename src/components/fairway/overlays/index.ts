/**
 * ============================================================================
 * Fairway · Overlays — public barrel
 * ----------------------------------------------------------------------------
 * The overlay family. Escalation rule (lightest wins):
 *
 *      PopoverPanel  <  Sheet  <  ModalShell
 *
 *   • PopoverPanel — anchored, non-blocking quick panel (Radix Popover).
 *   • Sheet        — side/bottom drawer for a focused task (vaul).
 *   • ModalShell   — the ONE blocking modal (Radix Dialog) that retires the
 *                    27 hand-rolled ones: focus trap, Esc, restore focus,
 *                    scroll-lock, GlassSurface scrim.
 *
 * Importing this barrel also pulls in the warm Liquid-Glass CSS recipes +
 * their reduced-transparency / forced-colors fallbacks (additive, namespaced
 * `.fw-glass-*` classes only).
 * ============================================================================
 */

import './fairway-overlays.css';

export { ModalShell } from './ModalShell';
export type { ModalShellProps, ModalShellSize } from './ModalShell';

export { DiscardChangesModal } from './DiscardChangesModal';
export type { DiscardChangesModalProps } from './DiscardChangesModal';

export { Sheet } from './Sheet';
export type { SheetProps, SheetSide } from './Sheet';

export { PopoverPanel } from './PopoverPanel';
export type {
  PopoverPanelProps,
  PopoverPanelSurface,
} from './PopoverPanel';
