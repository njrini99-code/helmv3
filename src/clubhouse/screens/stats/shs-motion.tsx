'use client';

import { Component, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { CH_FADE_MS } from '../../lib/motion';

/** A figure block's crossfade on a window change (07 M-STATS-09). */
const XFADE_MS = 260;

/**
 * Marks grow once, the first time their card is a quarter in view, and never again: not on scroll back, a window change, a refresh or a
 * Try again (07 M-STATS-12 to 15). The class stays on the element, so a re-render keeps it; `at rest` draws everything seen straight away
 * (Reduce Motion, Animations off, a landing after a retry).
 */
export function useGrowOnce(root: RefObject<HTMLElement | null>, atRest: boolean, deps: readonly unknown[] = []): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.ch-shs-card:not(.is-seen)'));
    if (atRest || typeof IntersectionObserver === 'undefined') {
      for (const c of cards) c.classList.add('is-seen');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-seen');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.25 },
    );
    for (const c of cards) {
      c.classList.add('is-waiting');
      io.observe(c);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the cards present change with the caller's own list
  }, [root, atRest, ...deps]);
}

/** The window switch has reached the bar and something has passed under it (07 M-STATS-11). */
export function useStuck(): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setStuck(window.scrollY > 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return stuck;
}

/**
 * On a change of `k`, a copy of what was on screen fades out over the new content, in place (the page's `xfade`), so no figure ever shows
 * an in-between number. The chart and the green card's figures aren't in the copy: the line morphs and the figures fade by their own key.
 */
export class WindowCrossfade extends Component<{ k: string; off: boolean; reduced: boolean; children: ReactNode; className?: string }> {
  private el: HTMLDivElement | null = null;

  getSnapshotBeforeUpdate(prev: { k: string }): HTMLElement | null {
    if (prev.k === this.props.k || this.props.off || !this.el) return null;
    const ghost = this.el.cloneNode(true) as HTMLElement;
    ghost.classList.add('ch-shs-xfade-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    return ghost;
  }

  componentDidUpdate(_: unknown, __: unknown, ghost: HTMLElement | null): void {
    if (!ghost || !this.el) return;
    const host = this.el;
    ghost.style.animationDuration = `${this.props.reduced ? CH_FADE_MS : XFADE_MS}ms`;
    host.appendChild(ghost);
    ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
  }

  render(): ReactNode {
    return (
      <div
        className={'ch-shs-xfade' + (this.props.className ? ` ${this.props.className}` : '')}
        ref={(el) => {
          this.el = el;
        }}
      >
        {this.props.children}
      </div>
    );
  }
}
