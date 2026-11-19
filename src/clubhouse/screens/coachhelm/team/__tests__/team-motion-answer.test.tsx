// F-27 (audit 2026-11-19): the Team board's content-in moves only in answer to a person's choice. A station that changes with
// no one touching anything (restored as the page hydrates, a refresh) is drawn in place: under Reduce Motion that was a
// fade nobody asked for, and with motion on a rise on first paint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useContentIn } from '../team-motion';

const animate = vi.fn();
let orig: typeof HTMLElement.prototype.animate;
beforeEach(() => {
  orig = HTMLElement.prototype.animate;
  animate.mockClear();
  (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
});
afterEach(() => {
  HTMLElement.prototype.animate = orig;
  vi.useRealTimers();
});

function Card({ k }: { k: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useContentIn(ref, k, '.ch');
  return (
    <div ref={ref}>
      <div className="ch">{k}</div>
    </div>
  );
}

describe('useContentIn', () => {
  it('draws a change nobody asked for in place', () => {
    const { rerender } = render(<Card k="approach" />);
    rerender(<Card k="putting" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('rises in when the change answers a tap', () => {
    const { rerender } = render(<Card k="approach" />);
    fireEvent.pointerDown(window);
    rerender(<Card k="putting" />);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
