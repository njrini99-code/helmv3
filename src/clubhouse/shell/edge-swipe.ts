'use client';

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
/**
 * A pushed screen (PhoneScreen, use-edge-swipe.ts) still waits this long after it mounts (its 462ms entry spring) before
 * its swipe arms. A pushed route page doesn't: it is grabbed where it stands (C1, use-route-swipe.ts).
 */
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
 *
 * `from` is where the screen already is when the finger lands, in pixels: a push still sliding in is grabbed where it
 * stands (C1, rows 2 and 89), so the finger's travel adds to that rather than starting the screen from rest.
 */
export function createEdgeSwipe(width: number, from = 0) {
  let phase: EdgePhase = 'idle';
  let x0 = 0;
  let y0 = 0;
  let offset = 0;
  let past = false;
  let samples: Array<[number, number]> = [];
  const mark = Math.max(1, width) * CH_EDGE_COMMIT;
  const base = Math.min(Math.max(0, width), Math.max(0, from));

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
      offset = base;
      past = base >= mark;
      samples = [[t, base]];
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
      offset = Math.min(width, Math.max(0, base + dx));
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
 * `window.__helmNativeSwipe` to false (the native shell turns it off for a round, a sheet, a dialog, and while a pushed
 * screen holds the swipe through `claimWebSwipe`). Read when a finger lands, because the shell changes it while the page
 * is open.
 */
export function nativeSwipeIsOff(win: Window = window, inApp = false): boolean {
  const w = win as unknown as HelmNavWindow;
  const bridge = w.webkit?.messageHandlers?.helmNav != null;
  // The bridge only exists in the app, so its presence is itself the answer to "is this the app".
  if (!inApp && !bridge) return true;
  return bridge && w.__helmNativeSwipe === false;
}

interface HelmNavPoster {
  webkit?: { messageHandlers?: { helmNav?: { postMessage?: (body: { webSwipe: boolean }) => void } } };
  __helmWebSwipeResync?: () => void;
}

type SwipePoster = { postMessage: (body: { webSwipe: boolean }) => void };

/** How many mounted screens hold the swipe, and what the shell was last told (per bridge object). */
let swipeClaims = 0;
let toldShell: boolean | null = null;
let toldBridge: SwipePoster | null = null;
let flushQueued = false;

function helmNavPoster(win: Window): SwipePoster | null {
  const handler = (win as unknown as HelmNavPoster).webkit?.messageHandlers?.helmNav;
  return handler && typeof handler.postMessage === 'function' ? (handler as SwipePoster) : null;
}

/** Tells the shell whether a screen holds the swipe once the commit that changed it is over, so a push over a push is one message, not off then on. */
function flushSwipeClaim(): void {
  flushQueued = false;
  const handler = helmNavPoster(window);
  if (!handler) return;
  if (handler !== toldBridge) {
    toldBridge = handler;
    toldShell = null;
  }
  const want = swipeClaims > 0;
  if (want === toldShell) return;
  toldShell = want;
  try {
    handler.postMessage({ webSwipe: want });
  } catch {
    // A bridge that refuses the message leaves the native swipe as it was: on.
  }
}

function scheduleSwipeClaim(): void {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(flushSwipeClaim);
}

/**
 * Holds the iPhone app's edge swipe for the web gesture while a pushed screen that can be swiped back is up
 * (shell-gestures.md, "Who runs it"). It posts `{ webSwipe: true }` to the `helmNav` bridge; the shell then turns its
 * own WKWebView swipe off and sets `window.__helmNativeSwipe` to false, which is what lets `nativeSwipeIsOff` run the web
 * one. The returned release posts `{ webSwipe: false }` once no screen holds it. Claims are counted, so a screen pushed
 * over another hands the swipe on without the shell turning its own back on in between. No bridge (Mobile Safari, the
 * desktop): nothing is posted. An older shell ignores the key and keeps its own swipe. The shell drops the claim on every
 * page load and asks again through `window.__helmWebSwipeResync`, so a claim never outlives the page that made it.
 */
export function claimWebSwipe(win: Window = window): () => void {
  if (!helmNavPoster(win)) return () => {};
  (win as unknown as HelmNavPoster).__helmWebSwipeResync = () => {
    toldShell = null;
    flushSwipeClaim();
  };
  swipeClaims += 1;
  scheduleSwipeClaim();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    swipeClaims = Math.max(0, swipeClaims - 1);
    scheduleSwipeClaim();
  };
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

/**
 * Whether the screen's bar draws a chevron Back at all, disabled or not: the screens that hold the swipe in the app. A
 * disabled Back still holds it, so the native swipe cannot go back past a screen that says not now.
 */
export function hasChevronBack(screen: ParentNode): boolean {
  return screen.querySelector('.ch-pbar__back:not(.is-text)') != null;
}

/** Everything that decides whether a finger landing at the edge may start a swipe, in the order a person would hit it. */
export function edgeSwipeAllowed({ win = window, doc = document, inApp = false }: { win?: Window; doc?: Document; inApp?: boolean } = {}): boolean {
  if (!nativeSwipeIsOff(win, inApp)) return false;
  if (isTrackingRoute(win.location.pathname)) return false;
  return !overlayIsOpen(doc);
}
