/**
 * MOT-14: keep the native canvas in step with the in-app theme.
 *
 * The iOS web view, its scroll view and the root view paint a dynamic canvas
 * colour (GolfBridgeViewController.canvasColor) that resolves from the
 * window's interface style. That is what the rubber-band bounce exposes. It
 * followed the SYSTEM appearance only, so a player who picked Dark in the app
 * on a phone set to Light saw a cream band on overscroll. `HelmAppearance`
 * sets the window's override style to match the app's choice ('system'
 * hands control back to the OS).
 *
 * No capability gate: the capability table may only name shipped builds, and
 * this plugin ships with the next one. On an older binary the call rejects as
 * unimplemented and is ignored, leaving the system appearance in charge, which
 * is exactly today's behaviour.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeAppearanceStyle = 'light' | 'dark' | 'system';

interface HelmAppearanceBridge {
  setStyle(options: { style: NativeAppearanceStyle }): Promise<void>;
}

const HelmAppearance = registerPlugin<HelmAppearanceBridge>('HelmAppearance');

let lastStyle: NativeAppearanceStyle | null = null;

export function syncNativeAppearance(style: NativeAppearanceStyle): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
  if (style === lastStyle) return;
  lastStyle = style;
  HelmAppearance.setStyle({ style }).catch(() => {
    lastStyle = null;
  });
}
