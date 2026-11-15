/**
 * The thread as three layers (MSG-201, MSG-203, MSG-307; the artifact's chapter "Three layers: page, bubbles, controls"):
 * the message scroller fills the page and runs under a top bar and the floating composer, so the numbers that keep the first
 * and last message clear of them, the bar's hairline state and the keyboard ride are decided here, as pure functions the
 * hook (`use-thread-layers.ts`) and the unit tests both read.
 */
import { PIN_PX } from '../motion/messages-beats';
import { KEYBOARD_EASE, KEYBOARD_MS } from '../motion/messages-motion';

export type LayerKind = 'phone' | 'desk';

/** The artifact's `--pad-top` / `--pad-bot`, used before the bars are measured (and where nothing can be: a server render, jsdom). */
export const LAYER_PAD = { phone: { top: 132, bottom: 104 }, desk: { top: 76, bottom: 92 } } as const;
/** How far the first message sits below the bar (phone: 132 under a 104 bar; desk: 76 under a 64 bar). */
export const BAR_CLEAR_PX = { phone: 28, desk: 12 } as const;
/** How far the last message sits above the composer (phone: 104 over an 84 composer; desk: 92 over a 74 one). */
export const COMPOSER_CLEAR_PX = { phone: 20, desk: 18 } as const;

/** The bar's hairline shows once the content has moved under it by this much (the artifact: `scrollTop < 2` is flat). */
export const FLAT_SCROLL_PX = 2;
export const barIsFlat = (scrollTop: number): boolean => scrollTop < FLAT_SCROLL_PX;

export interface LayerPaddingInput {
  kind: LayerKind;
  /** The bar's measured height (0 when not measured). */
  barHeight: number;
  /** The composer's measured border-box height (0 when not measured). */
  composerHeight: number;
}

/**
 * `--pad-top` and `--pad-bot` for the scroller's list: what the bars measure plus their clearance, else the artifact's numbers.
 * The composer grows with the draft (and its home-indicator padding), so a measured bottom keeps the last message clear of it.
 * The keyboard's lift is added in CSS (`--ch-ms-kb`), not here, because it must change in the same task the scroll is read.
 */
export function layerPadding({ kind, barHeight, composerHeight }: LayerPaddingInput): { top: number; bottom: number } {
  return {
    top: barHeight > 0 ? Math.round(barHeight + BAR_CLEAR_PX[kind]) : LAYER_PAD[kind].top,
    bottom: composerHeight > 0 ? Math.round(composerHeight + COMPOSER_CLEAR_PX[kind]) : LAYER_PAD[kind].bottom,
  };
}

/** Under this much shrink of the visible area it is not a keyboard (Safari's toolbar collapsing, a pinch), as the shell reads it. */
export const KEYBOARD_MIN_PX = 120;
/** A pinch-zoom shrinks the visible area too; above this scale the viewport is zoomed, not covered. */
export const PINCH_SCALE = 1.01;
/** The composer's bottom padding with the keyboard up: the home indicator's room is gone, 8 px stays. */
export const KEYBOARD_COMPOSER_PAD_PX = 8;

export interface KeyboardReading {
  /** The app (WKWebView): `keyboardWillShow` publishes `--keyboard-height`, and the WebView is not resized. */
  native: boolean;
  /** The layout viewport's height (`documentElement.clientHeight`): what the keyboard covers. */
  layoutHeight: number;
  /** `visualViewport.height` (0 or NaN when there is no visualViewport). */
  viewportHeight: number;
  /** `visualViewport.scale`. */
  scale: number;
  /** `--keyboard-height` as published by the shell (px). */
  published: number;
}

/**
 * How tall the keyboard is. In the app the native event is the source (a hardware keyboard's accessory bar is a keyboard
 * too, so it is not gated); on the web the visual viewport is, with the 120 px gate and the pinch gate, because Safari's
 * toolbar collapsing shrinks it by less. A pinch-zoomed page reads 0 either way.
 */
export function keyboardHeight({ native, layoutHeight, viewportHeight, scale, published }: KeyboardReading): number {
  if (scale > PINCH_SCALE) return 0;
  const covered = Number.isFinite(viewportHeight) && viewportHeight > 0 ? Math.max(0, Math.round(layoutHeight - viewportHeight)) : 0;
  const fromViewport = covered >= KEYBOARD_MIN_PX ? covered : 0;
  const fromShell = Number.isFinite(published) && published > 0 ? Math.round(published) : 0;
  return native ? Math.max(fromShell, fromViewport) : fromViewport;
}

/**
 * How far the composer and the list's floor rise. The composer keeps its home-indicator padding while it rides (its padding
 * never snaps to 8 at the start of the ride, which dipped it about 22 px), so it rises by the keyboard minus the padding that
 * would have dropped away (the artifact: 316 high, 294 lift).
 */
export function rideLift(keyboard: number, composerPaddingBottom: number): number {
  if (keyboard <= 0) return 0;
  return Math.max(0, Math.round(keyboard - Math.max(0, composerPaddingBottom - KEYBOARD_COMPOSER_PAD_PX)));
}

/** Pinned to the bottom: within 24 px of it (the field growing, a chip, the keyboard; MSG-203). */
export const pinnedToBottom = (distanceFromEnd: number): boolean => distanceFromEnd < PIN_PX.grow;

export interface RideShiftInput {
  /** The lift grew (the keyboard came up). */
  opening: boolean;
  /** The reader was pinned to the bottom before the floor moved. */
  atBottom: boolean;
  /** `scrollTop` before the floor moved, and after the thread re-pinned (opening) or the browser clamped (closing). */
  before: number;
  after: number;
}

/**
 * The px the list must start low (positive) or high (negative) so the thread seems to move with the keyboard, not jump: the
 * scroll change the floor's move caused. Opening only counts for a reader pinned to the bottom (anyone reading up stays where
 * they are); closing counts whatever the browser's clamp moved. The artifact's `kbShow`.
 */
export function rideShift({ opening, atBottom, before, after }: RideShiftInput): number {
  if (opening && !atBottom) return 0;
  return after - before;
}

/** MOT-KB-1: the list's glide on the keyboard's own beat (480 ms on `--ch-ease-sheet`); Reduce Motion plays none. */
export function rideTiming(reduced: boolean): { ms: number; easing: string } | null {
  return reduced ? null : { ms: KEYBOARD_MS, easing: KEYBOARD_EASE };
}

/** The list's ride keeps this id so a send or reply (which re-seats the list) can tell it from its own glide. */
export const KB_RIDE_ID = 'ch-ms-kb-ride';

/** MOT-SEND-3: a tap on the thread's page (not a bubble, key or link) lowers the keyboard. */
export const KEYBOARD_KEEPERS = '[data-ch-bubble], .ch-ms-msg__stack, .ch-msv-hoverbar, .ch-msv-seen, .ch-ms-poll, button, a, input, textarea, [role="button"]';
