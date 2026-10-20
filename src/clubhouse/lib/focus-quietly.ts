/**
 * Focus that code hands back (a closed panel or dialog returning focus to what opened it) is not the person arriving
 * on a target: it must not open the hover card 600 ms later (audit A-25, 2026-10-14). Marks the element for its next
 * focus only.
 */
export function chFocusQuietly(el: HTMLElement): void {
  el.dataset.chPeekQuiet = '';
  el.focus({ preventScroll: true });
  // A target that was already focused gets no focus event: don't leave the mark on it for a later, real arrival.
  queueMicrotask(() => delete el.dataset.chPeekQuiet);
}
