// =============================================================================
// src/lib/lifting/haptics.ts
//
// Haptic feedback utility for the Helm Lifting Lab.
//
// Web/PWA haptics via navigator.vibrate() where supported; silently degrades
// on platforms that don't expose the Vibration API (iOS, most desktops).
//
// SSR-safe: the navigator guard prevents any reference to window/navigator
// from executing during server-side rendering.
//
// Usage:
//   import { haptic } from '@/lib/lifting/haptics';
//   haptic('tap');     // body area selected
//   haptic('select');  // severity confirmed or region saved
//   haptic('warning'); // severe soreness (≥ 7) detected
//   haptic('success'); // Ready to Go or final submit confirmed
//
// Haptic moments per spec §6:
//   - tap body area       → 'tap'
//   - save area           → 'select'
//   - select severe sore  → 'warning'
//   - Ready to Go         → 'success'
//   - final submit        → 'success'
//
// Do not add haptics to passive read operations. Keep the list above short.
// =============================================================================

/** The four semantic haptic types the Lifting Lab UI may emit. */
export type HapticType = 'tap' | 'select' | 'warning' | 'success';

/**
 * Vibration patterns keyed by HapticType.
 *
 * A number is a single vibration duration (ms).
 * A number[] alternates vibrate/pause durations (ms), matching the
 * VibratePattern spec: [vibrate, pause, vibrate, ...].
 */
const HAPTIC_PATTERNS: Record<HapticType, VibratePattern> = {
  tap:     8,
  select:  12,
  warning: [20, 40, 20],
  success: [10, 30, 10],
} as const;

/**
 * Trigger a haptic vibration pattern.
 *
 * Silently no-ops when:
 *   - called during SSR (navigator is undefined)
 *   - the browser does not support navigator.vibrate
 *   - the user's OS/device has vibration disabled
 *
 * @param type — semantic haptic type
 */
export function haptic(type: HapticType): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(HAPTIC_PATTERNS[type]);
}
