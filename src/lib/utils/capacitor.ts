import { Keyboard } from '@capacitor/keyboard';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType as HapticNotificationType } from '@capacitor/haptics';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

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
 * Hide the native splash screen.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide();
  } catch {
    // SplashScreen not available
  }
}

