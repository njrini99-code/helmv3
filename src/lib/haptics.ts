/**
 * Semantic haptics: the one import surface for product code (audit MOT-02).
 *
 * Product code names the EVENT, not the motor. The mapping onto iOS generators
 * lives here so the whole app stays consistent:
 *
 *   select      detent: tab, segment, picker tick, toggle, stepper, hole change
 *   commit      a value committed: shot recorded, start round, add to plan
 *   checkpoint  a bigger commit: hole complete, sheet snapped to a detent
 *   success / warning / error   outcomes only
 *
 * Opening a sheet, navigating, or tapping a generic button fires NOTHING.
 *
 * Everything delegates to `fwHaptic` in `lib/fairway/haptics.ts`, which owns the
 * per-app preference, the web no-op and the priority-aware throttle (a later,
 * weightier event in the same gesture beats an earlier generic one).
 */
import {
  fwHaptic,
  fwHapticSequence,
  fwScrub,
  type FwHapticKind,
} from '@/lib/fairway/haptics';

export type HapticEvent = 'select' | 'commit' | 'checkpoint' | 'success' | 'warning' | 'error';

const EVENT_TO_KIND: Record<HapticEvent, FwHapticKind> = {
  select: 'selection',
  commit: 'light',
  checkpoint: 'medium',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** Fire a semantic haptic. No-op on web and when the user turned haptics off. */
export function haptic(event: HapticEvent): void {
  fwHaptic(EVENT_TO_KIND[event]);
}

/** Composed patterns for the few moments that deserve more than one beat. */
export function hapticSequence(sequence: 'roundSubmitted' | 'reject'): void {
  fwHapticSequence(sequence === 'roundSubmitted' ? 'commit' : 'reject');
}

/** Continuous-gesture scrub session (slider, wheel, chart scrubber). */
/** Detent haptics for a drag/scrub (see fwScrub). A function, not an alias,
 *  so importing this module never touches fwScrub at load time. */
export function scrub(): ReturnType<typeof fwScrub> {
  return fwScrub();
}

/**
 * A control's haptic prop: a semantic event, a raw Fairway kind (for existing
 * callers such as the Button's historical 'light'), or `false` for none.
 */
export type ControlHaptic = HapticEvent | FwHapticKind | false;

function isHapticEvent(value: HapticEvent | FwHapticKind): value is HapticEvent {
  return value in EVENT_TO_KIND;
}

/** Fire whatever a control's `haptic` prop resolved to. */
export function fireControlHaptic(value: ControlHaptic | undefined): void {
  if (!value) return;
  if (isHapticEvent(value)) haptic(value);
  else fwHaptic(value);
}

/**
 * True while the current document is a GolfHelm route. Shared controls use it
 * to apply the golf-only "no haptic on a generic tap" default (audit MOT-03)
 * without changing Baseball or Lift Lab phone behaviour (owner OD-17/17b),
 * which keep the historical light tick. Evaluated at event time, never during
 * render, so it cannot cause a hydration mismatch.
 */
export function isGolfSurface(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location?.pathname?.startsWith('/golf') ?? false;
}

/**
 * Resolve a shared control's haptic when the caller passed none: golf gets no
 * tick on a generic tap; other sports keep their legacy default.
 */
export function resolveDefaultHaptic(
  explicit: ControlHaptic | undefined,
  legacyDefault: ControlHaptic,
): ControlHaptic {
  if (explicit !== undefined) return explicit;
  return isGolfSurface() ? false : legacyDefault;
}
