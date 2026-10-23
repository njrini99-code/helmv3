'use client';

import { useEffect, type RefObject } from 'react';

/**
 * A list of rows walked with the arrow keys (B11): ↓ and ↑ move focus to the next and previous row, Home and End to the
 * first and last, and the list is one Tab stop (roving tabindex): the row last focused, else the chosen one
 * (`aria-current`/`aria-selected`), else the first, keeps tabindex 0 and the rest take -1. Rows are found by `selector`
 * inside `root`, so rows that arrive, leave or reorder are picked up as they are; a row that is leaving
 * (`[data-leaving]`) is skipped. A key typed in a field inside the list is left alone.
 */
export function useRovingRows(root: RefObject<HTMLElement | null>, selector: string, /** Re-attach when the list mounts (a popover's). */ shown = true) {
  useEffect(() => {
    const el = root.current;
    if (!el || !shown) return;
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>(selector)).filter((r) => !r.closest('[data-leaving]'));
    let last: HTMLElement | null = null;
    const settle = () => {
      const all = rows();
      if (!all.length) return;
      const keep = (last && all.includes(last) ? last : null) ?? all.find((r) => r.matches('[aria-current="true"], [aria-current="page"], [aria-selected="true"]')) ?? all[0]!;
      for (const r of all) r.tabIndex = r === keep ? 0 : -1;
    };
    const onKey = (e: KeyboardEvent) => {
      const row = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
      if (!row || !el.contains(row) || e.altKey || e.metaKey || e.ctrlKey) return;
      if ((e.target as Element).matches('input, textarea, select, [contenteditable="true"]')) return;
      const all = rows();
      const i = all.indexOf(row);
      const to = e.key === 'ArrowDown' ? all[i + 1] : e.key === 'ArrowUp' ? all[i - 1] : e.key === 'Home' ? all[0] : e.key === 'End' ? all.at(-1) : undefined;
      if (!to) return;
      e.preventDefault();
      to.focus();
    };
    const onFocus = (e: FocusEvent) => {
      const row = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
      if (!row || !el.contains(row)) return;
      last = row;
      settle();
    };
    settle();
    // Rows come and go with the data; keep exactly one Tab stop as they do.
    const mo = new MutationObserver(settle);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('keydown', onKey);
    el.addEventListener('focusin', onFocus);
    return () => {
      mo.disconnect();
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('focusin', onFocus);
    };
  }, [root, selector, shown]);
}
