import { isNativeApp, triggerHaptic, triggerSelectionHaptic } from '@/lib/utils/capacitor';
import { areHapticsEnabled } from '@/lib/utils/haptics-pref';

/**
 * Clubhouse haptic grammar. Every call is fire-and-forget and a no-op on the
 * web, when the user turned haptics off, or when the bridge fails.
 *
 *   select  - a detent: tabs, segmented, chips, pager steps
 *   press   - a light tap: primary buttons, row open
 *   commit  - a weighted tap: something was saved or sent
 *   success / warning / error - outcomes only, owned by the OS
 *
 * Signature (Core Haptics) patterns are not used here: they are not approved
 * for product flows until the owner's on-device pass.
 */
export type ChHaptic = 'select' | 'press' | 'commit' | 'success' | 'warning' | 'error';

let lastSelectAt = 0;

export function haptic(kind: ChHaptic): void {
  if (!isNativeApp() || !areHapticsEnabled()) return;
  const run = async () => {
    switch (kind) {
      case 'select': {
        // Selection ticks are repeatable, but not faster than the eye can follow.
        const now = Date.now();
        if (now - lastSelectAt < 40) return;
        lastSelectAt = now;
        await triggerSelectionHaptic();
        return;
      }
      case 'press':
        await triggerHaptic('light');
        return;
      case 'commit':
        await triggerHaptic('medium');
        return;
      default:
        await triggerHaptic(kind);
    }
  };
  run().catch(() => {});
}
