import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Ask composer's text box fits its text (Composer.tsx). It measures again when the text wraps differently with no
 * new text: the iPhone's Text Size landing on <html> after the box first measured (Dynamic Type), or a new width.
 * jsdom has no layout, so the box's scrollHeight and width are what each test says they are.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { ToastProvider } from '../../../../ui/Toast';
import { AskComposer } from '../Composer';

let scrollH = 40;
let width = 300;
let resized: (() => void) | null = null;
const disconnect = vi.fn();

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const show = () =>
  render(
    <ToastProvider>
      <AskComposer variant="dock" phone players={[]} busy={false} failed={false} blocked={false} onSend={vi.fn()} onStop={vi.fn()} />
    </ToastProvider>,
  );

beforeEach(() => {
  scrollH = 40;
  width = 300;
  resized = null;
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollH);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--ch-type-scale');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Ask composer fits its text again when it wraps differently', () => {
  it('measures again when the iPhone’s Text Size lands on <html> after the first fit', async () => {
    show();
    expect(box().style.height).toBe('40px');
    scrollH = 62;
    document.documentElement.style.setProperty('--ch-type-scale', '1.353');
    await vi.waitFor(() => expect(box().style.height).toBe('62px'));
  });

  it('ignores other style writes on <html>: no new size, no new measure', async () => {
    show();
    scrollH = 62;
    document.documentElement.style.setProperty('overflow', 'hidden');
    // A macrotask: every MutationObserver callback for that write has run by then.
    await new Promise((done) => setTimeout(done, 0));
    expect(box().style.height).toBe('40px');
    document.documentElement.style.removeProperty('overflow');
  });

  it('measures again on a new width, not on the height it set itself, and stops observing on unmount', () => {
    const { unmount } = show();
    scrollH = 62;
    resized?.();
    expect(box().style.height).toBe('40px');
    width = 240;
    resized?.();
    expect(box().style.height).toBe('62px');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
