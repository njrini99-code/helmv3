import { releaseSpeed } from '../lib/sheet-drag';

/**
 * The web side of the iPhone's edge swipe back (docs/clubhouse/phone/shell-gestures.md). A pushed phone screen follows
 * a finger that starts within the left edge, the page beneath draws back as it goes, and letting go either pops the
 * screen or springs it back. This file is the part with no DOM in it: the state machine that reads the finger, the
 * thresholds, and the rules for when the gesture may run at all. `use-edge-swipe.ts` binds it to a screen.
 */

/** The gesture starts only within this many pixels of the left edge, where iOS's own back swipe begins. */
export const CH_EDGE_ZONE_PX = 20;
/** Past this share of the width at the moment of release the screen pops. */
export const CH_EDGE_COMMIT = 0.35;
/** So does a flick faster than this (px per ms), once it has moved a little: the sheet's own flick (sheet-drag). */
export const CH_EDGE_FLICK_PX_PER_MS = 0.5;
/** A finger must travel this far before the gesture decides whether it is a swipe or a scroll. */
export const CH_EDGE_SLOP_PX = 8;
/** …and a flick counts only after the screen has moved this much. */
const FLICK_MIN_PX = 10;
/** The entry spring is still settling for this long after the screen mounts (462ms): the gesture waits for it. */
export const CH_EDGE_ENTRY_SETTLE_MS = 480;

export type EdgePhase = 'idle' | 'pending' | 'dragging' | 'refused';
export type EdgeOutcome = 'commit' | 'cancel';

export interface EdgeFrame {
  /** How far the screen is from rest, in pixels (never negative, never past the width). */
  offset: number;
  /** `offset` as a share of the width, 0 to 1. */
  progress: number;
  /** Past the commit mark: letting go now pops the screen. */
  past: boolean;
}

export interface EdgeMove {
  /** The swipe owns this touch: the caller stops the page from scrolling with it. */
  claim: boolean;
  /** The screen's place now, when the swipe owns the touch. */
  frame: EdgeFrame | null;
  /** The commit mark was crossed (either way) by this move: the selection haptic. */
  crossed: boolean;
}

export interface EdgeRelease {
  outcome: EdgeOutcome;
  /** Where the screen was let go, in pixels. */
  offset: number;
  /** The finger's speed toward closing as it let go, px per ms (negative: it was drawing back). */
  speed: number;
}

const NONE: EdgeMove = { claim: false, frame: null, crossed: false };

/**
 * One touch's worth of state. `start` arms it when the finger lands in the edge zone; `move` decides, after a few
 * pixels, whether the touch is a swipe (mostly rightward) or a scroll (anything else, which then wins for the rest of
 * the touch); `end` reads the release. Vertical scroll always wins when the first travel is vertical.
 */
