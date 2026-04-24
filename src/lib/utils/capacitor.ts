import { Capacitor } from '@capacitor/core';
// NOTE: `@capacitor/keyboard` is intentionally NOT statically imported.
// Importing it on web triggers Capacitor's plugin-proxy registration and
// surfaces "Keyboard plugin is not implemented on web" as an unhandled
// rejection on every page load (400+ telemetry incidents). We dynamic-
// import inside `initCapacitor` below so the module only loads on native.
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType as HapticNotificationType } from '@capacitor/haptics';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Detect if the app is running inside a Capacitor native shell (iOS/Android).
 * `window.Capacitor` exists on web too (it's the web-proxy entry point), so
 * `isNativePlatform()` is the only reliable way to tell native from browser.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

/**
 * Initialize Capacitor-specific settings (call once on app mount).
 * Hides the iOS keyboard accessory bar (prev/next/done toolbar).
 */
export async function initCapacitor(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Keyboard plugin not available on this platform
  }
}

/**
 * Open a URL in the appropriate browser.
 * In native apps, opens in-app via SFSafariViewController (iOS).
 * On web, opens in a new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      // Fall through to web behavior
    }
  }
  window.open(url, '_blank');
}

/**
 * Trigger native haptic feedback.
 * Falls back silently on web.
 */
export async function triggerHaptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (style === 'success' || style === 'warning' || style === 'error') {
      const typeMap: Record<string, HapticNotificationType> = {
        success: HapticNotificationType.Success,
        warning: HapticNotificationType.Warning,
        error: HapticNotificationType.Error,
      };
      await Haptics.notification({ type: typeMap[style]! });
    } else {
      const styleMap: Record<string, ImpactStyle> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: styleMap[style]! });
    }
  } catch {
    // Haptics not available
  }
}

/**
 * Set the native status bar style.
 */
export async function setStatusBarStyle(style: 'light' | 'dark' = 'dark'): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({ style: style === 'light' ? StatusBarStyle.Light : StatusBarStyle.Dark });
  } catch {
    // StatusBar not available
  }
}

/**
 * Hide the native splash screen with a smooth fade.
 * Using fadeOutDuration avoids the abrupt cut from splash → login screen
 * that feels jarring on iOS.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    // SplashScreen not available
  }
}

