// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneBar } from '../PhoneBar';

/**
 * The back link names the page it returns to ("‹ Practice", "‹ CoachHelm", "‹ My stats"), as UINavigationBar does, for as
 * long as the name clears the centred title; then "Back"; then the chevron alone (MOB-SHELL-3). Design review, 10 Nov
 * 2026: the bar measured against a title box fixed at 24% of the bar, so on a 390pt phone only a five-letter parent
 * ever showed and every other page said "Back", whatever its title's width.
 */

const BAR = 390;
/** The label starts after the 16pt edge and the chevron. */
const LABEL_LEFT = 30;

/** jsdom lays nothing out: give the bar, the label and the title the boxes a 390pt phone would. */
function layout(titleWidth: number) {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('ch-pbar') ? BAR : 0;
  });
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('ch-pbar__title') ? titleWidth : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const left = this.classList.contains('ch-pbar') ? 0 : LABEL_LEFT;
    return { left, right: left, top: 0, bottom: 0, width: 0, height: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

class RO {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', RO);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const drawn = (parent: string, title: string) => {
  const { container } = render(<PhoneBar back={{ label: parent, onBack: () => {} }} title={title} />);
  const back = container.querySelector('.ch-pbar__back')!;
  return { text: back.querySelector('span[aria-hidden="true"]:last-child')?.textContent, name: back.getAttribute('aria-label') };
};

describe('the back link names its parent', () => {
  it.each([
    ['Practice', 'Thursday practice', 150],
    ['CoachHelm', 'Eli Brandt', 86],
    ['My stats', 'Scoring', 62],
    ['Roster', 'Jonah Okafor', 104],
  ])('"%s" shows beside the title "%s"', (parent, title, width) => {
    layout(width);
    expect(drawn(parent, title).text).toBe(parent);
  });

  it('falls to "Back" when the title leaves no room for the name, and keeps its accessible name', () => {
    // A title at its full 52% of the bar starts at 24%: 94pt from the edge, 56pt after the label's start and the gap.
    layout(400);
    expect(drawn('CoachHelm', 'Approach from 125 to 150 yards')).toEqual({ text: 'Back', name: 'Back to CoachHelm' });
  });

  it('falls to the chevron alone when not even "Back" fits', () => {
    layout(400);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('ch-pbar') ? 280 : 0;
    });
    expect(drawn('CoachHelm', 'Approach from 125 to 150 yards').text).toBe('');
  });
});
