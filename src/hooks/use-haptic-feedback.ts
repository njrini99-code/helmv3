'use client';

/**
 * Haptic feedback hook for native-feel touch interactions.
 * Uses the Vibration API where available (mostly Android + some iOS contexts).
 * Falls back to no-op on unsupported devices.
 *
 * Re-exports useHapticFeedback from use-mobile-detection for convenient import paths.
 * Both `@/hooks/use-haptic-feedback` and `@/hooks/use-mobile-detection` work.
 */
export { useHapticFeedback } from './use-mobile-detection';
