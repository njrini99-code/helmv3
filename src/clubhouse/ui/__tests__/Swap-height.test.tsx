import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domMax } from 'motion/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Swap } from '../Swap';

afterEach(cleanup);

/** No height animates (shell motion, 2026-11-07): the frame takes the new content's height at once, so a swap lays nothing out per frame. */
describe('Swap', () => {
  it('pins no height and sets no transition on a key change', () => {
    const view = (k: string) => (
      <LazyMotion features={domMax}>
        <Swap swapKey={k}>
          <p>{k}</p>
        </Swap>
      </LazyMotion>
    );
    const { rerender, container } = render(view('day'));
    const frame = container.querySelector<HTMLElement>('.ch-swap')!;
    rerender(view('month'));
    expect(frame.style.height).toBe('');
    expect(frame.style.transition).toBe('');
    expect(frame.style.overflow).toBe('');
  });

  it('no Clubhouse source animates height or a filter on a push', () => {
    const src = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse', f), 'utf8');
    expect(src('ui/Swap.tsx')).not.toMatch(/transition = 'height|height: `/);
    expect(src('screens/coachhelm/file/PlayerFile.tsx')).not.toMatch(/\{ height: /);
    expect(src('lib/nav-motion.ts')).not.toMatch(/filter:/);
    expect(src('shell/use-route-swipe.ts')).not.toMatch(/filter/);
    expect(src('lib/slide-plate.ts')).not.toMatch(/scale\(/);
    expect(src('styles/controls.css')).toContain('transition: color 0s linear var(--ch-dur-press)');
  });
});
