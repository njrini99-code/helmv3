import { isNativeApp, triggerHaptic, triggerSelectionHaptic } from '@/lib/utils/capacitor';
import { areHapticsEnabled } from '@/lib/utils/haptics-pref';

/**
 * Clubhouse haptic grammar. Every call is fire-and-forget and a no-op on the
 * web, when the user turned haptics off, or when the bridge fails.
 *
 * When each fires follows the v2 design (D-70); every other tap is silent.
 *   select  - v2 selection: tabs, segmented controls, switches, pickers, choices, checkboxes
 *   press   - v2 light: primary buttons (and their shortcut), a long press opening a sheet
 *   commit  - v2 medium: only a sheet settling at a stop (dragged shut), or a shot logged
 *   success - Post, Save, Import, Publish, Send, Share, Assign, Got it: a write that landed
 *   warning - Remove, Delete, Discard, Dismiss, and a refused retry while offline
 *   error   - a write, import or sync that failed
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
