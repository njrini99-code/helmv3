/**
 * v2 motion (D-64): the press (CH-1606) and the retired tokens. The reveal
 * and skeleton timing are CSS and are checked in the preview.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { pressScale, useChPress } from '../lib/press';
import { CH_DUR } from '../lib/motion';

function Harness({ enabled }: { enabled: boolean }) {
  useChPress(enabled);
  return (
    <div data-ui="clubhouse">
      <button type="button">Save</button>
      <button type="button" disabled>
        Off
      </button>
      <div data-ch-nopress>
        <button type="button">Grab</button>
      </div>
    </div>
  );
}

describe('CH-1606 press', () => {
  const animate = vi.fn((..._args: unknown[]) => ({ cancel: vi.fn() }) as unknown as Animation);
  const original = Element.prototype.animate;
  beforeEach(() => {
    animate.mockClear();
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  });
  afterEach(() => {
    cleanup();
    Element.prototype.animate = original;
  });

  it('shrinks about 6px whatever the width, never below 0.96', () => {
    expect(pressScale(300)).toBeCloseTo(0.98);
    expect(pressScale(100)).toBeCloseTo(0.96);
    expect(pressScale(40)).toBe(0.96);
  });

  it('presses on pointer down over press and springs back over release, on the scale property', () => {
    const { getByText } = render(<Harness enabled />);
    fireEvent.pointerDown(getByText('Save'), { button: 0 });
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, opts] = animate.mock.calls[0] as unknown as [Array<Record<string, string>>, KeyframeAnimationOptions];
    expect(Object.keys(frames[1] ?? {})).toEqual(['scale']);
    expect(opts.duration).toBe(CH_DUR.press * 1000);
    fireEvent.pointerUp(getByText('Save'));
    expect(animate).toHaveBeenCalledTimes(2);
    expect((animate.mock.calls[1] as unknown as [unknown, KeyframeAnimationOptions])[1].duration).toBe(CH_DUR.release * 1000);
  });

  it('skips disabled controls, [data-ch-nopress], and reduced motion or Animations off', () => {
    const { getByText, unmount } = render(<Harness enabled />);
    fireEvent.pointerDown(getByText('Off'), { button: 0 });
    fireEvent.pointerDown(getByText('Grab'), { button: 0 });
    expect(animate).not.toHaveBeenCalled();
    unmount();
    const off = render(<Harness enabled={false} />);
    fireEvent.pointerDown(off.getByText('Save'), { button: 0 });
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('v2 durations', () => {
  it('are press 110, quick 180, base 260, release 280 and reveal 520ms', () => {
    expect(CH_DUR).toEqual({ press: 0.11, quick: 0.18, base: 0.26, release: 0.28, reveal: 0.52 });
  });
});
