import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * dsx-08, the shared pressed look: a control whose sheet draws no pressed look of its own takes the linen wash (or leans
 * toward its ink on a plate the wash does not suit). These pin where it must stay off and how it lets go:
 *
 * - A sheet that keys the look to the mark through `:has()` paints somewhere the controller's own watch does not see
 *   (the Activity island's step lights the row beside its open button; the Home day card deepens its own layer under the
 *   title's link). The shared look used to paint over both, hiding the step's words under a fill. It stays off.
 * - A bare hit area laid over the content it opens takes no fill either: the fill would cover that content.
 * - Letting go fades to the colour the control rests at when it is let go (a day toggle that turned on), never to the one
 *   it had when pressed.
 */

import { markedCompounds, splitSelectorList, withoutPseudoElements } from '../press-rules';
import { PRESS_WASH_OUT, useChPress } from '../press';

const IVORY = 'rgb(250, 247, 239)';
const LINEN = 'rgb(235, 228, 210)';
const GREEN = 'rgb(31, 74, 52)';

// The sheets as the pages write them (coachhelm-ask-v2.css, home.css), and two rules that name the mark without drawing a
// look for it: one that lets go of one (`:not()`), one that only times a transition.
const SHEET = `
.isl .st:has(.op[data-ch-pressed]) .row { background: rgb(40, 80, 60); }
.day:has(.day__open[data-ch-pressed])::after { opacity: 0.38; }
.plain:not([data-ch-pressed]):hover { background: red; }
.timed[data-ch-pressed] { transition-duration: 110ms; }
`;

function Harness() {
  useChPress(true);
  return (
    <div data-ui="clubhouse">
      <ol className="isl">
        <li className="st">
          <span className="row">
            <span className="lb">Reading the roster</span>
          </span>
          <button type="button" className="op" aria-label="Open what it found" />
        </li>
      </ol>
      <section className="day">
        <h2>
          <a href="#event" className="day__open">
            Team practice
          </a>
        </h2>
      </section>
      <button type="button" className="plain">
        Plain
      </button>
      <button type="button" className="timed">
        Timed
      </button>
      <div className="card">
        <span>Week 12</span>
        <button type="button" className="hit" aria-label="Open the week" />
      </div>
      <button type="button" className="toggle" aria-pressed="false">
        Mon
      </button>
    </div>
  );
}

function pointer(type: string) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, isPrimary: { value: true } });
  return e;
}

type Call = { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions };
let calls: Call[] = [];
/** What a `fill: forwards` animation holds each element's background at, as a browser would until it is cancelled. */
const holding = new Map<Element, string>();
/** Each element's background as its sheet draws it at rest. */
const rest = new Map<Element, string>();
const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations };
let style: HTMLStyleElement;

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  holding.clear();
  rest.clear();
  style = document.createElement('style');
  style.textContent = SHEET;
  document.head.appendChild(style);
  Element.prototype.animate = function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    calls.push({ el: this, frames, opts });
    const last = frames[frames.length - 1]?.backgroundColor;
    if (opts?.fill === 'forwards' && typeof last === 'string') holding.set(this, last);
    return { id: '', cancel: () => holding.delete(this) } as unknown as Animation;
  } as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = (() => []) as unknown as typeof Element.prototype.getAnimations;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el: Element) =>
      ({
        backgroundColor: holding.get(el) ?? rest.get(el) ?? IVORY,
        color: 'rgb(26, 32, 28)',
        opacity: '1',
        scale: '1',
        position: el.classList.contains('hit') ? 'absolute' : 'static',
        getPropertyValue: (p: string) => (p === '--ch-sel' ? '#ebe4d2' : ''),
      }) as unknown as CSSStyleDeclaration,
  );
});
afterEach(() => {
  cleanup();
  style.remove();
  vi.restoreAllMocks();
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
  vi.useRealTimers();
});

/** The shared look's own animations: the fill it holds while pressed. */
const shared = (el: Element) => calls.filter((c) => c.el === el && c.opts?.fill === 'forwards');
const press = (el: Element) => act(() => void el.dispatchEvent(pointer('pointerdown')));
const lift = (el: Element) => act(() => void el.dispatchEvent(pointer('pointerup')));

