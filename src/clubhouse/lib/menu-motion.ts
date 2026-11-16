import type { TargetAndTransition, Transition } from 'motion/react';
import { CH_DUR, CH_EASE, CH_EASE_SHEET, chTween } from './motion';

/**
 * A menu, popover, picker or hover card (motion spec 15 Nov 3.4; audit S3.5): in over the quick beat, 180ms, on the sheet
 * curve from scale .96 and clear; out over the press beat, 110ms, ease-out, to .98 and clear. It grows from the corner
 * nearest its anchor, not its centre: the caller sets `transform-origin` there. No slide. Reduce Motion (S3.9): a fade over
 * the quick beat both ways; Animations off: at once.
 *
 * Each state carries its own transition, so a caller's `transition` prop never puts the exit on the entry's curve.
 */
export function chMenuMotion(reduced: boolean): { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } {
  if (reduced) {
    const fade: Transition = chTween('quick', true);
    return { initial: { opacity: 0 }, animate: { opacity: 1, transition: fade }, exit: { opacity: 0, transition: fade } };
  }
  return {
    initial: { opacity: 0, transform: 'scale(0.96)' },
    animate: { opacity: 1, transform: 'scale(1)', transition: { duration: CH_DUR.quick, ease: [...CH_EASE_SHEET] } },
    exit: { opacity: 0, transform: 'scale(0.98)', transition: { duration: CH_DUR.press, ease: [...CH_EASE] } },
  };
}
