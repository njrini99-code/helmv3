'use client';

import { useLayoutEffect, useRef, useState, type ElementType } from 'react';

/**
 * The one wrap-and-truncate policy (ST-1). Text that must fit one line ends in an ellipsis; text that may wrap is clamped
 * to `lines`. Either way, when the text is actually cut, the whole of it is the element's title (a pointer's tooltip)
 * and stays the accessible text, so nothing a person needs is lost to the cut. A name is never cut mid-word on two lines
 * (the clamp breaks at words). Use it instead of a page's own `text-overflow: ellipsis` rule.
 */
export function Truncate({ children, lines = 1, as: Tag = 'span', className }: { children: string; lines?: 1 | 2 | 3; as?: ElementType; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setCut(lines === 1 ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, lines]);
  return (
    <Tag ref={ref} className={'ch-trunc' + (className ? ` ${className}` : '')} data-lines={lines > 1 ? lines : undefined} title={cut ? children : undefined}>
      {children}
    </Tag>
  );
}
