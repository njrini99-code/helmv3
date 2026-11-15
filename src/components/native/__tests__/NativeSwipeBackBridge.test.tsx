// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeSwipeBackBridge } from '../NativeSwipeBackBridge';

const postMessage = vi.fn();

afterEach(() => {
  delete (window as unknown as { webkit?: unknown }).webkit;
  postMessage.mockClear();
  document.body.innerHTML = '';
});

describe('NativeSwipeBackBridge (MOT-13)', () => {
  it('does nothing outside the iOS app', () => {
    expect(() => render(<NativeSwipeBackBridge />)).not.toThrow();
  });

  it('reports an open sheet and its close to the helmNav handler', async () => {
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { helmNav: { postMessage } } };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => window.setTimeout(() => cb(0), 0));
    const tick = () => new Promise((r) => setTimeout(r, 5));
    render(<NativeSwipeBackBridge />);
    expect(postMessage).toHaveBeenLastCalledWith({ overlayOpen: false });

    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('data-state', 'open');
    await act(async () => {
      document.body.appendChild(sheet);
      await tick();
    });
    expect(postMessage).toHaveBeenLastCalledWith({ overlayOpen: true });

    await act(async () => {
      sheet.setAttribute('data-state', 'closed');
      await tick();
    });
    expect(postMessage).toHaveBeenLastCalledWith({ overlayOpen: false });
  });
});
