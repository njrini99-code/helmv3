/**
 * Helm signature haptics — the web bridge to `HelmHapticsPlugin` (§22).
 *
 * Signature patterns are the RARE designed moments (round submit, milestone,
 * hard reject) that the stock impact/selection grammar can't express. This
 * module is the only caller surface:
 *
 *   await playHelmSignature('helmCommit');
 *
 * Layered guarantees, in order:
 *  1. User preference — the shared `areHapticsEnabled()` gate (same gate as
 *     every other haptic path; plan §23).
 *  2. Capability — `hasNativeCapability('coreHapticsV1')`: false on web, on
 *     pre-build-10 binaries, and on any bridge failure (§61).
 *  3. Hardware/engine — the native side resolves `{ played: false }` instead
 *     of rejecting; callers get a graceful UIFeedbackGenerator fallback here.
 *
 * FEEL TUNING: pattern curves live in HelmHapticsPlugin.swift and are only
 * "approved" after the owner's physical-device pass (plan §13/§72) — do not
 * wire these into product flows until that sign-off.
 */

import { registerPlugin } from '@capacitor/core';
import { areHapticsEnabled } from '@/lib/utils/haptics-pref';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { hasNativeCapability } from './capabilities';

export type HelmSignaturePattern = 'helmCommit' | 'helmReject' | 'helmMilestone';

interface HelmHapticsBridge {
  isAvailable(): Promise<{ available: boolean }>;
  play(options: { pattern: HelmSignaturePattern }): Promise<{ played: boolean }>;
}

const HelmHaptics = registerPlugin<HelmHapticsBridge>('HelmHaptics');

/** The stock-grammar stand-in when the signature engine can't play. */
const FALLBACK: Record<HelmSignaturePattern, 'medium' | 'error' | 'success'> = {
  helmCommit: 'medium',
  helmReject: 'error',
  helmMilestone: 'success',
};

/**
 * Play a signature pattern; falls back to the stock haptic grammar when the
 * binary, hardware, or engine can't. Resolves true only when the Core
 * Haptics pattern itself played.
 */
export async function playHelmSignature(pattern: HelmSignaturePattern): Promise<boolean> {
  if (!areHapticsEnabled()) return false;
  if (!(await hasNativeCapability('coreHapticsV1'))) {
    await triggerHaptic(FALLBACK[pattern]);
    return false;
  }
  try {
    const { played } = await HelmHaptics.play({ pattern });
    if (!played) await triggerHaptic(FALLBACK[pattern]);
    return played;
  } catch {
    await triggerHaptic(FALLBACK[pattern]);
    return false;
  }
}
