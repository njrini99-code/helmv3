import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { useSheetDrag } from '../lib/sheet-drag';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireOverlayScroll, OverlayScrollLock } from '../lib/overlay-scroll';
import { Modal } from '../ui/Modal';
import './dialog-polyfill';

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('Overlay scroll lifetime', () => {
  it('keeps a nested sheet locked until the final release, preserving window and canvas positions/styles', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    document.body.style.setProperty('position', 'relative', 'important');
    const canvas = document.createElement('div');
    canvas.className = 'ch-canvas';
    canvas.style.overflow = 'auto';
    canvas.scrollTop = 240;
    document.body.append(canvas);
    const first = acquireOverlayScroll();
    const second = acquireOverlayScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(canvas.style.overflow).toBe('hidden');
    first(); first();
    expect(document.body.style.position).toBe('fixed');
    expect(scroll).not.toHaveBeenCalled();
    canvas.scrollTop = 0;
    second();
    expect(document.body.style.position).toBe('relative');
    expect(document.body.style.getPropertyPriority('position')).toBe('important');
    expect(canvas.style.overflow).toBe('auto');
    expect(canvas.scrollTop).toBe(240);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 0, behavior: 'instant' });
    canvas.remove(); document.body.style.removeProperty('position');
  });

  it('does not restore the old route position after navigation underneath a closing overlay', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const url = window.location.href;
    const release = acquireOverlayScroll();
    window.history.pushState({}, '', '/overlay-new-route');
    release();
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' });
    window.history.replaceState({}, '', url);
  });

  it('ignores another pointer and cancels the initiating drag without closing', () => {
    const close = vi.fn();
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const drag = useSheetDrag(ref, close);
      return <div ref={ref} data-testid="sheet"><header onPointerDown={drag.onPointerDown}>Handle</header></div>;
    }
    const view = render(<Harness />);
    const sheet = view.getByTestId('sheet');
    const pointer = (type: string, id: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: id });
      return event;
    };
    act(() => { sheet.querySelector('header')!.dispatchEvent(pointer('pointerdown', 1, 100)); });
    act(() => { sheet.querySelector('header')!.dispatchEvent(pointer('pointerdown', 2, 100)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 2, 250)); window.dispatchEvent(pointer('pointerup', 2, 250)); });
    expect(sheet.style.translate).toBe('');
    expect(close).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(pointer('pointermove', 1, 130)); });
    expect(sheet.style.translate).toBe('0 30px');
    act(() => { window.dispatchEvent(pointer('pointercancel', 1, 130)); });
    expect(sheet.style.translate).toBe('');
    expect(close).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(pointer('pointermove', 1, 400)); });
    expect(sheet.style.translate).toBe('');
    view.unmount();
  });

  it('a short drag held still before release springs back rather than reusing stale flick velocity', () => {
    const close = vi.fn();
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const drag = useSheetDrag(ref, close);
      return <div ref={ref} data-testid="paused-sheet"><header onPointerDown={drag.onPointerDown}>Handle</header></div>;
    }
    const view = render(<Harness />);
    const sheet = view.getByTestId('paused-sheet');
    const pointer = (type: string, y: number, time: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
      Object.defineProperties(event, { pointerId: { value: 1 }, timeStamp: { value: time } });
      return event;
    };
    act(() => { sheet.querySelector('header')!.dispatchEvent(pointer('pointerdown', 100, 100)); window.dispatchEvent(pointer('pointermove', 135, 120)); });
    expect(sheet.style.translate).toBe('0 35px');
    act(() => { window.dispatchEvent(pointer('pointerup', 135, 470)); });
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe('');
    view.unmount();
  });

  it('releases on an overlay unmount rather than leaving the document frozen', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const view = render(<OverlayScrollLock />);
    expect(document.body.style.position).toBe('fixed');
    view.unmount();
    expect(document.body.style.position).not.toBe('fixed');
  });

  it('gives nested modals distinct accessible title IDs', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const view = render(<><Modal open title="Outer" onClose={() => {}} /><Modal open title="Inner" onClose={() => {}} /></>);
    const dialogs = Array.from(document.querySelectorAll('dialog'));
    const ids = dialogs.map(d => d.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    expect(ids.map(id => document.getElementById(id!)?.textContent)).toEqual(['Outer', 'Inner']);
    view.unmount();
  });

  it('holds content and the scroll lock through exit, and an old exit cannot close a reopened modal', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const animation = { onfinish: null as null | (() => void), cancel: vi.fn() };
    const animate = vi.fn(() => animation);
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    try {
      const view = render(<Modal open title="Editor" onClose={() => {}}>Saved context</Modal>);
      const dialog = document.querySelector('dialog')!;
      view.rerender(<Modal open={false} title="Editor" onClose={() => {}}>Saved context</Modal>);
      const stale = animation.onfinish!;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('Saved context');
      expect(document.body.style.position).toBe('fixed');
      view.rerender(<Modal open title="Editor" onClose={() => {}}>Saved context</Modal>);
      expect(animation.cancel).toHaveBeenCalled();
      act(() => stale());
      expect(dialog.open).toBe(true);
      view.rerender(<Modal open={false} title="Editor" onClose={() => {}}>Saved context</Modal>);
      act(() => animation.onfinish?.());
      expect(dialog.open).toBe(false);
      expect(document.body.style.position).not.toBe('fixed');
      view.unmount();
    } finally {
      if (original) HTMLElement.prototype.animate = original;
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
});
