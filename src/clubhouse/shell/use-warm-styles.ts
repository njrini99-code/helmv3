'use client';

import { useEffect } from 'react';
import { preinit } from 'react-dom';
import { whenIdle } from './use-prefetch-tabs';

/**
 * F-26 (audit 2026-11-19): a section's stylesheet in the document before the first switch to it.
 *
 * Fetching a page ahead (use-prefetch-tabs, a link's prefetch) leaves its stylesheets as `<link rel="preload" as="style">`
 * hints. Once a hint has loaded, React counts the sheet as ready and inserts it in the switch's own commit without waiting.
 * WebKit applies a stylesheet inserted by script only after it loads, even from the cache, so the switch's first frames
 * drew the page unstyled: the player's Rounds and Team Hub headings moved down 30 and 60 px when their sheet arrived
 * (1 to 2 frames from a cached sheet, about a second with the network busy). Turning each hint into its stylesheet while
 * the thread is idle, through React's own `preinit`, puts the sheet in place before any tap: the switch then finds it
 * there, inserts nothing, and draws the page styled in its first frame. Every page stylesheet is scoped to its own page
 * class (`.ch-rd-`, `.ch-hb-`, `clubhouse:check`), so a sheet in place early changes nothing on the page on screen.
 */

type Preinit = (href: string, options: { as: 'style'; precedence: string; crossOrigin?: string }) => void;

/** Next's own build output: the only stylesheets this warms. */
const NEXT_STATIC = '/_next/static/';

function pathOf(href: string, base: string): string | null {
  try {
    return new URL(href, base).pathname;
  } catch {
    return null;
  }
}

/** The style hints in `doc` whose stylesheet is not in the document yet, in the order they were added. */
export function stylesToWarm(doc: Document): Array<{ href: string; crossOrigin?: string }> {
  const have = new Set(Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'), (l) => l.getAttribute('href')));
  const out: Array<{ href: string; crossOrigin?: string }> = [];
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="style"][href]'))) {
    const href = link.getAttribute('href');
    if (!href || have.has(href) || out.some((x) => x.href === href)) continue;
    if (!pathOf(href, doc.baseURI)?.startsWith(NEXT_STATIC)) continue;
    const crossOrigin = link.getAttribute('crossorigin');
    out.push(crossOrigin == null ? { href } : { href, crossOrigin });
  }
  return out;
}

/** The precedence Next gives its route stylesheets (`next` in a production build), read from one already in place. */
export function nextPrecedence(doc: Document): string {
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-precedence]'))) {
    const p = link.getAttribute('data-precedence');
    if (p && p.startsWith('next')) return p;
  }
  return 'next';
}

/** Puts one waiting sheet in place, once per address (`tried`); returns whether there was one. */
export function warmOneStyle(doc: Document, tried: Set<string>, insert: Preinit = preinit as Preinit): boolean {
  const next = stylesToWarm(doc).find((x) => !tried.has(x.href));
  if (!next) return false;
  tried.add(next.href);
  insert(next.href, { as: 'style', precedence: nextPrecedence(doc), ...(next.crossOrigin != null ? { crossOrigin: next.crossOrigin } : {}) });
  return true;
}

/**
 * Watches the document's head for style hints and puts their stylesheets in place one at a time when the thread is idle,
 * so the page on screen, a tap and its switch always go first.
 */
export function useWarmStyles(): void {
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const tried = new Set<string>();
    const step = () => {
      cancel = null;
      if (warmOneStyle(document, tried)) schedule();
    };
    const schedule = () => {
      if (!cancel) cancel = whenIdle(step);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.head, { childList: true });
    schedule();
    return () => {
      mo.disconnect();
      cancel?.();
    };
  }, []);
}
