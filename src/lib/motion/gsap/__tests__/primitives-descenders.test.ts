// @vitest-environment jsdom

/**
 * maskedLines / maskedWords leave room for descenders, without moving the text.
 *
 * Regression: the landing hero's "your program." lost the tails of its g, p and
 * y on phone and desktop. Each SplitText mask was exactly one line box tall with
 * `overflow: clip`, and display type is set tighter than the font's own ascent +
 * descent, so the mask cut every descender flat, and because the split is only
 * reverted on unmount it stayed cut for good.
 *
 * jsdom has no layout, so this pins the two halves of the fix structurally:
 * every piece carries bottom room, and its mask hands exactly that room back as
 * a negative margin, so the flow of the page is unchanged.
 */

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ScrollTrigger } from '@/lib/motion/gsap/register';
import { maskedLines, maskedWords } from '@/lib/motion/gsap/primitives';

function heading(text: string): HTMLElement {
  const h = document.createElement('h1');
  h.textContent = text;
  document.body.appendChild(h);
  return h;
}

/** The SplitText mask is the piece's parent, with `overflow: clip`. */
function maskOf(piece: HTMLElement): HTMLElement {
  const mask = piece.parentElement as HTMLElement;
  expect(mask.style.overflow).toBe('clip');
  return mask;
}

function expectRoomGivenBack(piece: HTMLElement) {
  const room = piece.style.paddingBottom;
  // Some real room, in the text's own em so it scales with the type.
  expect(room).toMatch(/^0\.\d+em$/);
  expect(parseFloat(room)).toBeGreaterThanOrEqual(0.2);
  // ...and exactly that much handed back below the mask, so nothing moves.
  expect(maskOf(piece).style.marginBottom).toBe(`-${room}`);
}

describe('masked reveals keep their descenders', () => {
  afterEach(() => document.body.replaceChildren());
  // See coachHelmDeepScene.test.ts: stop ScrollTrigger's timers before jsdom
  // tears down `requestAnimationFrame`.
  afterAll(() => ScrollTrigger.disable());

  it('maskedLines: every line has room below it, given back by its mask', () => {
    const h = heading('Command every angle of your program.');
    const { lines, revert } = maskedLines(h);

    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(expectRoomGivenBack);

    revert();
    // Revert restores the original markup: no masks, no padding left behind.
    expect(h.innerHTML).toBe('Command every angle of your program.');
  });

  it('maskedWords: every word has room below it, given back by its mask', () => {
    const h = heading('3.2 three-putts per round, up from 1.4 in the fall.');
    const { lines: words, revert } = maskedWords(h);

    expect(words.length).toBeGreaterThan(1);
    words.forEach(expectRoomGivenBack);

    revert();
  });
});
