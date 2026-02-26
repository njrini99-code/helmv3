import { Keyboard } from '@capacitor/keyboard';

/**
 * Detect if the app is running inside a Capacitor native shell (iOS/Android).
 * Uses the standard Capacitor detection pattern.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as Record<string, unknown>).Capacitor;
}

/**
 * Initialize Capacitor-specific settings (call once on app mount).
 * Hides the iOS keyboard accessory bar (prev/next/done toolbar).
 */
export async function initCapacitor(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Keyboard plugin not available on this platform
  }
}
