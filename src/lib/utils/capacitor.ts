import { Capacitor } from '@capacitor/core';
import { areHapticsEnabled } from './haptics-pref';
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
 *
 * Honours the user's haptics preference. That check belongs HERE rather than in
 * the callers: 164 of the app's 177 haptic call sites call this function
 * directly, and only 13 go through `fwHaptic`, which had the only gate. The
 * per-app off switch therefore used to silence about 7% of the buzzing and
 * leave the rest — so the gate moved down to the function everything funnels
 * through.
 */
export async function triggerHaptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): Promise<void> {
  if (!isNativeApp()) return;
  if (!areHapticsEnabled()) return;
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
 * iOS selection feedback — the distinct, drier "tick" UIKit uses for pickers,
 * segmented controls and scrubbers. It is NOT the same generator as a Light
 * impact: impact simulates a physical collision, selection simulates a
 * detent passing under your thumb. Collapsing the two (as the first pass of
 * `fwHaptic` did) is the single most common reason a hybrid app's taps read
 * as "web in a wrapper" on device.
 *
 * The three-call shape is deliberate and mirrors UISelectionFeedbackGenerator:
 *   selectionStart()   — prepare the Taptic Engine (warms it out of idle, so
 *                        the FIRST tick isn't swallowed by ~100ms of spin-up)
 *   selectionChanged() — one detent crossed; call per value change
 *   selectionEnd()     — release the engine back to idle
 *
 * Call start/end around a continuous gesture (drag, wheel, slider). For a
 * one-shot discrete change (tab switch), `triggerSelectionHaptic` does all
 * three in order.
 */
export async function selectionStart(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.selectionStart();
  } catch {
    // Haptics not available
  }
}

export async function selectionChanged(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.selectionChanged();
  } catch {
    // Haptics not available
  }
}

export async function selectionEnd(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.selectionEnd();
  } catch {
    // Haptics not available
  }
}

/** One-shot selection tick for a discrete change (tab/segment/toggle). */
export async function triggerSelectionHaptic(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch {
    // Haptics not available
  }
}

/**
 * Set the native status bar style.
 *
 * @param content — the colour of the status bar GLYPHS (clock, battery, signal)
 *   'dark'  → dark glyphs, for a LIGHT background (our cream light theme)
 *   'light' → light glyphs, for a DARK background (our dark theme)
 *
 * ⚠️ Capacitor's `Style` enum is named for the BACKGROUND it suits, which is
 * the exact opposite of how iOS names it (`UIStatusBarStyle.darkContent`) and
 * of how everyone reads it:
 *
 *     Style.Dark  = "Light text for dark backgrounds"   → LIGHT glyphs
 *     Style.Light = "Dark text for light backgrounds"   → DARK glyphs
 *
 * That inversion already bit us. This function previously mapped
 * `'dark' → Style.Dark`, and its only caller passed `'dark'` under the comment
 * "dark content (dark text on light background)" — so the app shipped LIGHT
 * glyphs onto the cream background, washing the clock and battery out, and
 * silently overrode the correct `StatusBar.style: 'LIGHT'` from
 * capacitor.config.ts a moment after launch.
 *
 * This parameter now names the glyph colour, matching the iOS mental model.
 * Keep it that way — describe what you want to SEE, not the enum.
 */
async function setStatusBarStyle(content: 'light' | 'dark' = 'dark'): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({
      style: content === 'light' ? StatusBarStyle.Dark : StatusBarStyle.Light,
    });
  } catch {
    // StatusBar not available
  }
}

/**
 * Point the status bar at the currently active theme.
 *
 * 2.0 shipped a full light/dark/system theme, but the status bar was set once
 * at mount and never revisited — so switching to dark mode left dark glyphs on
 * a near-black surface. Reads the same `.dark` class on <html> that
 * `useGolfTheme` toggles, so `system` changes and cross-tab syncs are picked up
 * for free.
 */
export async function syncStatusBarToTheme(): Promise<void> {
  if (!isNativeApp() || typeof document === 'undefined') return;
  const isDark = document.documentElement.classList.contains('dark');
  await setStatusBarStyle(isDark ? 'light' : 'dark');
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

