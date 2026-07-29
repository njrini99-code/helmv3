/**
 * Fairway haptics — the semantic layer every design-system primitive calls so
 * interactions feel native on iOS. Delegates to the already-guarded primitives
 * in `@/lib/utils/capacitor` (isNativeApp() + try/catch), so every export here
 * is a safe no-op on web and never throws or blocks. Fire-and-forget from any
 * event handler.
 *
 * WHY THIS IS MORE THAN A ONE-LINER
 *
 * iOS exposes three *different* haptic generators, and using the wrong one is
 * what makes a hybrid app feel like a website in a wrapper:
 *
 *   · Impact    — a physical collision. Weighted (light/medium/heavy).
 *                 Right for: buttons, commits, drops, sheet snapping.
 *   · Selection — a detent passing under your thumb. Drier and quieter than
 *                 a light impact, and *repeatable* without feeling like a
 *                 machine gun. Right for: tabs, segmented, pickers, sliders.
 *   · Notification — a two-or-three-part pattern the OS owns.
 *                 Right for: outcomes only (saved / rejected / failed).
 *
 * The first pass of this module mapped `selection` onto ImpactStyle.Light,
 * which is why every tab switch and slider drag felt like a dull thud instead
 * of a tick. `selection` now uses the real selection generator.
 *
 * Capacitor v8 exposes only LIGHT/MEDIUM/HEAVY impact (no soft/rigid), so
 * texture beyond those three comes from *composed sequences* — see SEQUENCES.
 */
import {
  triggerHaptic,
  triggerSelectionHaptic,
  selectionStart,
  selectionChanged,
  selectionEnd,
  isNativeApp,
} from '@/lib/utils/capacitor';

export type FwHapticKind =
  /** Segmented / tab / toggle / picker change — the iOS detent tick. */
  | 'selection'
  /** Light tap confirm — default for primary taps. */
  | 'light'
  /** Weightier confirm — destructive or committing actions. */
  | 'medium'
  /** Heaviest single impact — drag drop, sheet snap, milestone. */
  | 'heavy'
  /** Outcome patterns. Reserve for real outcomes, never for taps. */
  | 'success'
  | 'warning'
  | 'error';

/**
 * Composed multi-part patterns for moments that deserve more than one tick.
 * Each entry is [kind, delayBeforeMs]. Delays under ~40ms blur into a single
 * sensation on the Taptic Engine, and over ~180ms read as two separate events
 * rather than one texture — the values below sit deliberately in between.
 */
export type FwHapticSequence =
  /** Commit that matters — round submitted, lineup posted. Rise then land. */
  | 'commit'
  /** Something was rejected/undone. Two equal knocks read as "no". */
  | 'reject'
  /** Pull-to-refresh crossed the trigger threshold. */
  | 'threshold'
  /** Celebration — PR set, qualifier won. Deliberately the only 3-part one. */
  | 'celebrate';

const SEQUENCES: Record<FwHapticSequence, ReadonlyArray<readonly [FwHapticKind, number]>> = {
  commit: [
    ['light', 0],
    ['medium', 90],
  ],
  reject: [
    ['medium', 0],
    ['medium', 110],
  ],
  threshold: [['selection', 0]],
  celebrate: [
    ['light', 0],
    ['medium', 70],
    ['heavy', 130],
  ],
};

// Map the semantic kinds onto the platform impact/notification primitives.
const IMPACT_MAP = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const;

/**
 * User-level opt-out. iOS already respects the system-wide haptics switch, but
 * a per-app toggle is table stakes for a product people use for hours — some
 * coaches run this on a bench all afternoon. Read lazily so this module stays
 * import-safe during SSR.
 */
const PREF_KEY = 'helm-haptics-enabled';
let prefCache: boolean | null = null;

export function areHapticsEnabled(): boolean {
  if (prefCache !== null) return prefCache;
  if (typeof window === 'undefined') return true;
  try {
    prefCache = window.localStorage.getItem(PREF_KEY) !== 'false';
  } catch {
    prefCache = true;
  }
  return prefCache;
}

export function setHapticsEnabled(enabled: boolean): void {
  prefCache = enabled;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // localStorage unavailable — in-memory cache still applies for this session.
  }
}

/**
 * Rate limit. A drag handler can fire dozens of times a second; feeding all of
 * that to the Taptic Engine produces a continuous buzz (and on older devices,
 * audible clicking) rather than discrete ticks. 32ms ≈ two frames at 60fps,
 * which is about the floor at which a person still perceives separate taps.
 *
 * Outcome patterns bypass the limiter — they're rare, intentional, and must
 * never be swallowed because a tap happened to precede them.
 */
const MIN_INTERVAL_MS = 32;
let lastFiredAt = 0;

function shouldThrottle(kind: FwHapticKind): boolean {
  if (kind === 'success' || kind === 'warning' || kind === 'error') return false;
  const now = Date.now();
  if (now - lastFiredAt < MIN_INTERVAL_MS) return true;
  lastFiredAt = now;
  return false;
}

/** Fire a semantic haptic. Safe no-op off native; never throws. */
export function fwHaptic(kind: FwHapticKind = 'light'): void {
  if (!areHapticsEnabled()) return;
  if (shouldThrottle(kind)) return;

  if (kind === 'selection') {
    void triggerSelectionHaptic();
    return;
  }
  void triggerHaptic(IMPACT_MAP[kind]);
}

/** Fire a composed pattern. Safe no-op off native; never throws. */
export function fwHapticSequence(sequence: FwHapticSequence): void {
  if (!areHapticsEnabled() || !isNativeApp()) return;
  for (const [kind, delay] of SEQUENCES[sequence]) {
    if (delay === 0) {
      // Bypass the limiter for the leading beat so a preceding tap can't eat it.
      if (kind === 'selection') void triggerSelectionHaptic();
      else void triggerHaptic(IMPACT_MAP[kind]);
    } else {
      window.setTimeout(() => {
        if (kind === 'selection') void triggerSelectionHaptic();
        else void triggerHaptic(IMPACT_MAP[kind]);
      }, delay);
    }
  }
}

/**
 * Continuous-gesture scrub session (slider, wheel picker, chart scrubber,
 * reorder drag).
 *
 * Wrapping a drag in start/end keeps the Taptic Engine warm for its duration,
 * so the first tick lands immediately instead of being dropped to spin-up
 * latency, and the engine returns to idle afterwards instead of holding power.
 *
 *   const scrub = fwScrub();
 *   onDragStart  → scrub.begin()
 *   onValueChange→ scrub.tick()      // once per detent crossed, not per pixel
 *   onDragEnd    → scrub.end()
 *
 * `end()` is idempotent and safe to call from a cleanup effect.
 */
export function fwScrub() {
  let active = false;

  return {
    begin(): void {
      if (!areHapticsEnabled() || active) return;
      active = true;
      void selectionStart();
    },
    tick(): void {
      if (!areHapticsEnabled() || !active) return;
      if (shouldThrottle('selection')) return;
      void selectionChanged();
    },
    end(): void {
      if (!active) return;
      active = false;
      void selectionEnd();
    },
  };
}
