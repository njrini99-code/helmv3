/**
 * Fairway haptics — the thin semantic layer the design-system primitives call
 * so interactions feel native on iOS/Android. Delegates to the already-guarded
 * `triggerHaptic` (isNativeApp() + try/catch), so it is a safe no-op on web and
 * never throws or blocks. Fire-and-forget from any event handler; renders
 * nothing.
 *
 * The capability was installed (@capacitor/haptics) but called from ZERO
 * Fairway primitives — taps felt inert on device. This is the wiring layer.
 */
import { triggerHaptic } from '@/lib/utils/capacitor';

export type FwHapticKind =
  | 'selection' // segmented / tab / toggle change — the iOS "tick"
  | 'light' // light tap confirm (primary actions)
  | 'medium' // weightier confirm (destructive / commit)
  | 'success' // positive notification
  | 'warning'
  | 'error';

// Map the semantic kinds onto the platform impact/notification primitives.
// (ImpactStyle has no dedicated "selection", so the selection tick uses Light.)
const KIND_MAP: Record<FwHapticKind, 'light' | 'medium' | 'success' | 'warning' | 'error'> = {
  selection: 'light',
  light: 'light',
  medium: 'medium',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** Fire a semantic haptic. Safe no-op off native; never throws. */
export function fwHaptic(kind: FwHapticKind = 'light'): void {
  void triggerHaptic(KIND_MAP[kind]);
}
