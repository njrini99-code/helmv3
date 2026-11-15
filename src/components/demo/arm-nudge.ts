/**
 * arm-nudge — pure decision logic for DemoPricingNudge, extracted so the
 * two-trigger race (30s timer OR N pointerdowns) and the session-arming gate
 * are unit-testable without touching window/sessionStorage/timers.
 *
 * See DemoPricingNudge.tsx for the effect that wires these into real browser
 * events.
 */

/** sessionStorage flag: "this browser session is inside a coach demo tour". */
export const DEMO_TOUR_STORAGE_KEY = 'golf_demo_tour';

/** sessionStorage flag: "the pricing nudge already fired this session". */
export const DEMO_PRICING_NUDGED_STORAGE_KEY = 'golf_demo_pricing_nudged';

/** Fire the nudge after this many ms of dwell time inside the demo, at most. */
export const DEMO_PRICING_NUDGE_DELAY_MS = 30_000;

/** Fire the nudge after this many pointerdown interactions, at most. */
export const DEMO_PRICING_NUDGE_CLICK_THRESHOLD = 8;

/**
 * Pure race decision: given how long the nudge has been armed and how many
 * pointerdowns have landed since arming, should it fire now?
 *
 * Called from both the setTimeout callback and the pointerdown handler so
 * neither trigger duplicates the threshold check — whichever event crosses
 * a threshold first wins the race.
 */
export function shouldFireNudge(elapsedMs: number, clickCount: number): boolean {
  return elapsedMs >= DEMO_PRICING_NUDGE_DELAY_MS || clickCount >= DEMO_PRICING_NUDGE_CLICK_THRESHOLD;
}

export interface NudgeArmingInput {
  /** Raw `window.location.search`, e.g. `"?demo=1"`. */
  locationSearch: string;
  /** Current value of the `golf_demo_tour` sessionStorage flag. */
  tourFlag: string | null;
  /** Current value of the `golf_demo_pricing_nudged` sessionStorage flag. */
  nudgedFlag: string | null;
}

export interface NudgeArmingResult {
  /** Whether the `golf_demo_tour` flag should be (re)written to '1'. */
  shouldMarkTour: boolean;
  /** Whether the two triggers (timer + pointerdown counter) should be armed. */
  shouldArm: boolean;
}

/**
 * Pure gating decision for whether this session is "inside a demo tour" and,
 * if so, whether the nudge should arm.
 *
 * `?demo=1` is the only client-visible demo signal, and it's present only on
 * the first landing navigation (DemoEnterTracker strips it from the URL on
 * that same navigation). So the durable signal for every subsequent render
 * is the `golf_demo_tour` sessionStorage flag, seeded here the first time
 * `?demo=1` is observed.
 */
export function resolveNudgeArming({
  locationSearch,
  tourFlag,
  nudgedFlag,
}: NudgeArmingInput): NudgeArmingResult {
  const cameFromDemoGate = locationSearch.includes('demo=1');
  const tourActive = cameFromDemoGate || tourFlag === '1';
  const alreadyNudged = nudgedFlag === '1';

  return {
    shouldMarkTour: cameFromDemoGate,
    shouldArm: tourActive && !alreadyNudged,
  };
}
