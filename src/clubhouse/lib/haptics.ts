import { isNativeApp, selectionChanged, selectionEnd, selectionStart, triggerHaptic, triggerSelectionHaptic } from '@/lib/utils/capacitor';
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
 *   scrub   - a continuous scrub (a slider): selection detents with the Taptic Engine kept warm, see hapticScrub
 *
 * Signature (Core Haptics) patterns are not used here: they are not approved
 * for product flows until the owner's on-device pass.
 */
export type ChHaptic = 'select' | 'press' | 'commit' | 'success' | 'warning' | 'error';

let lastSelectAt = 0;

/** Selection ticks are repeatable, but not faster than the eye can follow. */
function selectTickDue(): boolean {
  const now = Date.now();
  if (now - lastSelectAt < 40) return false;
  lastSelectAt = now;
  return true;
}

export function haptic(kind: ChHaptic): void {
  if (!isNativeApp() || !areHapticsEnabled()) return;
  const run = async () => {
    switch (kind) {
      case 'select': {
        if (!selectTickDue()) return;
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

/**
 * A continuous scrub (a slider's thumb, CH-1708): `start` as the finger lands warms the Taptic Engine, so the first
 * detent isn't late, `step` ticks each detent crossed (the same selection tick, at most every 40ms), `end` lets the
 * engine idle again. UIKit's selection generator, through the bridge's selectionStart/Changed/End. Native only and
 * preference-gated, like every haptic here.
 */
export function hapticScrub(phase: 'start' | 'step' | 'end'): void {
  if (!isNativeApp() || !areHapticsEnabled()) return;
  if (phase === 'step' && !selectTickDue()) return;
  const run = phase === 'start' ? selectionStart : phase === 'step' ? selectionChanged : selectionEnd;
  run().catch(() => {});
}
