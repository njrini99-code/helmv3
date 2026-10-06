import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEAR_END_PX, useThreadAnchor } from '../screens/messages/use-thread-anchor';

/** High-fidelity audit §6.6, T25: a new message never pulls a reader away from older messages. */

let el: HTMLDivElement;
function Thread({ convId, count, lastMine = false, typing = false }: { convId: string; count: number; lastMine?: boolean; typing?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { unseen, toEnd } = useThreadAnchor(ref, { convId, count, lastMine, typing });
  return (
    <>
      <div
        ref={(n) => {
          ref.current = n;
          if (n) el = n;
        }}
      />
      {unseen > 0 && (
        <button type="button" onClick={toEnd}>
          {unseen} new
        </button>
      )}
    </>
  );
}

/** jsdom has no layout: give the thread a height and a position. */
function geometry(scrollHeight: number, top: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 400 });
  el.scrollTop = top;
  act(() => void el.dispatchEvent(new Event('scroll')));
}

describe('useThreadAnchor', () => {
  it('opens at the end, and follows new messages while the reader is there', () => {
    const view = render(<Thread convId="a" count={10} />);
    geometry(2000, 1600);
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 2100 });
    view.rerender(<Thread convId="a" count={11} />);
    expect(el.scrollTop).toBe(2100);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a reader scrolled up stays put; the arrivals are counted and the button takes them down', () => {
    const view = render(<Thread convId="a" count={10} />);
    geometry(2000, 300);
    view.rerender(<Thread convId="a" count={12} />);
    expect(el.scrollTop).toBe(300);
    expect(screen.getByRole('button').textContent).toBe('2 new');
    act(() => screen.getByRole('button').click());
    expect(el.scrollTop).toBe(2000);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('their own message takes them to the end even when scrolled up; typing dots never move a reader who is up', () => {
    const view = render(<Thread convId="a" count={10} />);
    geometry(2000, 300);
    view.rerender(<Thread convId="a" count={10} typing />);
    expect(el.scrollTop).toBe(300);
    view.rerender(<Thread convId="a" count={11} lastMine typing />);
    expect(el.scrollTop).toBe(2000);
  });

  it('another conversation opens at its end, with nothing counted', () => {
    const view = render(<Thread convId="a" count={10} />);
    geometry(2000, 300);
    view.rerender(<Thread convId="a" count={11} />);
    expect(screen.getByRole('button')).toBeTruthy();
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 900 });
    view.rerender(<Thread convId="b" count={4} />);
    expect(el.scrollTop).toBe(900);
    expect(screen.queryByRole('button')).toBeNull();
    expect(NEAR_END_PX).toBeGreaterThan(0);
  });
});


describe('useThreadAnchor · layout changes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const resizeHarness = () => {
    let resized!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback; }
      observe() {}
      disconnect = disconnect;
    });
    return { resize: () => act(() => resized()), disconnect };
  };

  it('composer/quote/keyboard shrink and expansion keep the newest end visible', () => {
    const { resize, disconnect } = resizeHarness();
    const view = render(<Thread convId="a" count={10} />);
    geometry(2000, 1600);
    resize(); // The browser delivers the initial observed viewport before later resizing.
    geometry(2000, 1600);
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 220 });
    // Safari can emit its resize-induced scroll event before the observer.
    act(() => void el.dispatchEvent(new Event('scroll')));
    resize();
    expect(el.scrollTop).toBe(2000);
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 500 });
    resize();
    expect(el.scrollTop).toBe(2000);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('older-message readers keep their position across viewport and loaded-content resizing', () => {
    const { resize } = resizeHarness();
    render(<Thread convId="a" count={10} />);
    geometry(2000, 300);
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 220 });
    resize();
    expect(el.scrollTop).toBe(300);
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 2300 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 500 });
    resize();
    expect(el.scrollTop).toBe(300);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
