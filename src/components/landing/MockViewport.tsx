'use client';

import type { ReactNode } from 'react';
import { GLASS_BEZEL } from './glass';

/**
 * Mobile presentation for the fixed-width product mockups: instead of
 * shrinking a 1280px surface to an unreadable 0.29× on a phone, show it at a
 * legible zoom inside a swipeable viewport with soft edge fades. Desktop
 * uses <ScaledEmbed> (fit-to-frame) instead.
 */

interface MobileMockScrollerProps {
  designWidth: number;
  /** Legible fixed zoom for phone widths. */
  zoom?: number;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

export function MobileMockScroller({ designWidth, zoom = 0.55, ariaLabel, className, children }: MobileMockScrollerProps) {
  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <div className="relative rounded-2xl p-1" style={GLASS_BEZEL}>
        <div className="relative overflow-hidden rounded-xl bg-surface">
          <div aria-hidden="true" className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <div style={{ width: designWidth, zoom }}>{children}</div>
          </div>
          {/* Edge fade hints that the surface continues */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10"
            style={{ background: 'linear-gradient(270deg, oklch(0.953 0.022 83 / 0.85), transparent)' }}
          />
        </div>
      </div>
      <p aria-hidden="true" className="mt-2 text-center font-fw-mono text-[0.6875rem] uppercase tracking-[0.12em] text-text-tertiary">
        Swipe to explore
      </p>
    </div>
  );
}
