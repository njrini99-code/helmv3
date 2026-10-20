'use client';

import { Check } from 'lucide-react';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Where the flow is (CH-15622). On the desktop, the sections in a pill rail with one felt-green thumb that slides to
 * the current section and takes its width. The thumb is a green layer holding the same labels in ivory, clipped to
 * the current section, so the text turns ivory exactly where the thumb is and nothing is laid out again while it
 * moves. On the phone, "2 of 5" over a hairline that fills as the questions advance. The thumb is placed before
 * the first paint and only animates once placed; reduced motion and Animations off move it at once (the tokens).
 */
export function Rail({ sections, current, full }: { sections: string[]; current: number; full: boolean }) {
  const nav = useRef<HTMLElement>(null);
  const layout = sections.join('|');

  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const place = () => {
      const seg = el.querySelectorAll<HTMLElement>(':scope > .ch-ox-rail__s')[current];
      if (!seg) return;
      el.style.setProperty('--ch-ox-thumb-l', `${seg.offsetLeft}px`);
      el.style.setProperty('--ch-ox-thumb-w', `${seg.offsetWidth}px`);
    };
    place();
    // Moving starts only after the first placement, so the thumb never flies in from the edge on arrival.
    const armed = requestAnimationFrame(() => el.setAttribute('data-armed', ''));
    // The labels change width when the font arrives and when a matched code lengthens the rail.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(armed);
      ro?.disconnect();
    };
  }, [layout, current]);

  const labels = (live: boolean) =>
    sections.map((s, i) => (
      <span
        key={s}
        className="ch-ox-rail__s"
        data-state={live ? (i === current ? 'cur' : i < current ? 'done' : undefined) : undefined}
        aria-current={live && i === current ? 'step' : undefined}
      >
        {i < current && <Icon icon={Check} size={12} />}
        {s}
      </span>
    ));

  return (
    <>
      <nav ref={nav} className="ch-ox-rail" aria-label="Progress">
        {labels(true)}
        <span className="ch-ox-rail__thumb" aria-hidden="true" data-on={current >= 0 ? '' : undefined}>
          {labels(false)}
        </span>
      </nav>
      <span
        className="ch-ox-rail__m"
        aria-hidden={full ? true : undefined}
        style={{ ['--ch-ox-p' as string]: current >= 0 ? String((current + 1) / sections.length) : '0' } as CSSProperties}
      >
        {current >= 0 ? `${current + 1} of ${sections.length}` : ''}
      </span>
    </>
  );
}
