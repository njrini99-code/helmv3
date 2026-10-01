import type { KeyboardEvent } from 'react';

/**
 * Keyboard for a `role="tablist"` (WAI-ARIA tabs, automatic activation): ← and → move to the previous or
 * next tab and wrap, Home and End go to the first and last, and each moves focus and selects. Pair it with
 * `tabIndex={selected ? 0 : -1}` on each tab, so Tab enters the list once and leaves to the panel.
 */
export function tabListKeys<T extends string>(order: readonly T[], current: T, pick: (t: T) => void, idOf: (t: T) => string) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const i = order.indexOf(current);
    const n = order.length;
    const next = e.key === 'ArrowRight' ? order[(i + 1) % n] : e.key === 'ArrowLeft' ? order[(i - 1 + n) % n] : e.key === 'Home' ? order[0] : e.key === 'End' ? order[n - 1] : undefined;
    if (next === undefined) return;
    e.preventDefault();
    if (next !== current) pick(next);
    document.getElementById(idOf(next))?.focus();
  };
}
