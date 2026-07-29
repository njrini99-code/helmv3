// =============================================================================
// src/lib/lifting/haptics.ts
//
// Haptic feedback for the Helm Lifting Lab.
//
// WAS: navigator.vibrate() only. That silently did NOTHING on our primary
// target — iOS does not implement the Vibration API in Safari or WKWebView, so
// every haptic moment in the Lifting Lab (body-map taps, severity slider,
// Ready to Go, final submit) has been inert on device since it shipped.
//
// NOW: delegates to the Fairway haptics engine, which drives the real Taptic
// Engine through Capacitor on iOS/Android. navigator.vibrate() is kept purely
// as the web/PWA fallback for browsers that do support it (Chrome on Android).
//
// The four-type API is unchanged, so the nine existing call sites keep working.
//
// Usage:
//   import { haptic } from '@/lib/lifting/haptics';
//   haptic('tap');     // body area selected
//   haptic('select');  // severity confirmed or region saved
//   haptic('warning'); // severe soreness (>= 7) detected
//   haptic('success'); // Ready to Go or final submit confirmed
//
// Do not add haptics to passive read operations. Keep the list above short.
// =============================================================================

import { fwHaptic, type FwHapticKind } from '@/lib/fairway/haptics';
import { isNativeApp } from '@/lib/utils/capacitor';

/** The four semantic haptic types the Lifting Lab UI may emit. */
export type HapticType = 'tap' | 'select' | 'warning' | 'success';

/**
 * Semantic mapping onto the Fairway engine.
 *
 * `tap` is a *selection* rather than an impact: picking one body region out of
 * many is a detent crossing, and it repeats rapidly as a finger moves over the
 * map — exactly the case the selection generator exists for. `select` is the
 * commit (severity confirmed, region saved), so it earns a real impact.
 */
const HAPTIC_KINDS: Record<HapticType, FwHapticKind> = {
  tap: 'selection',
  select: 'medium',
  warning: 'warning',
  success: 'success',
};

/**
 * Vibration patterns for the web/PWA fallback path only.
 *
 * A number is a single vibration duration (ms).
 * A number[] alternates vibrate/pause durations (ms), matching the
 * VibratePattern spec: [vibrate, pause, vibrate, ...].
 */
const WEB_PATTERNS: Record<HapticType, VibratePattern> = {
  tap:     8,
  select:  12,
  warning: [20, 40, 20],
  success: [10, 30, 10],
} as const;

/**
 * Trigger haptic feedback.
 *
 * Native (iOS/Android): routes to the Taptic Engine via Capacitor.
 * Web/PWA: falls back to navigator.vibrate where supported.
 *
 * Silently no-ops when:
 *   - called during SSR (window/navigator undefined)
 *   - the browser does not support navigator.vibrate (iOS Safari, most desktop)
 *   - the user has turned haptics off, or the OS has vibration disabled
 *
 * @param type — semantic haptic type
 */
export function haptic(type: HapticType): void {
  if (isNativeApp()) {
    fwHaptic(HAPTIC_KINDS[type]);
    return;
  }
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(WEB_PATTERNS[type]);
}
