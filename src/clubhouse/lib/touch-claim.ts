/**
 * P-4 4.7.1: who owns the current touch. A draggable calendar row claims it on touchstart (`pending`: a hold may still
 * lift it) and again at the lift (`lifted`: the drag owns it). Pull to refresh waits while a claim is pending and stays
 * off once the row has lifted, so a hold that turns into a drag never also pulls the page. The claim goes back to `idle`
 * when the touch ends, is cancelled, or its hold gives up. Module state: there is one finger in charge at a time.
 */
export type ChTouchClaim = 'idle' | 'pending' | 'lifted';

let claim: ChTouchClaim = 'idle';
let armed = false;

const release = () => {
  claim = 'idle';
  armed = false;
  document.removeEventListener('touchend', release, true);
  document.removeEventListener('touchcancel', release, true);
};

export function touchClaim(): ChTouchClaim {
  return claim;
}

/** Claim the touch for a row: `pending` on touchstart, `lifted` at the lift. It lets go when the touch ends. */
export function claimTouch(to: Exclude<ChTouchClaim, 'idle'>): void {
  claim = to;
  if (armed || typeof document === 'undefined') return;
  armed = true;
  document.addEventListener('touchend', release, true);
  document.addEventListener('touchcancel', release, true);
}

/** The hold gave up (a scroll, a move past the slop): the touch is the page's again. */
export function releaseTouch(): void {
  if (claim !== 'idle' || armed) release();
}
