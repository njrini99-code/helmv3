'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** A link or an enabled button: what a row must be to take focus. */
const isControl = (r: HTMLElement) => (r.matches('a[href]') || r.matches('button')) && !(r as HTMLButtonElement).disabled;

/**
 * A list of rows walked with the arrow keys (B11): ↓ and ↑ move focus to the next and previous row, Home and End to the
 * first and last, and the list is one Tab stop (roving tabindex): the row last focused, else the chosen one
 * (`aria-current`/`aria-selected`), else the first, keeps tabindex 0 and the rest take -1. Rows are found by `selector`
 * inside `root`, so rows that arrive, leave or reorder are picked up as they are; a row that is leaving
 * (`[data-leaving]`) is skipped, and so is anything that isn't a link or an enabled button (a skeleton's placeholder
 * row). A key typed in a field inside the list is left alone.
 *
 * `letters` (a desk table, premium plan S7): J and K step down and up too, as in Mail, Gmail and Linear. A row whose
 * row element is `aria-current` (a table’s selected row) keeps the Tab stop as a chosen control does.
 */
export function useRovingRows(
  root: RefObject<HTMLElement | null>,
  selector: string,
  /** Re-attach when the list mounts (a popover’s). */ shown = true,
  { letters = false, onMove }: { letters?: boolean; /** The keys moved focus to this row (a table's selection follows it). */ onMove?: (row: HTMLElement) => void } = {},
) {
  const moved = useRef(onMove);
  moved.current = onMove;
  useEffect(() => {
    const el = root.current;
    if (!el || !shown) return;
    // Only rows that are controls: a loading skeleton's placeholder rows share the class (Messages, Settings) but are
    // plain boxes, and must never take the Tab stop (#2361 audit).
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>(selector)).filter((r) => !r.closest('[data-leaving]') && isControl(r));
    let last: HTMLElement | null = null;
    const settle = () => {
      const all = rows();
      if (!all.length) return;
      const chosen = (r: HTMLElement) => r.matches('[aria-current="true"], [aria-current="page"], [aria-selected="true"]') || r.closest('[role="row"][aria-current="true"]') !== null;
      const keep = (last && all.includes(last) ? last : null) ?? all.find(chosen) ?? all[0]!;
      for (const r of all) r.tabIndex = r === keep ? 0 : -1;
    };
    const onKey = (e: KeyboardEvent) => {
      const row = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
      if (!row || !el.contains(row) || e.altKey || e.metaKey || e.ctrlKey) return;
      if ((e.target as Element).matches('input, textarea, select, [contenteditable="true"]')) return;
      const all = rows();
      const i = all.indexOf(row);
      const key = letters && !e.shiftKey && (e.key === 'j' || e.key === 'k') ? (e.key === 'j' ? 'ArrowDown' : 'ArrowUp') : e.key;
      const to = key === 'ArrowDown' ? all[i + 1] : key === 'ArrowUp' ? all[i - 1] : key === 'Home' ? all[0] : key === 'End' ? all.at(-1) : undefined;
      if (!to) return;
      e.preventDefault();
      to.focus();
      moved.current?.(to);
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
  }, [root, selector, shown, letters]);
}
