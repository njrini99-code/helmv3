import type { ReactNode } from 'react';

/**
 * Content that scrolls sideways on a narrow screen (a scorecard, a wide
 * table). Keyboard users need to reach it to scroll it with the arrow keys
 * (WCAG 2.1.1; axe scrollable-region-focusable), so it is a named region
 * that takes focus. This is the one place Clubhouse puts tabIndex on a
 * non-control.
 */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll region must be focusable to be scrolled by keyboard
    <div role="region" aria-label={label} tabIndex={0} className={'ch-scroll' + (className ? ` ${className}` : '')}>
      {children}
    </div>
  );
}
