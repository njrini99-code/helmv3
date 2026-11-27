import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteTappedFace, useFaceFlight } from '../thread-v2';

/** Boxes by selector, as the browser would measure them. */
const boxes: Record<string, { left: number; top: number; width: number; height: number }> = {
  '.ch-avatar': { left: 16, top: 200, width: 40, height: 40 },
  '.ch-msp-who > span': { left: 60, top: 50, width: 32, height: 32 },
};
/** The push screen's resolved transform, as getComputedStyle gives it in a browser. */
let screenTransform = 'none';
/** How far the screen sits from where it rests (added to the bar face's measured box). */
let shiftX = 0;

const original = { rect: HTMLElement.prototype.getBoundingClientRect, animate: HTMLElement.prototype.animate };
const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }));

beforeEach(() => {
  animate.mockClear();
  screenTransform = 'none';
  shiftX = 0;
  HTMLElement.prototype.animate = animate as never;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const key = Object.keys(boxes).find((k) => this.matches(k));
    const b = key ? boxes[key]! : { left: 0, top: 0, width: 0, height: 0 };
    const left = b.left + (this.closest('.ch-pscreen') ? shiftX : 0);
    return { ...b, left, x: left, y: b.top, right: left + b.width, bottom: b.top + b.height, toJSON() {} } as DOMRect;
  };
  vi.stubGlobal(
    'getComputedStyle',
    (el: Element) => ({ transform: el.classList.contains('ch-pscreen') ? screenTransform : 'none' }) as CSSStyleDeclaration,
  );
  // Enough of DOMMatrixReadOnly to read a resolved 2D matrix.
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41: number;
      m42: number;
      constructor(t: string) {
        const n = /^matrix\(([^)]+)\)$/.exec(t)?.[1]?.split(',').map(Number);
        if (!n || n.length !== 6) throw new SyntaxError(t);
        this.m41 = n[4]!;
        this.m42 = n[5]!;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  document.querySelectorAll('.ch-ms-row').forEach((row) => row.remove());
  vi.unstubAllGlobals();
  HTMLElement.prototype.getBoundingClientRect = original.rect;
  if (original.animate) HTMLElement.prototype.animate = original.animate;
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).animate;
});

function tapInboxRow() {
  const row = document.createElement('div');
  row.className = 'ch-ms-row';
  const face = document.createElement('span');
  face.className = 'ch-avatar';
  row.appendChild(face);
  document.body.appendChild(row);
  noteTappedFace(face);
}

function Thread() {
  useFaceFlight(true, false);
  return null;
}

function PushedThread() {
  return (
    <section className="ch-pscreen">
      <div className="ch-msp-who">
        <span />
      </div>
      <Thread />
    </section>
  );
}

const flightEnd = () => (animate.mock.calls[0] as unknown as [Keyframe[]])[0][1]!.transform;

describe('the tapped face flying into the phone thread bar (M-MSG-01b)', () => {
  it('lands where the bar face rests, though the thread first draws with its screen still a width to the right', () => {
    screenTransform = 'matrix(1, 0, 0, 1, 390, 0)';
    shiftX = 390;
    tapInboxRow();
    render(<PushedThread />);
    expect(animate).toHaveBeenCalledTimes(1);
    // From the row face (16, 200, 40 wide) to the bar face at rest (60, 50, 32 wide), not to 450 off the screen's edge.
    expect(flightEnd()).toBe('translate(44px, -150px) scale(0.8)');
  });

  it('flies to the bar face as measured when its screen is already at rest', () => {
    tapInboxRow();
    render(<PushedThread />);
    expect(flightEnd()).toBe('translate(44px, -150px) scale(0.8)');
  });

  it('falls back to the measured box when the screen’s transform cannot be read as a matrix', () => {
    screenTransform = 'translateX(100%)';
    tapInboxRow();
    render(<PushedThread />);
    expect(flightEnd()).toBe('translate(44px, -150px) scale(0.8)');
  });
});
