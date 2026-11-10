'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import { CH_DUR, CH_FADE_MS } from '../../lib/motion';

/** A figure block's crossfade on a window change (07 M-STATS-09). */
const XFADE_MS = CH_DUR.base * 1000;


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

  override getSnapshotBeforeUpdate(prev: { k: string }): HTMLElement | null {
    if (prev.k === this.props.k || this.props.off || !this.el) return null;
    const ghost = this.el.cloneNode(true) as HTMLElement;
    // A copy still fading from the last switch isn't part of what's on screen now.
    for (const old of ghost.querySelectorAll('.ch-shs-xfade-ghost')) old.remove();
    ghost.classList.add('ch-shs-xfade-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    return ghost;
  }

  override componentDidUpdate(_: unknown, __: unknown, ghost: HTMLElement | null): void {
    if (!ghost || !this.el) return;
    const host = this.el;
    ghost.style.animationDuration = `${this.props.reduced ? CH_FADE_MS : XFADE_MS}ms`;
    host.appendChild(ghost);
    // Off a timer too: with Animations off the copy never animates, so it would never say it finished.
    const done = () => ghost.remove();
    ghost.addEventListener('animationend', (e) => {
      if (e.target === ghost) done();
    });
    window.setTimeout(done, XFADE_MS + 100);
  }

  override render(): ReactNode {
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
