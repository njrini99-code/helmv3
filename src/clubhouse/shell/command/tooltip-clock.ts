/** How long the pointer rests on a control before its tip opens the first time. */
export const TIP_OPEN_DELAY_MS = 500;
/** A tip that just closed lets the next one open at once, within this long (moving along a row of icons). */
export const TIP_GRACE_MS = 300;

/**
 * The timing of tooltips, shared by every one on the page: the first opens after a short rest, and while the person is
 * moving between neighbours the next opens at once. Kept apart from the component so the delays are tested without
 * a DOM. `timers` is the clock's own, so a test can drive time.
 */
export interface TipTimers {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export const REAL_TIMERS: TipTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number),
};

export function createTipClock(timers: TipTimers = REAL_TIMERS) {
  let closedAt = -Infinity;
  let pending: { id: unknown } | null = null;

  const cancel = () => {
    if (pending) timers.clearTimeout(pending.id);
    pending = null;
  };

  return {
    /** Pointer rest: opens after the delay, or now when another tip closed just before. `intent` is false for keyboard focus (opens now). */
    request(open: () => void, intent: boolean): void {
      cancel();
      if (!intent || timers.now() - closedAt <= TIP_GRACE_MS) {
        open();
        return;
      }
      const slot: { id: unknown } = { id: null };
      slot.id = timers.setTimeout(() => {
        if (pending === slot) pending = null;
        open();
      }, TIP_OPEN_DELAY_MS);
      pending = slot;
    },
    /** The pointer left or the tip was dismissed: any wait stops. `wasOpen` starts the grace window for the next one. */
    release(wasOpen: boolean): void {
      cancel();
      if (wasOpen) closedAt = timers.now();
    },
    /** For tests. */
    get waiting(): boolean {
      return pending !== null;
    },
  };
}

/** One clock for the page: the grace window is shared across every tooltip, which is the point. */
export const tipClock = createTipClock();
