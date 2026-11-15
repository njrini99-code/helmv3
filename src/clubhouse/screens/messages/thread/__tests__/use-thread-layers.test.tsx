import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KB_RIDE_ID } from '../thread-layers';
import { LAYER_VARS, useThreadLayers } from '../use-thread-layers';

const native = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => native.on }));

/** A phone thread as the hook finds it: bar, scroller, composer wrapper with its footer, under the redesign's root. */
function Harness({ kind = 'phone', reduced = false, v2 = true }: { kind?: 'phone' | 'desk'; reduced?: boolean; v2?: boolean }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  useThreadLayers(scroller, { kind, convId: 'c1', reduced });
  const phone = kind === 'phone';
  return (
    <div {...(v2 ? { 'data-ch-ms-v2': '' } : {})}>
      <section data-testid="root" className={phone ? 'ch-msp-thread' : 'ch-ms-thread'}>
        {phone ? <header className="ch-pbar" data-testid="bar" /> : <header className="ch-ms-th" data-testid="bar" />}
        <div className="ch-ms-scroll" ref={scroller} data-testid="scroller">
          <div className="ch-ms-msgs" data-testid="list" />
        </div>
        {phone ? (
          <div className="ch-msp-composer" data-testid="comp">
            <footer className="ch-ms-comp">
              <textarea data-testid="field" />
            </footer>
          </div>
        ) : (
          <footer className="ch-ms-comp" data-testid="comp">
            <textarea data-testid="field" />
          </footer>
        )}
      </section>
    </div>
  );
}

function box(el: HTMLElement, metrics: { scrollHeight?: number; clientHeight?: number; height?: number }) {
  if (metrics.scrollHeight !== undefined) Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => metrics.scrollHeight! });
  if (metrics.clientHeight !== undefined) Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => metrics.clientHeight! });
  if (metrics.height !== undefined) el.getBoundingClientRect = () => ({ height: metrics.height!, width: 390, top: 0, left: 0, right: 390, bottom: metrics.height!, x: 0, y: 0, toJSON: () => ({}) });
}

/** A mocked visual viewport the hook can listen to. */
function mockViewport(height: number) {
  const target = new EventTarget();
  const vv = Object.assign(target, { height, scale: 1, offsetTop: 0 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  return vv;
}

const realViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
beforeEach(() => {
  native.on = false;
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 844 });
});
afterEach(() => {
  cleanup();
  if (realViewport) Object.defineProperty(window, 'visualViewport', realViewport);
  else delete (window as unknown as Record<string, unknown>).visualViewport;
  document.documentElement.style.removeProperty('--keyboard-height');
  vi.restoreAllMocks();
});

describe('useThreadLayers: layer padding and bar state', () => {
  it('hands the list the measured bar and composer plus their clearance, and clears them on unmount', () => {
    const view = render(<Harness />);
    const root = view.getByTestId('root');
    // jsdom measures nothing: the artifact\'s numbers stand in.
    expect(root.style.getPropertyValue(LAYER_VARS.top)).toBe('132px');
    expect(root.style.getPropertyValue(LAYER_VARS.bottom)).toBe('104px');
    view.unmount();
    expect(root.style.getPropertyValue(LAYER_VARS.top)).toBe('');
  });
  it('flags the bar flat at the top and drops the flag once content has scrolled under it', () => {
    const view = render(<Harness kind="desk" />);
    const bar = view.getByTestId('bar');
    const scroller = view.getByTestId('scroller');
    expect(bar.classList.contains('is-flat')).toBe(true);
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);
    expect(bar.classList.contains('is-flat')).toBe(false);
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    expect(bar.classList.contains('is-flat')).toBe(true);
  });
  it('does nothing off the redesign', () => {
    const view = render(<Harness v2={false} />);
    expect(view.getByTestId('root').style.getPropertyValue(LAYER_VARS.top)).toBe('');
    expect(view.getByTestId('bar').classList.contains('is-flat')).toBe(false);
  });
  it('has no keyboard ride on the desktop', () => {
    const vv = mockViewport(844);
    const view = render(<Harness kind="desk" />);
    vv.height = 520;
    act(() => void vv.dispatchEvent(new Event('resize')));
    expect(view.getByTestId('root').style.getPropertyValue(LAYER_VARS.lift)).toBe('');
  });
});