describe('the shared pressed look stays off what a sheet already draws (dsx-08)', () => {
  it('the Activity island: a step whose :has() rule lights its row keeps the row, and its words, uncovered', () => {
    const { container } = render(<Harness />);
    const open = container.querySelector('.op')!;
    press(open);
    expect(open.hasAttribute('data-ch-pressed')).toBe(true);
    expect(shared(open)).toHaveLength(0);
  });

  it('the Home day card: a press on the title deepens the card, not a fill behind the title', () => {
    render(<Harness />);
    const link = screen.getByText('Team practice');
    press(link);
    expect(link.hasAttribute('data-ch-pressed')).toBe(true);
    expect(shared(link)).toHaveLength(0);
  });

  it('a control no rule draws takes the linen wash, read from the token as written (a hex)', () => {
    render(<Harness />);
    const plain = screen.getByText('Plain');
    press(plain);
    expect(shared(plain)).toHaveLength(1);
    expect(shared(plain)[0]!.frames).toEqual([{ backgroundColor: IVORY }, { backgroundColor: LINEN }]);
  });

  it('a rule that only names the mark (letting go of it, or timing a transition) does not count as a look', () => {
    render(<Harness />);
    const timed = screen.getByText('Timed');
    press(timed);
    expect(shared(timed)).toHaveLength(1);
  });

  it('a bare hit area laid over its content takes no fill, which would cover that content', () => {
    const { container } = render(<Harness />);
    const hit = container.querySelector('.hit')!;
    press(hit);
    expect(hit.hasAttribute('data-ch-pressed')).toBe(true);
    expect(shared(hit)).toHaveLength(0);
  });
});

describe('letting go of the shared look', () => {
  it('fades to the colour the control rests at now, not the one it had when pressed', () => {
    render(<Harness />);
    const toggle = screen.getByText('Mon');
    press(toggle);
    act(() => vi.advanceTimersByTime(300));
    lift(toggle);
    const back = calls.filter((c) => c.el === toggle).at(-1)!;
    expect(back.opts).toEqual(PRESS_WASH_OUT);
    // From the wash, with the end open: the live value under the fade, so the toggle turning on as the click lands (after
    // the pointer lifts) fades to green. It used to close on the ivory read at the press, then snap.
    expect(back.frames).toEqual([{ backgroundColor: LINEN, offset: 0 }]);
    expect(calls.filter((c) => c.el === toggle)).toHaveLength(2);
  });

  it('reads the rest as it is when the look lets go', () => {
    render(<Harness />);
    const toggle = screen.getByText('Mon');
    press(toggle);
    act(() => vi.advanceTimersByTime(300));
    // The control's resting colour changed while it was held (its state flipped under the finger).
    rest.set(toggle, GREEN);
    lift(toggle);
    const back = calls.filter((c) => c.el === toggle).at(-1)!;
    expect(back.frames).toEqual([{ backgroundColor: LINEN, offset: 0 }]);
    expect(back.frames.some((f) => f.backgroundColor === IVORY)).toBe(false);
  });

  it('a quick tap reads the rest as it is when the look lets go: a toggle already on fades to its new colour', () => {
    render(<Harness />);
    const toggle = screen.getByText('Mon');
    press(toggle);
    lift(toggle);
    // The click lands while the press shows out its beat, and the toggle turns on.
    rest.set(toggle, LINEN);
    act(() => vi.advanceTimersByTime(300));
    expect(toggle.hasAttribute('data-ch-pressed')).toBe(false);
    // Already at the colour it rests at: nothing runs back to the old one.
    expect(calls.filter((c) => c.el === toggle)).toHaveLength(1);
  });
});

describe('reading the sheets', () => {
  it('splits a selector list only at its own commas', () => {
    expect(splitSelectorList(".a:is(.b, .c)[data-ch-pressed], .d[aria-label='x, y'] .e")).toEqual(['.a:is(.b, .c)[data-ch-pressed]', ".d[aria-label='x, y'] .e"]);
  });

  it('finds the compound that carries the mark, inside :has() or out, and skips one inside :not()', () => {
    expect(markedCompounds('.ch-isl .st:has(.op[data-ch-pressed]) .row')).toEqual(['.op[data-ch-pressed]']);
    expect(markedCompounds('.ch-hm-day:has(.ch-hm-day__open[data-ch-pressed])::after')).toEqual(['.ch-hm-day__open[data-ch-pressed]']);
    expect(markedCompounds(':is(.a, .b:not([aria-disabled="true"]))[data-ch-pressed]:not(:disabled) > .c')).toEqual([':is(.a, .b:not([aria-disabled="true"]))[data-ch-pressed]:not(:disabled)']);
    expect(markedCompounds('.feat.tap[data-ch-pressed]:not(:has(button[data-ch-pressed]))')).toEqual(['.feat.tap[data-ch-pressed]:not(:has(button[data-ch-pressed]))']);
    expect(markedCompounds('.x:not([data-ch-pressed]):hover')).toEqual([]);
  });

  it('drops pseudo-elements so the selector can be queried', () => {
    expect(withoutPseudoElements('.a:has(.b[data-ch-pressed])::after')).toBe('.a:has(.b[data-ch-pressed])');
    expect(withoutPseudoElements('.a:before, .b::-webkit-scrollbar')).toBe('.a, .b');
  });
});
