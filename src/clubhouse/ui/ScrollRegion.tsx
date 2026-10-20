'use client';

import type { ReactNode } from 'react';
import { useHScroll } from './use-hscroll';

/**
 * Content that scrolls sideways on a narrow screen (a scorecard, a wide
 * table). Keyboard users need to reach it to scroll it with the arrow keys
 * (WCAG 2.1.1; axe scrollable-region-focusable), so it is a named region
 * that takes focus. This is the one place Clubhouse puts tabIndex on a
 * non-control. Its clipped edge fades (`.ch-hscroll`, ui.css); `fade={false}`
 * for a region that draws its own shadow, which a fade would clip.
 */
export function ScrollRegion({ label, className, fade = true, children }: { label: string; className?: string; fade?: boolean; children: ReactNode }) {
  const edges = useHScroll<HTMLDivElement>();
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll region must be focusable to be scrolled by keyboard
    <div ref={fade ? edges : undefined} role="region" aria-label={label} tabIndex={0} className={'ch-scroll' + (fade ? ' ch-hscroll' : '') + (className ? ` ${className}` : '')}>
      {children}
    </div>
  );
}