describe('useThreadLayers: the keyboard ride (MSG-307, MOT-KB-1)', () => {
  function setup(reduced = false) {
    const vv = mockViewport(844);
    const view = render(<Harness reduced={reduced} />);
    const root = view.getByTestId('root');
    const scroller = view.getByTestId('scroller');
    const list = view.getByTestId('list');
    const animate = vi.fn(() => ({}) as Animation);
    list.animate = animate as never;
    // A thread pinned to its end: 1000 of scroll in a 600 box with 1600 of content.
    let max = 1000;
    box(scroller, { clientHeight: 600 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => max + 600 });
    scroller.scrollTop = 1000;
    return { vv, root, scroller, list, animate, grow: (by: number) => (max += by) };
  }
  const key = (vv: EventTarget & { height: number }, height: number) => {
    vv.height = height;
    act(() => void vv.dispatchEvent(new Event('resize')));
  };

  it('lifts by the keyboard when the visual viewport shrinks, and back to 0 when it returns', () => {
    const { vv, root } = setup();
    expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('');
    key(vv, 528);
    expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('316px');
    key(vv, 844);
    expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('0px');
  });
  it('a reader at the end stays on the last message: the floor rises, the thread follows, the list glides on the keyboard\'s beat', () => {
    const { vv, root, scroller, animate, grow } = setup();
    // The floor rising makes the scroller 316 taller below: that is what the pin follows.
    const set = root.style.setProperty.bind(root.style);
    root.style.setProperty = (name: string, value: string) => {
      const was = parseFloat(root.style.getPropertyValue(LAYER_VARS.lift)) || 0;
      set(name, value);
      if (name === LAYER_VARS.lift) grow(parseFloat(value) - was);
    };
    key(vv, 528);
    expect(scroller.scrollTop).toBe(1316);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ transform: 'translateY(316px)' }, { transform: 'translateY(0)' }]);
    expect(timing).toMatchObject({ duration: 480, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', composite: 'add' });
  });
  it('a reader further up keeps their place and the list does not glide', () => {
    const { vv, scroller, animate } = setup();
    scroller.scrollTop = 300;
    key(vv, 528);
    expect(scroller.scrollTop).toBe(300);
    expect(animate).not.toHaveBeenCalled();
  });
  it('under Reduce Motion the floor still rises but nothing glides', () => {
    const { vv, root, animate } = setup(true);
    key(vv, 528);
    expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('316px');
    expect(animate).not.toHaveBeenCalled();
  });
  it('names its glide so a send landing mid-ride can be told from it', () => {
    expect(KB_RIDE_ID).toBe('ch-ms-kb-ride');
  });
  it('in the app the keyboard comes from --keyboard-height, with no visual viewport change', () => {
    native.on = true;
    const view = render(<Harness />);
    const root = view.getByTestId('root');
    act(() => {
      document.documentElement.style.setProperty('--keyboard-height', '336px');
    });
    return vi.waitFor(() => expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('336px'));
  });
  it('a pinch-zoom is not a keyboard', () => {
    const { vv, root } = setup();
    (vv as unknown as { scale: number }).scale = 2;
    key(vv, 400);
    expect(root.style.getPropertyValue(LAYER_VARS.lift)).toBe('');
  });
});

describe('useThreadLayers: a tap on the page lowers the keyboard (MOT-SEND-3)', () => {
  it('blurs the field on a tap on the page, not on a bubble or a key', () => {
    const view = render(
      <>
        <Harness />
      </>,
    );
    const field = view.getByTestId('field') as HTMLTextAreaElement;
    const scroller = view.getByTestId('scroller');
    const bubble = document.createElement('div');
    bubble.setAttribute('data-ch-bubble', '');
    scroller.append(bubble);
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.click(bubble);
    expect(document.activeElement).toBe(field);
    fireEvent.click(view.getByTestId('list'));
    expect(document.activeElement).not.toBe(field);
  });
});
