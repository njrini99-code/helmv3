import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../../__tests__/_scan';
import { Head } from '../parts';

const src = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A player's own CoachHelm on a desk (fix wave 2026-11-11): the page's canvas and the tight page head, as their other
 * pages, where the pages sat on a brighter sheet with its own rounded top and a double rule over the title. The coach's
 * pages keep the sheet and the full head.
 */
describe('a player’s CoachHelm sits on the page canvas', () => {
  it('Head marks the tight page head only when asked', () => {
    const { container, rerender } = render(<Head tight>One line.</Head>);
    expect(container.querySelector('header')!.getAttribute('data-canopy-head')).toBe('tight');
    rerender(<Head>One line.</Head>);
    expect(container.querySelector('header')!.getAttribute('data-canopy-head')).toBe('');
  });

  it('the player’s Board, views and their skeletons ask for it', () => {
    expect(src('screens/coachhelm/PlayerBoard.tsx')).toMatch(/<Head phone=\{phone\} tight aside=/);
    // The views' frame is also a coach's view of one player, which keeps the full head.
    expect(src('screens/coachhelm/views/Frame.tsx')).toMatch(/<Head phone=\{phone\} tight=\{!coach\} aside=/);
    expect(src('screens/coachhelm/CoachHelmSkeleton.tsx')).toMatch(/className="ch-hl-h has-aside" data-canopy-head=\{coach \? '' : 'tight'\}/);
    expect(src('screens/coachhelm/views/Skeletons.tsx')).toMatch(/className="ch-hl-h has-aside" data-canopy-head="tight"/);
  });

  it('a page with the tight head drops the sheet, opens where a page with no eyebrow does, and its loading head is not held to the full head’s height', () => {
    const css = src('styles/coachhelm.css');
    const tight = String.raw`\.ch-hl\[data-canopy\]:has\(> \[data-canopy-head='tight'\]\)`;
    expect(css).toMatch(new RegExp(String.raw`\n  ${tight} \{\s*padding-top: var\(--ch-page-top-no-eyebrow\);\s*\}`));
    expect(css).toMatch(new RegExp(String.raw`html:not\(\[data-fw-theme='dark'\]\) ${tight} \{\s*margin-top: 0;\s*margin-bottom: 0;\s*border-radius: 0;\s*background: none;\s*box-shadow: none;\s*\}`));
    expect(css).toMatch(/\.ch-hl\[aria-busy='true'\]\[data-canopy\] > \.ch-hl-h\[data-canopy-head='tight'\] \{\s*min-height: 0;\s*\}/);
  });
});
