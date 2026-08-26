/**
 * ============================================================================
 * Native capability bridge — the §61 contract (iOS premium plan, 2.1 arc)
 * ----------------------------------------------------------------------------
 * The native shell renders the DEPLOYED web app, so old App Store binaries run
 * new web code indefinitely. Every native feature the web layer wants to call
 * must therefore be capability-detected against the INSTALLED binary — never
 * assumed from "the latest build has it".
 *
 * This module is the single source of truth for that detection:
 *
 *   const info = await getNativeAppInfo();      // null on web/SSR
 *   if (await hasNativeCapability('coreHapticsV1')) { ... }
 *
 * Capabilities are keyed to the MINIMUM CFBundleVersion (build number) that
 * ships them. That keeps the contract in one reviewable place with no extra
 * native plugin surface: the build number already crosses the bridge via
 * `@capacitor/app` (linked in CapApp-SPM since 8.x, unused until now).
 *
 * RELEASE RULE: a capability's min-build entry lands in the SAME PR as the
 * native code that ships it, and the iOS release checklist verifies this map
 * against the binary before upload. An entry pointing at an unshipped build
 * is a bug — `hasNativeCapability` will simply (and correctly) return false
 * on every installed binary until that build exists in the wild.
 *
 * `@capacitor/app` is dynamic-imported inside the getter — same reason as
 * Keyboard in `src/lib/utils/capacitor.ts`: a static import registers the web
 * plugin proxy and surfaces "not implemented on web" rejections on every
 * page load.
 * ========================================================================== */

import { Capacitor } from '@capacitor/core';

/** Capabilities the web layer may probe. Extend the union alongside the map. */
export type NativeCapability =
  | 'coreHapticsV1'
  | 'badgeV1'
  | 'liveActivityV1'
  | 'notificationActionsV1';

/**
 * Minimum iOS build (CFBundleVersion) that ships each capability.
 * No entry may point at an unshipped build — see RELEASE RULE above.
 */
const NATIVE_CAPABILITY_MIN_BUILD: Partial<Record<NativeCapability, number>> = {
  // HelmHapticsPlugin (Core Haptics signatures) ships in the build-10 binary
  // — this entry landed in the same change as the Swift (§ RELEASE RULE).
  coreHapticsV1: 10,
};

export interface NativeAppInfo {
  /** 'ios' | 'android' (never 'web' — web resolves to null instead). */
  platform: string;
  /** Marketing version, e.g. "2.0". */
  appVersion: string;
  /** CFBundleVersion / versionCode as a number, e.g. 9. NaN-safe: 0 when unparsable. */
  build: number;
}

let cachedInfo: NativeAppInfo | null | undefined;

/**
 * The installed binary's identity, or null on web/SSR (and on any bridge
 * failure — callers treat "unknown" exactly like "web": no native calls).
 * Cached for the session; the binary cannot change under a running WebView.
 */
export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (cachedInfo !== undefined) return cachedInfo;
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
    cachedInfo = null;
    return cachedInfo;
  }
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    const build = Number.parseInt(info.build, 10);
    cachedInfo = {
      platform: Capacitor.getPlatform(),
      appVersion: info.version,
      build: Number.isFinite(build) ? build : 0,
    };
  } catch {
    cachedInfo = null;
  }
  return cachedInfo;
}

/**
 * True only when running inside a native binary whose build ships `cap`.
 * Web, SSR, bridge failures, and unknown capabilities are all false — the
 * web experience is always the graceful fallback (§61).
 */
export async function hasNativeCapability(cap: NativeCapability): Promise<boolean> {
  const minBuild = NATIVE_CAPABILITY_MIN_BUILD[cap];
  if (minBuild === undefined) return false;
  const info = await getNativeAppInfo();
  if (!info) return false;
  return info.build >= minBuild;
}

/** Test-only: reset the session cache. */
export function __resetNativeAppInfoCacheForTests(): void {
  cachedInfo = undefined;
}
