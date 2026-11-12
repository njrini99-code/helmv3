// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_REVIEW_COACH } from '../../../preview/fixtures-round-review';
import { ShotTrail } from '../RoundZones';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BASE = 104;
const hole = PREVIEW_REVIEW_COACH.holes.find((h) => h.shots.length > 2 && (h.putts ?? 0) > 0)!;
/** The words under the line: the tee's, a shot's "out" and the putts'. Not the figures inside the dots. */
const words = (c: HTMLElement) => [...c.querySelectorAll('svg text:not(.ch-rzsvg__in)')];

/** The stylesheet's size for the trail's words, as `useLabelSize` reads it off the tee's label. */
const drawnAt = (px: number) => {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
    el instanceof SVGElement && el.tagName.toLowerCase() === 'text' ? ({ fontSize: `${px}px` } as unknown as CSSStyleDeclaration) : real(el, pseudo),
  );
};

/**
 * Phone premium sweep (12 Nov 2026): on a phone the trail's words are set at 34 units (rounds.css, chrz ≤ 360px) and sat
 * 30 under the line, so the dotted line ran through "Tee · 518 yds" and "3 putts · from 19 ft". Their baseline now drops
 * as they grow, so their capitals (about 0.72em) clear the shot dots (r 9) by 3; small words stay where they were.
 */
describe('the shot trail’s words sit under the line, never on it', () => {
  it('at the desk’s size they keep their place, 30 under the line', () => {
    drawnAt(11.5);
    const { container } = render(<ShotTrail hole={hole} />);
    expect(words(container).length).toBeGreaterThan(1);
    for (const t of words(container)) expect(Number(t.getAttribute('y'))).toBe(BASE + 30);
  });

  it('at the phone’s 34 units their capitals clear the dots', () => {
    drawnAt(34);
    const { container } = render(<ShotTrail hole={hole} />);
    const ys = words(container).map((t) => Number(t.getAttribute('y')));
    expect(ys.length).toBeGreaterThan(1);
    for (const y of ys) {
      expect(y - 0.72 * 34).toBeGreaterThanOrEqual(BASE + 9 + 3);
      // Inside the drawing's 150 units, descenders included.
      expect(y + 0.22 * 34).toBeLessThanOrEqual(150);
    }
  });
});
