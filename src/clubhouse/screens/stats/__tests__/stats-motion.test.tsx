import { fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WindowCrossfade } from '../shs-motion';

describe('WindowCrossfade', () => {
  it('lays a fading copy over the page on a window change only', () => {
    const { container, rerender } = render(
      <WindowCrossfade k="a" off={false} reduced={false}>
        <p>old</p>
      </WindowCrossfade>,
    );
    rerender(
      <WindowCrossfade k="a" off={false} reduced={false}>
        <p>same window</p>
      </WindowCrossfade>,
    );
    expect(container.querySelector('.ch-shs-xfade-ghost')).toBeNull();
    rerender(
      <WindowCrossfade k="b" off={false} reduced={false}>
        <p>new</p>
      </WindowCrossfade>,
    );
    expect(container.querySelector('.ch-shs-xfade-ghost')?.textContent).toBe('same window');
    expect(container.querySelector('.ch-shs-xfade-ghost')?.getAttribute('aria-hidden')).toBe('true');
  });

  // MOTION-AND-VISUAL 3.12: the copy fades on motion.css's ch-out (no keyframe of its own), so its animationend still
  // comes and still takes the copy away.
  it('fades the copy on the shared ch-out keyframe and removes it on its animationend', () => {
    const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
    expect(css('stats-redesign.css')).toMatch(/\.ch-shs-xfade-ghost \{[^}]*animation: ch-out var\(--ch-dur-base\)/);
    expect(css('stats-redesign.css')).not.toMatch(/@keyframes/);
    expect(css('motion.css')).toMatch(/@keyframes ch-out \{\s*to \{\s*opacity: 0;/);
    const { container, rerender } = render(
      <WindowCrossfade k="a" off={false} reduced={false}>
        <p>old</p>
      </WindowCrossfade>,
    );
    rerender(
      <WindowCrossfade k="b" off={false} reduced={false}>
        <p>new</p>
      </WindowCrossfade>,
    );
    const ghost = container.querySelector('.ch-shs-xfade-ghost')!;
    expect(ghost).not.toBeNull();
    fireEvent.animationEnd(ghost);
    expect(container.querySelector('.ch-shs-xfade-ghost')).toBeNull();
  });
});
