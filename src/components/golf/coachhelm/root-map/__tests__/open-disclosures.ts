import { fireEvent } from '@testing-library/react';

/** The trigger buttons of the closed `Disclosure`s under `root` (not other
 *  aria-expanded buttons such as the ladder's "+N more"). */
export function closedDisclosureTriggers(root: ParentNode = document): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-open="false"] button[aria-expanded="false"]')].filter(
    (b) => {
      const wrap = b.closest('[data-open]');
      return b.parentElement === wrap || b.parentElement?.parentElement === wrap;
    },
  );
}

/** Opens every collapsed `Disclosure` under `root`, nested ones included. */
export function openDisclosures(root: ParentNode = document): void {
  for (let i = 0; i < 20; i += 1) {
    const closed = closedDisclosureTriggers(root);
    if (closed.length === 0) return;
    closed.forEach((b) => fireEvent.click(b));
  }
}
