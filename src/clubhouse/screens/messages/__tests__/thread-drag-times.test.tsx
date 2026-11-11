import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useThreadDragTimes } from '../use-thread-drag-times';

function Thread() {
  const ref = useRef<HTMLDivElement>(null);
  useThreadDragTimes(ref, true, false, 1);
  return (
    <div ref={ref}>
      <div className="ch-ms-msgs" />
    </div>
  );
}

const touch = (el: EventTarget, type: string, x: number, y = 300) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { pointerType: 'touch', clientX: x, clientY: y });
  el.dispatchEvent(e);
};

type Settle = { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null };

function mount() {
  const { container } = render(<Thread />);
  const list = container.querySelector<HTMLElement>('.ch-ms-msgs')!;
  const settles: Settle[] = [];
  const animate = vi.fn<(frames: Keyframe[], timing?: KeyframeAnimationOptions) => Animation>(() => {
    const a: Settle = { cancel: vi.fn(), onfinish: null };
    settles.push(a);
    return a as unknown as Animation;
  });
  list.animate = animate as unknown as HTMLElement['animate'];
  list.getAnimations = () => settles as unknown as Animation[];
  return { list, settles, animate };
}

/** The frame on screen part-way through the settle: the list drawn 14px to the left. */
const midSettle = () => vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transform: 'matrix(1, 0, 0, 1, -14, 0)' } as CSSStyleDeclaration);

describe('drag for times (MOT-THR-3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the finger at 60% up to its stop, then settles back from where it was let go', () => {
    const { list, animate } = mount();
    touch(list, 'pointerdown', 330);
    touch(window, 'pointermove', 230);
    expect(list.style.transform).toBe('translateX(-58px)');
    expect(list.hasAttribute('data-ch-times')).toBe(true);
    touch(window, 'pointerup', 230);
    expect(list.style.transform).toBe('');
    expect(animate.mock.calls[0]).toEqual([[{ transform: 'translateX(-58px)' }, { transform: 'none' }], expect.objectContaining({ duration: expect.any(Number) })]);
  });

  it('grabbed on its way back, it carries on from where it is, and the times stay up until it has landed', () => {
    const { list, settles, animate } = mount();
    touch(list, 'pointerdown', 330);
    touch(window, 'pointermove', 230);
    touch(window, 'pointerup', 230);
    const computed = midSettle();
    touch(list, 'pointerdown', 330);
    computed.mockRestore();
    expect(settles[0]!.cancel).toHaveBeenCalled();
    // No jump to rest under the finger: the list holds the frame it was on.
    expect(list.style.transform).toBe('translateX(-14px)');
    expect(list.hasAttribute('data-ch-times')).toBe(true);
    // A tap, not a second drag: it finishes the trip from there.
    touch(window, 'pointerup', 330);
    expect(animate.mock.calls[1]![0]).toEqual([{ transform: 'translateX(-14px)' }, { transform: 'none' }]);
    expect(list.hasAttribute('data-ch-times')).toBe(true);
    settles[1]!.onfinish?.();
    expect(list.hasAttribute('data-ch-times')).toBe(false);
  });

  it('caught on its way back by a scroll, it still returns to rest and hides the times', () => {
    const { list, settles, animate } = mount();
    touch(list, 'pointerdown', 330);
    touch(window, 'pointermove', 230);
    touch(window, 'pointerup', 230);
    const computed = midSettle();
    touch(list, 'pointerdown', 330);
    computed.mockRestore();
    touch(window, 'pointermove', 330, 360);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(list.style.transform).toBe('');
    settles[1]!.onfinish?.();
    expect(list.hasAttribute('data-ch-times')).toBe(false);
  });
});
