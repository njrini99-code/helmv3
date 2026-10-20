/**
 * Keeps keyboard focus on a control that is disabled while its own write runs (audit A-21, 2026-10-14). About 45
 * controls set `disabled` while pending (RSVP, task check, Assign/Dismiss, Accept/Decline); WebKit then drops focus to
 * <body> without a blur, so a keyboard or VoiceOver user lost their place after every such tap. While the control is
 * disabled nothing can hold focus on it, but when it comes back and focus is still nowhere, it returns there.
 */
export function chKeepFocusThroughDisable(root: HTMLElement): () => void {
  let last: HTMLElement | null = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
  let parked: HTMLElement | null = null;
  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement) last = e.target;
    parked = null;
  };
  const nowhere = () => !document.activeElement || document.activeElement === document.body;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (!(el instanceof HTMLElement)) continue;
      if ((el as HTMLButtonElement).disabled) {
        if (el === last && (nowhere() || document.activeElement === el)) parked = el;
      } else if (el === parked) {
        parked = null;
        if (el.isConnected && nowhere() && !el.closest('[inert]')) el.focus({ preventScroll: true });
      }
    }
  });
  root.addEventListener('focusin', onFocusIn);
  mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  return () => {
    root.removeEventListener('focusin', onFocusIn);
    mo.disconnect();
  };
}
