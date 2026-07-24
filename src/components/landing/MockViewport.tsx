'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { GLASS_BEZEL } from './glass';

/**
 * Mobile presentation for the fixed-width product mockups: fit the WHOLE
 * surface to the phone width (no horizontal scroll), via a transform-scale
 * embed. Desktop uses <ScaledEmbed> (fit-to-frame) instead.
 */

interface FitEmbedProps {
  designWidth: number;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

/**
 * Fit-to-width embed for the fixed-width mockups — the WHOLE surface shows,
 * scaled down to the container, no horizontal scroll (Nick: "shouldn't have to
 * scroll, it should just be smaller").
 *
 * Uses `transform: scale()`, NOT CSS `zoom`. `zoom` at small factors (~0.3 on a
 * phone) mis-lays-out text in Chromium/Edge — glyphs land on top of each other
 * and avatars spill their box (the "DC doesn't fit, words are overwritten" bug).
 * A transform keeps the mock's real 1280px layout intact and only scales the
 * painted result; we reserve the scaled height on the wrapper so there's no
 * dead space or clipping.
 */
export function FitEmbed({ designWidth, ariaLabel, className, children }: FitEmbedProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const apply = () => {
      const w = outer.clientWidth;
      if (!w) return;
      const scale = w / designWidth;
      inner.style.transform = `scale(${scale})`;
      // transform() doesn't shrink the layout box, so reserve the scaled
      // height explicitly — the frame ends up exactly as tall as the visible
      // mock (offsetHeight is the untransformed 1280px-wide layout height).
      outer.style.height = `${inner.offsetHeight * scale}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <div className="rounded-2xl p-1" style={GLASS_BEZEL}>
        <div ref={outerRef} className="relative overflow-hidden rounded-xl bg-surface">
          <div ref={innerRef} aria-hidden="true" style={{ width: designWidth, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
