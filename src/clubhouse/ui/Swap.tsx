'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { CH_DUR, CH_EASE, chSpring } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * A content swap inside a fixed frame (owner, 2026-10-07: "super duper premium" motion). When `swapKey` changes the
 * old content leaves and the new arrives in the same place: `settle` crossfades with a 6px rise (a tab's panel, a
 * chart's mode, a window's figures); `slide` moves 12px in the direction of travel (a pager, the next hole). The
 * incoming copy fades in over base and travels on the settle spring (base, bounce 0.1; CH-1616), the outgoing fades
 * over the quick one, so the new content is always the one being read. First paint never animates
 * (`initial={false}`), reduced motion and Animations off swap instantly, and the leaving copy is hidden from assistive
 * tech and focus while it fades. A block frame eases from the old content's height to the new one's (B7), clipped, so
 * what sits below glides instead of jumping; it is measured only when the key changes and is `auto` again after.
 */
export function Swap({
  swapKey,
  kind = 'settle',
  dir = 1,
  className,
  inline = false,
  resize = 'ease',
  children,
}: {
  swapKey: string | number;
  kind?: 'settle' | 'slide';
  /** `slide` only: 1 when moving forward (the next round, the next hole), -1 when moving back. */
  dir?: 1 | -1;
  className?: string;
  /** A figure inside a line of text (a stat's value): spans, laid out inline. */
  inline?: boolean;
  /**
   * How the frame's height follows a swap. `ease` glides it (B7); `instant` takes the new height at once, as reduced motion
   * does, for a swap whose following siblings are the rest of the page (Calendar's Day/Month, F-0007: a page-long height
   * glide reflows everything below it every frame). The incoming copy still settles in on the compositor either way.
   */
  resize?: 'ease' | 'instant';
  children: ReactNode;
}) {
  const reduced = useChReducedMotion();
  const frame = useSwapHeight(swapKey, inline || reduced || resize === 'instant');
  const Frame = inline ? 'span' : 'div';
  const Item = inline ? m.span : m.div;
  return (
    <Frame ref={frame as never} className={'ch-swap' + (inline ? ' ch-swap--inline' : '') + (className ? ` ${className}` : '')}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <Item
          key={swapKey}
          className="ch-swap__item"
          custom={dir}
          variants={reduced ? INSTANT : kind === 'slide' ? SLIDE : SETTLE}
          initial="enter"
          animate="shown"
          exit="leave"
        >
          <Leaving inline={inline}>{children}</Leaving>
        </Item>
      </AnimatePresence>
    </Frame>
  );
}

/**
 * B7: the frame's height follows a swap. Its resting height is kept as it changes (a ResizeObserver, no reads on render);
 * when `key` changes, the frame is pinned at that height and eased to the new content's over the quick duration with its
 * content clipped, then let go to `auto`. A key change mid-ease starts from where the frame is.
 */
export function useSwapHeight(key: string | number, off: boolean) {
  const frame = useRef<HTMLElement | null>(null);
  const rest = useRef<number | null>(null);
  const shown = useRef(key);
  useEffect(() => {
    const el = frame.current;
    if (!el || off) return;
    rest.current = el.offsetHeight;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!el.style.height) rest.current = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [off]);
  useLayoutEffect(() => {
    if (shown.current === key) return;
    shown.current = key;
    const el = frame.current;
    if (!el || off) return;
    const from = el.style.height ? el.getBoundingClientRect().height : rest.current;
    el.style.height = '';
    const to = el.offsetHeight;
    if (from == null || Math.abs(to - from) < 1) return;
    el.style.transition = 'none';
    el.style.overflow = 'clip';
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.transition = 'height var(--ch-dur-quick) var(--ch-ease)';
    el.style.height = `${to}px`;
    const done = () => {
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
      rest.current = el.offsetHeight;
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') done();
    };
    el.addEventListener('transitionend', onEnd);
    // In case the transition never ends (a hidden tab, a zero duration): let go just after it would have.
    const t = window.setTimeout(done, CH_DUR.quick * 1000 + 80);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(t);
    };
  }, [key, off]);
  return frame;
}

/** The leaving copy keeps its pixels for the fade but drops out of the accessibility tree and focus order at once. */
function Leaving({ inline, children }: { inline: boolean; children: ReactNode }) {
  const present = useIsPresent();
  const Body = inline ? 'span' : 'div';
  return (
    <Body className="ch-swap__body" aria-hidden={present ? undefined : true} inert={!present}>
      {children}
    </Body>
  );
}

const IN = { ...chSpring('settle'), opacity: { duration: CH_DUR.base, ease: CH_EASE } };
const OUT = { duration: CH_DUR.quick, ease: CH_EASE };

// Transform strings, not framer's `x`/`y`: Motion hands them to the compositor (WAAPI), so a swap keeps moving while
// the new content renders (owner, 2026-10-15: "All transitions need fixed").
const SETTLE = {
  enter: { opacity: 0, transform: 'translate(0px, 6px)' },
  shown: { opacity: 1, transform: 'translate(0px, 0px)', transition: IN },
  leave: { opacity: 0, transform: 'translate(0px, -3px)', transition: OUT },
};

const SLIDE = {
  enter: (d: 1 | -1) => ({ opacity: 0, transform: `translate(${12 * d}px, 0px)` }),
  shown: { opacity: 1, transform: 'translate(0px, 0px)', transition: IN },
  leave: (d: 1 | -1) => ({ opacity: 0, transform: `translate(${-12 * d}px, 0px)`, transition: OUT }),
};

const INSTANT = {
  enter: { opacity: 1 },
  shown: { opacity: 1, transition: { duration: 0 } },
  leave: { opacity: 0, transition: { duration: 0 } },
};
