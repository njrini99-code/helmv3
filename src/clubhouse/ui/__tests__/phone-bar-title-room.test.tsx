// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneBar, PhoneBarParts } from '../PhoneBar';

/**
 * The centred title ends before what stands at the bar's right (design review, 10 Nov 2026: on a 390pt phone "Player
 * stats" ran under the CoachHelm key, and a wide action was no better). The title is centred in the bar, so its room is
 * twice the way from the bar's centre to the nearest thing at the right, less an 8pt gap; the stylesheet caps it at 52%.
 */

const BAR = 390;
const CENTRE = BAR / 2;

/** jsdom lays nothing out: the boxes a 390pt phone would give the bar, the page's action slot and the shell's key. */
let boxes: { right: { left: number; width: number }; shared?: { left: number; width: number } };
const rect = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: 44, width, height: 44, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

let observers: Array<() => void> = [];
class RO {
  constructor(cb: () => void) {
    observers.push(cb);
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', RO);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('ch-pbar') || this.classList.contains('ch-topbar')) return rect(0, BAR);
    if (this.classList.contains('ch-pbar__right')) return rect(boxes.right.left, boxes.right.width);
    if (this.classList.contains('ch-topbar__actions') && boxes.shared) return rect(boxes.shared.left, boxes.shared.width);
    return rect(0, 0);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const room = (container: HTMLElement) => container.querySelector<HTMLElement>('.ch-pbar__title')!.style.getPropertyValue('--ch-pbar-title-max');
const back = { label: 'Team', onBack: () => {} };

describe('the centred title’s room', () => {
  it('a pushed screen with one 44pt action: up to the action, less the gap', () => {
    boxes = { right: { left: 338, width: 44 } };
    const { container } = render(<PhoneBar back={back} title="Player stats" action={<button type="button">Share</button>} />);
    expect(room(container)).toBe(`${2 * (338 - 8 - CENTRE)}px`);
  });

  it('the shell’s bar: the CoachHelm key stands before the action, and the title ends before the key', () => {
    boxes = { right: { left: 338, width: 44 }, shared: { left: 290, width: 44 } };
    const { container } = render(
      <header className="ch-topbar">
        <div className="ch-topbar__pslot">
          <PhoneBarParts back={back} title="Player stats" heading={false} action={<button type="button">Share</button>} />
        </div>
        <div className="ch-topbar__actions" />
      </header>,
    );
    expect(room(container)).toBe(`${2 * (290 - 8 - CENTRE)}px`);
  });

  it('the shell’s bar for a player (no key, the shared actions hidden): the page’s action alone decides', () => {
    boxes = { right: { left: 338, width: 44 }, shared: { left: 0, width: 0 } };
    const { container } = render(
      <header className="ch-topbar">
        <div className="ch-topbar__pslot">
          <PhoneBarParts back={back} title="My stats" heading={false} action={<button type="button">Share</button>} />
        </div>
        <div className="ch-topbar__actions" />
      </header>,
    );
    expect(room(container)).toBe(`${2 * (338 - 8 - CENTRE)}px`);
  });

  it('nothing at the right: no room is set, and the stylesheet’s 52% stands', () => {
    boxes = { right: { left: 382, width: 0 } };
    const { container } = render(<PhoneBar back={back} title="Round" />);
    expect(room(container)).toBe('');
  });

  it('an action grows (a text action at a larger Text Size): the room follows it', () => {
    boxes = { right: { left: 322, width: 60 } };
    const { container } = render(<PhoneBar back={{ label: 'Cancel', chevron: false, onBack: () => {} }} title="New qualifier" action={<button type="button">Create</button>} />);
    expect(room(container)).toBe(`${2 * (322 - 8 - CENTRE)}px`);
    boxes = { right: { left: 298, width: 84 } };
    act(() => observers.forEach((seen) => seen()));
    expect(room(container)).toBe(`${2 * (298 - 8 - CENTRE)}px`);
  });

  it('never negative: an action that reaches the centre leaves the title no room rather than a broken value', () => {
    boxes = { right: { left: 180, width: 202 } };
    const { container } = render(<PhoneBar back={back} title="Live" action={<span>Live · updated 4:12 PM</span>} />);
    expect(room(container)).toBe('0px');
  });

  it('a title at the left (a tab root’s, a conversation’s) is in the row and takes no measured room', () => {
    boxes = { right: { left: 338, width: 44 } };
    const start = render(<PhoneBar start title="Calendar" action={<button type="button">New event</button>} />);
    expect(room(start.container)).toBe('');
    const lead = render(<PhoneBar lead back={{ onBack: () => {} }} title={<b>Jonah Okafor</b>} action={<button type="button">Details</button>} />);
    expect(lead.container.querySelector('.ch-pbar__title')).toBeNull();
    expect(lead.container.querySelector<HTMLElement>('.ch-pbar__lead')!.style.getPropertyValue('--ch-pbar-title-max')).toBe('');
  });

  it('survives a re-render and is taken back off when the bar goes', () => {
    boxes = { right: { left: 338, width: 44 } };
    const view = render(<PhoneBar back={back} title="Player stats" action={<button type="button">Share</button>} />);
    view.rerender(<PhoneBar back={back} title="Player stats" action={<button type="button">Share</button>} />);
    expect(room(view.container)).toBe(`${2 * (338 - 8 - CENTRE)}px`);
    const title = view.container.querySelector<HTMLElement>('.ch-pbar__title')!;
    view.unmount();
    expect(title.style.getPropertyValue('--ch-pbar-title-max')).toBe('');
  });
});