export function createEdgeSwipe(width: number) {
  let phase: EdgePhase = 'idle';
  let x0 = 0;
  let y0 = 0;
  let offset = 0;
  let past = false;
  let samples: Array<[number, number]> = [];
  const mark = Math.max(1, width) * CH_EDGE_COMMIT;

  const reset = () => {
    phase = 'idle';
    offset = 0;
    past = false;
    samples = [];
  };

  return {
    get phase(): EdgePhase {
      return phase;
    },
    /** Arms the gesture for a finger landing at `x`; false when it landed outside the edge zone (or one is under way). */
    start(x: number, y: number, t: number): boolean {
      if (phase === 'pending' || phase === 'dragging') return false;
      reset();
      if (x > CH_EDGE_ZONE_PX || x < 0 || !(width > 0)) {
        phase = 'refused';
        return false;
      }
      x0 = x;
      y0 = y;
      samples = [[t, 0]];
      phase = 'pending';
      return true;
    },
    move(x: number, y: number, t: number): EdgeMove {
      if (phase === 'idle' || phase === 'refused') return NONE;
      const dx = x - x0;
      const dy = y - y0;
      if (phase === 'pending') {
        if (Math.hypot(dx, dy) < CH_EDGE_SLOP_PX) return NONE;
        // Vertical (or leftward) first travel is a scroll's: it wins for the rest of this touch.
        if (!(dx > 0 && dx > Math.abs(dy))) {
          phase = 'refused';
          return NONE;
        }
        phase = 'dragging';
      }
      offset = Math.min(width, Math.max(0, dx));
      samples.push([t, offset]);
      if (samples.length > 12) samples.shift();
      const nowPast = offset >= mark;
      const crossed = nowPast !== past;
      past = nowPast;
      return { claim: true, frame: { offset, progress: offset / width, past }, crossed };
    },
    /** The finger lifted: null when this touch was never a swipe. */
    end(t: number): EdgeRelease | null {
      const dragging = phase === 'dragging';
      const where = offset;
      const speed = dragging ? releaseSpeed(samples, t) : 0;
      reset();
      phase = 'idle';
      if (!dragging) return null;
      let outcome: EdgeOutcome;
      if (speed < -CH_EDGE_FLICK_PX_PER_MS) outcome = 'cancel';
      else if (where > FLICK_MIN_PX && speed > CH_EDGE_FLICK_PX_PER_MS) outcome = 'commit';
      else outcome = where >= mark ? 'commit' : 'cancel';
      return { outcome, offset: where, speed };
    },
    /** The system took the touch (iOS's own swipe, a call): forget it without an outcome. */
    cancel(): void {
      reset();
    },
  };
}

interface HelmNavWindow {
  webkit?: { messageHandlers?: { helmNav?: unknown } };
  __helmNativeSwipe?: boolean;
}

/**
 * Whether the web gesture may run. Mobile Safari always (it has no native swipe of ours to compete with). The iOS app's
 * WebView has WKWebView's own back gesture on, which plays the pop itself over a snapshot; the web one runs there only
 * when the page has been told that gesture is off: the `helmNav` bridge exists and the shell has set
 * `window.__helmNativeSwipe` to false (the native shell turns it off for a round, a sheet, a dialog). Read when a finger
 * lands, because the shell changes it while the page is open.
 */
export function nativeSwipeIsOff(win: Window = window, inApp = false): boolean {
  const w = win as unknown as HelmNavWindow;
  const bridge = w.webkit?.messageHandlers?.helmNav != null;
  // The bridge only exists in the app, so its presence is itself the answer to "is this the app".
  if (!inApp && !bridge) return true;
  return bridge && w.__helmNativeSwipe === false;
}

/** The routes the native shell leaves its own swipe off on (GolfBridgeViewController.isTrackingRoute). */
export function isTrackingRoute(url: string): boolean {
  return url.includes('/golf/dashboard/rounds/new') || url.includes('/golf/dashboard/rounds/continue');
}

/** An open sheet or dialog (NativeSwipeBackBridge's list, plus Clubhouse's native dialogs and popovers): the swipe would act under it. */
const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open], [data-vaul-drawer][data-state="open"]';

export function overlayIsOpen(doc: Document = document): boolean {
  if (doc.querySelector(OPEN_OVERLAY)) return true;
  try {
    return doc.querySelector('[popover]:popover-open') != null;
  } catch {
    // An engine without :popover-open has no popovers to be open.
    return false;
  }
}

/** The screen's Back, as the bar draws it: a chevron link ("Cancel" is a text action, and a swipe must not abandon a form). */
export function findScreenBack(screen: ParentNode): HTMLButtonElement | null {
  const back = screen.querySelector<HTMLButtonElement>('.ch-pbar__back:not(.is-text)');
  return back && !back.disabled && back.getAttribute('aria-disabled') !== 'true' ? back : null;
}

/** Everything that decides whether a finger landing at the edge may start a swipe, in the order a person would hit it. */
export function edgeSwipeAllowed({ win = window, doc = document, inApp = false }: { win?: Window; doc?: Document; inApp?: boolean } = {}): boolean {
  if (!nativeSwipeIsOff(win, inApp)) return false;
  if (isTrackingRoute(win.location.pathname)) return false;
  return !overlayIsOpen(doc);
}
