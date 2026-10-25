'use client';

import { useEffect, useRef } from 'react';
import { useRovingRows } from '../lib/roving';

/**
 * `useRovingRows` from inside a list's own Suspense boundary (a SectionBoundary). The hook on a page's outer element runs
 * as soon as the page hydrates, while a boundary's server HTML can still be waiting to hydrate, and React reports the tab
 * stops it finds there as a mismatch (qualifiers-hydration.test). Rendered inside the boundary, this runs once that
 * boundary has hydrated. It draws nothing, so no sibling rule shifts; it walks `selector` inside the page's `within`.
 */
export function RovingRows({ selector, within }: { selector: string; within: string }) {
  const root = useRef<HTMLElement | null>(null);
  // Declared before the hook, so the root is found before the hook's effect reads it.
  useEffect(() => {
    root.current = document.querySelector<HTMLElement>(within);
  }, [within]);
  useRovingRows(root, selector);
  return null;
}
