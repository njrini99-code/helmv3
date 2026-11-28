'use client';

import { useEffect } from 'react';

/**
 * j and k move between the rows of the feed (issues, pages or errors); Enter opens the focused one, as any link does.
 * Lowercase only: the admin's tab shortcuts are Shift+letter and plain r refreshes (admin-nav.ts), so neither is taken.
 * Typing in a field, or holding a modifier, leaves the keys alone.
 */
export function FeedKeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'j' && e.key !== 'k') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const rows = [...document.querySelectorAll<HTMLElement>('.bs [data-feed-row]')];
      if (!rows.length) return;
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      const at = active ? rows.indexOf(active) : -1;
      // From outside the list, j starts at the selected row (or the first) and k at the last.
      const selected = rows.findIndex((r) => r.getAttribute('aria-current') === 'true');
      const next = at === -1 ? (e.key === 'j' ? Math.max(0, selected) : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)));
      const row = rows[next]!;
      row.focus();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return null;
}
