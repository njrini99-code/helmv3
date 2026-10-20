'use client';

import type { ComponentPropsWithoutRef, MutableRefObject } from 'react';
import { useHScroll } from './use-hscroll';

/**
 * A block that scrolls sideways and shows it: the element keeps its own class and rules, this adds `.ch-hscroll` and the
 * edge tracking (ui/use-hscroll.ts). For an element a component already holds a ref on, use the hook instead.
 */
export function SideScroll({
  as: Tag = 'div',
  className,
  scrollRef,
  ...rest
}: ComponentPropsWithoutRef<'div'> & { as?: 'div' | 'section' | 'ul'; scrollRef?: MutableRefObject<HTMLDivElement | null> }) {
  const edges = useHScroll<HTMLDivElement>(scrollRef);
  const Element = Tag as 'div';
  return <Element ref={edges} className={'ch-hscroll' + (className ? ` ${className}` : '')} {...rest} />;
}
